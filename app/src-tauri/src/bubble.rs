//! Window geometry for the bubble.
//!
//! Two rules hold the whole thing together:
//!
//! 1. **The window is always centred on the bubble.** It is square, so the
//!    bubble's screen position is `window.topLeft + WINDOW/2` and nothing else.
//! 2. **The window never changes size.** It is always big enough for the open
//!    arc, even while collapsed.
//!
//! Rule 2 was learned the hard way. The window used to be 96×96 collapsed and
//! 360×360 expanded, which meant opening moved the top-left by (-132,-132) *and*
//! resized. The move/resize is one atomic `SetWindowPos`, but the webview
//! re-laying out the centred bubble to its new in-window position is a separate
//! asynchronous paint, and the two cannot be synchronised — so opening flashed
//! a blank frame. A window that never resizes has nothing to re-lay out, so the
//! bubble simply cannot flinch. Note this is *not* the fullscreen overlay the
//! spec rules out: it is still sized to the content, just to the largest content
//! rather than the current content.
//!
//! The cost is that a transparent window blocks clicks across its whole
//! rectangle, and that rectangle is large. `start_hit_testing` below pays it
//! back by making the window click-through except where it is actually drawn.
//!
//! Positions crossing the IPC boundary are **physical** pixels. The frontend
//! divides by `scaleFactor` when it needs CSS space (arc radius, layout).

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State, WebviewWindow};

use crate::win::{self, PhysRect};

/// Logical size of the one and only window. Sized to the largest thing that can
/// ever be drawn in it — not the arc (which needs ~280) but a tool panel opened
/// to one side of the bubble. Mirrors `WINDOW_SIZE` in src/lib/constants.ts and
/// the width/height in tauri.conf.json; `panel.test.ts` asserts panels fit.
pub const WINDOW: f64 = 600.0;

/// The bubble's own visual footprint: a 64px disc plus room for the hover ring
/// and press scale. The window is far larger, so this — not the window — is what
/// the bubble is clamped by, or it could never reach a screen edge.
pub const BUBBLE_BOX: f64 = 96.0;

/// Logical radius around the bubble centre that accepts clicks while the menu is
/// closed. Matches the hover ring, which is the largest thing ever drawn at
/// rest; everything beyond it is empty transparent window and belongs to
/// whatever is behind.
const HIT_RADIUS: f64 = 40.0;

/// How often the cursor is sampled for hit-testing. 16ms keeps the lag between
/// crossing the disc boundary and the window accepting clicks under one frame.
const HIT_POLL: Duration = Duration::from_millis(16);

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// The monitor under an arbitrary point — used to resolve where a flick lands
/// when its momentum carries it onto a different screen.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaInfo {
    pub work_area: PhysRect,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Env {
    /// Bubble centre, physical px on the virtual desktop.
    pub center: Point,
    /// Work area of the monitor under the bubble, physical px, taskbar excluded.
    pub work_area: PhysRect,
    pub scale_factor: f64,
    /// The whole window is accepting clicks, because something is open in it.
    pub interactive: bool,
}

#[derive(Default)]
pub struct BubbleState {
    /// Something beyond the bare disc is on screen — the arc, a tool panel — so
    /// the whole window accepts clicks. The empty part of it is not wasted: it
    /// is the click-outside target that dismisses whatever is open.
    interactive: AtomicBool,
    /// Cursor-minus-centre at the moment the drag started. Latched here rather
    /// than in the frontend so no frame can be measured against a stale centre.
    grab: Mutex<Point>,
}

/// The bubble window's HWND, cached after the first successful read. The handle
/// is stable for the window's lifetime, so this only has to succeed once.
///
/// It is *not* available during `setup()` — that runs before the event loop,
/// and Tauri's window accessors dispatch into that loop. Everything that needs
/// this handle must therefore run after the app is up. See `place_when_ready`.
static BUBBLE_HWND: AtomicIsize = AtomicIsize::new(0);

fn raw_hwnd(window: &WebviewWindow) -> Result<isize, String> {
    let cached = BUBBLE_HWND.load(Ordering::Relaxed);
    if cached != 0 {
        return Ok(cached);
    }
    let raw = window.hwnd().map_err(|e| format!("no hwnd: {e}"))?.0 as isize;
    BUBBLE_HWND.store(raw, Ordering::Relaxed);
    Ok(raw)
}

fn current_center(window: &WebviewWindow) -> Result<Point, String> {
    let raw = raw_hwnd(window)?;
    let r = win::window_rect(raw).ok_or_else(|| "could not read window rect".to_string())?;
    Ok(Point {
        x: r.x + r.width / 2.0,
        y: r.y + r.height / 2.0,
    })
}

/// Place the window so its centre lands exactly on `center`, in one atomic call.
///
/// The size never varies, so this is a pure move — which is precisely why it is
/// smooth. `SetWindowPos` still carries the size because passing the same values
/// costs nothing and keeps a single code path.
fn place(window: &WebviewWindow, center: Point) -> Result<(), String> {
    let raw = raw_hwnd(window)?;
    let scale = win::scale_factor(raw);
    let side = (WINDOW * scale).round() as i32;

    win::set_window_rect(
        raw,
        (center.x - side as f64 / 2.0).round() as i32,
        (center.y - side as f64 / 2.0).round() as i32,
        side,
        side,
    );

    Ok(())
}

/// Keep the bubble — not the window — inside the work area. The window is much
/// larger than the bubble and mostly empty, so clamping by the window would stop
/// the bubble a long way short of any edge.
fn clamp_center(center: Point, area: &PhysRect, side: f64) -> Point {
    let half = side / 2.0;
    let (min_x, max_x) = (area.x + half, area.x + area.width - half);
    let (min_y, max_y) = (area.y + half, area.y + area.height - half);
    Point {
        x: if min_x > max_x {
            area.x + area.width / 2.0
        } else {
            center.x.clamp(min_x, max_x)
        },
        y: if min_y > max_y {
            area.y + area.height / 2.0
        } else {
            center.y.clamp(min_y, max_y)
        },
    }
}

fn env_for(window: &WebviewWindow, state: &BubbleState) -> Result<Env, String> {
    let raw = raw_hwnd(window)?;
    let center = current_center(window)?;
    let work_area = win::work_area_at(center.x, center.y)
        .ok_or_else(|| "could not read monitor work area".to_string())?;
    Ok(Env {
        center,
        work_area,
        scale_factor: win::scale_factor(raw),
        interactive: state.interactive.load(Ordering::Relaxed),
    })
}

#[tauri::command]
pub fn bubble_env(window: WebviewWindow, state: State<'_, BubbleState>) -> Result<Env, String> {
    env_for(&window, &state)
}

#[tauri::command]
pub fn cursor_pos() -> Point {
    let (x, y) = win::cursor_pos();
    Point { x, y }
}

#[tauri::command]
pub fn work_area_at(x: f64, y: f64) -> Result<AreaInfo, String> {
    Ok(AreaInfo {
        work_area: win::work_area_at(x, y)
            .ok_or_else(|| "could not read monitor work area".to_string())?,
        scale_factor: win::scale_factor_at(x, y),
    })
}

/// Bring the bubble to the cursor.
///
/// If it was hidden there is nothing to animate from, so it is placed and
/// revealed outright. If it was already on screen the frontend springs it
/// across, which reads as the object travelling rather than teleporting.
#[tauri::command]
pub fn summon(window: WebviewWindow, state: State<'_, BubbleState>) -> Result<Env, String> {
    let (cx, cy) = win::cursor_pos();
    let area = win::work_area_at(cx, cy).ok_or_else(|| "no monitor".to_string())?;
    let side = BUBBLE_BOX * win::scale_factor_at(cx, cy);
    let target = clamp_center(Point { x: cx, y: cy }, &area, side);

    let was_hidden = !window.is_visible().unwrap_or(true);
    if was_hidden {
        place(&window, target)?;
        window.show().map_err(|e| e.to_string())?;
    }

    let mut env = env_for(&window, &state)?;
    // Report where it should end up, not where it is.
    env.center = target;
    Ok(env)
}

/// Latch where inside the bubble the user grabbed. Respecting that offset is
/// what makes a drag feel like holding an object rather than the object
/// teleporting to the cursor.
#[tauri::command]
pub fn start_drag(window: WebviewWindow, state: State<'_, BubbleState>) -> Result<Env, String> {
    let center = current_center(&window)?;
    let (cx, cy) = win::cursor_pos();
    *state.grab.lock().map_err(|_| "grab lock poisoned")? = Point {
        x: cx - center.x,
        y: cy - center.y,
    };
    env_for(&window, &state)
}

/// One frame of a drag. We read the cursor here rather than trusting webview
/// coordinates, which shift under us as the window moves.
///
/// Returns the full env, not just the centre: dragging is exactly when the
/// bubble can cross onto another monitor, and the caller needs the new work
/// area and scale the instant that happens — not one round-trip later.
#[tauri::command]
pub fn drag_tick(window: WebviewWindow, state: State<'_, BubbleState>) -> Result<Env, String> {
    let grab = *state.grab.lock().map_err(|_| "grab lock poisoned")?;
    let (cx, cy) = win::cursor_pos();
    let center = Point {
        x: cx - grab.x,
        y: cy - grab.y,
    };
    place(&window, center)?;
    env_for(&window, &state)
}

#[tauri::command]
pub fn set_center(
    window: WebviewWindow,
    _state: State<'_, BubbleState>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    place(&window, Point { x, y })
}

/// Tell the backend that something is open in the window — the arc, a tool
/// panel — so the whole rectangle should accept clicks.
///
/// Deliberately does not touch the window's geometry; that is the whole point of
/// the fixed-size window. All it changes is hit-testing, and the empty area
/// around whatever is open becomes the click-outside target.
#[tauri::command]
pub fn set_interactive(
    window: WebviewWindow,
    state: State<'_, BubbleState>,
    interactive: bool,
) -> Result<Env, String> {
    state.interactive.store(interactive, Ordering::Relaxed);
    env_for(&window, &state)
}

/// First paint: drop the bubble on the right edge of the primary work area,
/// vertically centred, then reveal the window.
///
/// Called by the frontend once it has mounted, *not* from `setup()`. The
/// window's HWND is not reliably available before the event loop is running —
/// `setup()` intermittently failed with "the underlying handle is not
/// available", and since every geometry call needs that handle, the window
/// silently stayed wherever Tauri had put it. Doing this from a command also
/// means the window is only revealed once there is something painted in it.
fn place_initial(window: &WebviewWindow) -> Result<Env, String> {
    let state = window.state::<BubbleState>();
    let saved = crate::settings::load(&window.app_handle().clone()).position;

    // Resolve the work area around the saved point, so a bubble parked on a
    // second monitor comes back to that monitor rather than the primary.
    let anchor = saved.unwrap_or(Point { x: 0.0, y: 0.0 });
    let area = win::work_area_at(anchor.x, anchor.y).ok_or_else(|| "no monitor".to_string())?;
    let side = BUBBLE_BOX * win::scale_factor_at(anchor.x, anchor.y);

    let center = clamp_center(
        saved.unwrap_or(Point {
            x: area.x + area.width - side / 2.0,
            y: area.y + area.height / 2.0,
        }),
        &area,
        side,
    );

    place(window, center)?;
    env_for(window, &state)
}

/// Make the window click-through everywhere it isn't drawing anything.
///
/// The window is 360×360 and mostly empty, and a transparent Win32 window
/// swallows clicks across its whole rectangle — so without this, parking the
/// bubble in a corner would blank out a 360px square of the desktop.
///
/// This has to be a cursor poll. The obvious alternative, handling
/// `WM_NCHITTEST` and returning `HTTRANSPARENT`, does not work: the WebView2
/// child window covers the client area and hit-testing resolves against the
/// child, never consulting our parent's handler. And once the window *is*
/// click-through it receives no mouse messages at all, so the webview cannot
/// report that the cursor came back — only an outside observer can.
///
/// Cost is kept low by doing the sampling entirely in Win32 on a background
/// thread (`GetCursorPos` and `GetWindowRect` need no main thread) and only
/// dispatching when the answer actually flips, which is a handful of times a
/// second at worst and never while the cursor sits still.
fn start_hit_testing(window: WebviewWindow) {
    static RUNNING: AtomicBool = AtomicBool::new(false);
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        // Unknown rather than false, so the first pass always applies a state
        // instead of trusting the window to have started interactive.
        let mut applied: Option<bool> = None;

        loop {
            std::thread::sleep(HIT_POLL);

            let raw = BUBBLE_HWND.load(Ordering::Relaxed);
            if raw == 0 {
                continue;
            }

            let state = window.state::<BubbleState>();
            let want_ignore = if state.interactive.load(Ordering::Relaxed) {
                false
            } else {
                match win::window_rect(raw) {
                    // The bubble sits at the centre of the window, always.
                    Some(r) => {
                        let cx = r.x + r.width / 2.0;
                        let cy = r.y + r.height / 2.0;
                        let (mx, my) = win::cursor_pos();
                        let radius = HIT_RADIUS * win::scale_factor(raw);
                        (mx - cx).hypot(my - cy) > radius
                    }
                    // Can't tell where we are; erring toward interactive keeps
                    // the bubble usable rather than making it inert.
                    None => false,
                }
            };

            if applied == Some(want_ignore) {
                continue;
            }
            if let Err(e) = window.set_ignore_cursor_events(want_ignore) {
                eprintln!("bubble: set_ignore_cursor_events failed: {e}");
                continue;
            }
            applied = Some(want_ignore);
        }
    });
}

/// The frontend has mounted — position the bubble.
///
/// This is the *only* place initial placement happens, and it took a while to
/// get here. It cannot go in `setup()`: that runs before the event loop, so the
/// window handle isn't available and Tauri's window calls have nothing to
/// dispatch to. It also cannot be driven from a background thread polling
/// `run_on_main_thread`, which starves the very loop that creates the window —
/// the OS window then never gets created at all. A command invoked by the
/// running webview is by definition late enough for all of it to work.
#[tauri::command]
pub fn bubble_ready(window: WebviewWindow, state: State<'_, BubbleState>) -> Result<Env, String> {
    let env = place_initial(&window)
        .or_else(|_| env_for(&window, &state))
        .map_err(|e| format!("bubble_ready: {e}"))?;

    // Only now, with the event loop up and the HWND cached. Starting this from
    // `setup()` would have the same problem initial placement does.
    start_hit_testing(window);

    Ok(env)
}
