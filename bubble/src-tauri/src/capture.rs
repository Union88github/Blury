//! Screen capture.
//!
//! The ordering here is the whole trick, and getting it backwards is how this
//! kind of tool usually ships broken:
//!
//! 1. Hide the bubble, or it ends up in the picture.
//! 2. **Capture every monitor first**, while the screen is untouched.
//! 3. Only then show the overlays, which draw the dimming and the selection
//!    rectangle *on top of the frozen frame*. Dimming first would bake the dim
//!    into the saved image.
//!
//! Everything in here is physical pixels. Each monitor is captured and cropped
//! in its own physical space, so a 150%-scaled second monitor crops correctly
//! rather than being off by its scale factor — the frontend converts its CSS
//! selection to physical px before it ever reaches this module.

use std::io::Cursor;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image::RgbaImage;
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::win;

/// A monitor's frozen frame plus where it lives on the virtual desktop.
struct Frame {
    x: i32,
    y: i32,
    scale: f64,
    image: RgbaImage,
}

/// The in-flight capture. `None` whenever no capture is running, which is also
/// what makes a stray `finish_capture` harmless.
static FRAMES: Mutex<Option<Vec<Frame>>> = Mutex::new(None);

/// How many overlays have actually become **visible**.
///
/// Counting `overlay_ready` instead was a mistake worth remembering: an overlay
/// can position itself and still never show, and the watchdog then stood down
/// while the screen stayed empty and the bubble stayed hidden. The only state
/// worth watching is the one the user can see.
static SHOWN: AtomicUsize = AtomicUsize::new(0);

/// How long a capture gets to put something on screen before it is abandoned.
///
/// The failure this guards against is silent and total: the bubble is hidden for
/// the capture, so if no overlay appears, the app vanishes with no way back
/// short of the tray. Every exit from a capture must restore the bubble,
/// including the exits nobody planned.
const OVERLAY_DEADLINE: Duration = Duration::from_secs(6);

/// What an overlay needs to lay itself out: its monitor's physical rect and
/// scale, so it can convert its own CSS-space selection back to physical px.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShotInfo {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

fn overlay_label(index: usize) -> String {
    format!("capture-{index}")
}

/// Debug-only trace to `%TEMP%/bubble-capture.log`.
///
/// `tauri dev` does not pass the app's stderr through to its own output, so
/// `eprintln!` from here reaches nobody. A capture spans the backend, three
/// commands and a second webview, and when it fails it fails invisibly — with
/// the bubble hidden — so there has to be somewhere to look.
pub fn trace(msg: &str) {
    if !cfg!(debug_assertions) {
        return;
    }
    use std::io::Write;
    let path = std::env::temp_dir().join("bubble-capture.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let _ = writeln!(f, "{t} {msg}");
    }
}

/// Lets the overlay's webview write into the same trace. Without it the
/// frontend half of a capture is invisible — there is no console to read.
#[tauri::command]
pub fn capture_log(message: String) {
    trace(&format!("[web] {message}"));
}

/// Begin a capture: freeze every screen, then raise an overlay over each.
///
/// **`async` is load-bearing.** A synchronous Tauri command runs *on the main
/// thread*, and creating a webview window from there is re-entrant: building it
/// needs the event loop to pump messages, and the event loop is what is
/// currently sitting in this function. It wedges — no panic, no crash, process
/// alive, main thread dead — and because the bubble has already been hidden by
/// then, the whole app simply disappears. `run_on_main_thread` does not save
/// you: it runs the closure inline when it is already on the main thread.
///
/// Being async puts this on the async runtime, so the scheduling below really
/// does queue onto the event loop and return.
#[tauri::command]
pub async fn begin_capture(app: AppHandle) -> Result<Vec<ShotInfo>, String> {
    // Re-entrancy: a second trigger while one is running would strand the first
    // set of overlays with no way to dismiss them.
    if FRAMES.lock().map_err(|_| "capture lock poisoned")?.is_some() {
        return Err("a capture is already running".into());
    }

    trace("begin_capture: entered");
    let bubble = app.get_webview_window("bubble");
    if let Some(w) = &bubble {
        let _ = w.hide();
    }
    trace("begin_capture: bubble hidden");
    // The bubble is always-on-top, so it is in the frame until the compositor
    // has actually presented without it. Nothing signals that, so we wait.
    std::thread::sleep(Duration::from_millis(90));

    let result = grab_all();
    trace(&format!(
        "begin_capture: grab_all -> {}",
        match &result {
            Ok(f) => format!("{} frame(s)", f.len()),
            Err(e) => format!("ERROR {e}"),
        }
    ));

    // Whatever happened, the bubble comes back if we are not proceeding.
    let frames = match result {
        Ok(f) if !f.is_empty() => f,
        Ok(_) => {
            restore_bubble(&app);
            return Err("no monitors to capture".into());
        }
        Err(e) => {
            restore_bubble(&app);
            return Err(e);
        }
    };

    let infos: Vec<ShotInfo> = frames
        .iter()
        .enumerate()
        .map(|(index, f)| ShotInfo {
            index,
            x: f.x,
            y: f.y,
            width: f.image.width(),
            height: f.image.height(),
            scale_factor: f.scale,
        })
        .collect();

    *FRAMES.lock().map_err(|_| "capture lock poisoned")? = Some(frames);
    SHOWN.store(0, Ordering::SeqCst);

    // One overlay per monitor. A single window spanning the virtual desktop
    // would have to pick one DPI for the whole thing, which is exactly the bug
    // this tool is supposed to avoid.
    //
    // Built on the main thread, and *not* waited on. Commands run on a worker
    // thread, and building a webview window from one blocks until the main
    // thread services it — which deadlocked here: the bubble was already
    // hidden, so the app simply vanished with no error and no trace. Queuing
    // the work and returning lets the command finish; the overlays report in
    // through `overlay_ready` when they are up.
    let queued = infos.clone();
    let creator = app.clone();
    trace("begin_capture: scheduling overlay creation");
    let scheduled = app.run_on_main_thread(move || {
        for info in &queued {
            // Build at roughly the right size and place. `overlay_ready` still
            // corrects it exactly in physical px, but starting near the target
            // means a webview that fails to report in leaves a stray window
            // over its own monitor rather than a default-sized box in a corner.
            let logical_w = info.width as f64 / info.scale_factor;
            let logical_h = info.height as f64 / info.scale_factor;

            match WebviewWindowBuilder::new(
                &creator,
                overlay_label(info.index),
                WebviewUrl::App("index.html".into()),
            )
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .inner_size(logical_w, logical_h)
            .position(
                info.x as f64 / info.scale_factor,
                info.y as f64 / info.scale_factor,
            )
            // Revealed by `overlay_show`, once its frozen frame has decoded.
            .visible(false)
            .build()
            {
                Ok(_) => trace(&format!("overlay {} built", info.index)),
                Err(e) => trace(&format!("overlay {} FAILED to build: {e}", info.index)),
            }
        }
    });

    if let Err(e) = scheduled {
        trace(&format!("begin_capture: could not schedule overlays: {e}"));
        cleanup(&app);
        return Err(format!("could not schedule capture overlays: {e}"));
    }

    trace(&format!("begin_capture: {} overlay(s) queued", infos.len()));
    watch_for_stuck_capture(app.clone());
    Ok(infos)
}

/// Abandon the capture if nothing reaches the screen — see `OVERLAY_DEADLINE`.
fn watch_for_stuck_capture(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(OVERLAY_DEADLINE);

        let running = FRAMES.lock().map(|g| g.is_some()).unwrap_or(false);
        if !running || SHOWN.load(Ordering::SeqCst) > 0 {
            return;
        }
        trace("watchdog: nothing became visible; restoring the bubble");
        cleanup(&app);
    });
}

fn grab_all() -> Result<Vec<Frame>, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("no monitors: {e}"))?;
    let mut frames = Vec::with_capacity(monitors.len());

    for m in monitors {
        let x = m.x().map_err(|e| e.to_string())?;
        let y = m.y().map_err(|e| e.to_string())?;
        let image = m.capture_image().map_err(|e| format!("capture failed: {e}"))?;
        // Ask Windows rather than xcap: this is the same value the frontend's
        // layout is scaled by, and mixing two sources of truth for DPI is how
        // mixed-scale setups end up off by 25%.
        let scale = win::scale_factor_at(x as f64 + 1.0, y as f64 + 1.0);
        frames.push(Frame { x, y, scale, image });
    }

    Ok(frames)
}

/// An overlay has mounted: put it exactly over its monitor, still hidden.
///
/// Position is applied in physical pixels through Win32 for the same reason the
/// bubble's is — Tauri's window accessors are unreliable before the webview is
/// up, and the overlay must land on the monitor it is showing.
///
/// Revealing is a separate step (`overlay_show`) so the window is never on
/// screen without its frozen frame decoded. Showing it here would flash an
/// empty fullscreen window over everything.
#[tauri::command]
pub fn overlay_ready(app: AppHandle, index: usize) -> Result<ShotInfo, String> {
    let guard = FRAMES.lock().map_err(|_| "capture lock poisoned")?;
    let frames = guard.as_ref().ok_or_else(|| "no capture running".to_string())?;
    let frame = frames.get(index).ok_or_else(|| "no such monitor".to_string())?;

    let info = ShotInfo {
        index,
        x: frame.x,
        y: frame.y,
        width: frame.image.width(),
        height: frame.image.height(),
        scale_factor: frame.scale,
    };
    drop(guard);

    let window = app
        .get_webview_window(&overlay_label(index))
        .ok_or_else(|| "overlay window vanished".to_string())?;
    let raw = window.hwnd().map_err(|e| format!("no hwnd: {e}"))?.0 as isize;

    win::set_window_rect(raw, info.x, info.y, info.width as i32, info.height as i32);
    trace(&format!(
        "overlay_ready {index}: placed at ({},{}) {}x{}",
        info.x, info.y, info.width, info.height
    ));

    Ok(info)
}

/// The frame is decoded and painted — now it is safe to show the overlay.
#[tauri::command]
pub fn overlay_show(app: AppHandle, index: usize) -> Result<(), String> {
    let window = app
        .get_webview_window(&overlay_label(index))
        .ok_or_else(|| "overlay window vanished".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    // Focus so the overlay receives Escape without the user clicking first.
    let _ = window.set_focus();
    SHOWN.fetch_add(1, Ordering::SeqCst);
    trace(&format!(
        "overlay_show {index}: shown, is_visible={:?}",
        window.is_visible()
    ));
    Ok(())
}

/// The frozen frame for one monitor, as **raw RGBA** — width and height come
/// from the `ShotInfo` the overlay already has.
///
/// Deliberately not PNG. The frame is going straight into a canvas in this same
/// process, so compressing it only to decode it again is wasted work — and in a
/// debug build, deflating a full-screen image takes long enough (tens of
/// seconds) that the overlay never appears and the app looks hung, with the
/// bubble hidden the whole time. Raw pixels are a few megabytes over an IPC
/// channel built for bytes, and `putImageData` is effectively free.
#[tauri::command]
pub fn capture_frame(index: usize) -> Result<tauri::ipc::Response, String> {
    let guard = FRAMES.lock().map_err(|_| "capture lock poisoned")?;
    let frames = guard.as_ref().ok_or_else(|| "no capture running".to_string())?;
    let frame = frames.get(index).ok_or_else(|| "no such monitor".to_string())?;

    let bytes = frame.image.as_raw().clone();
    trace(&format!("capture_frame {index}: {} bytes", bytes.len()));
    Ok(tauri::ipc::Response::new(bytes))
}

fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|e| format!("png encode failed: {e}"))?;
    Ok(out)
}

/// Crop the frozen frame, save it, and put it on the clipboard.
///
/// The rectangle is physical pixels **relative to this monitor's frame**, which
/// is what keeps mixed-DPI setups correct: the overlay has already converted
/// from its own CSS space using its own scale factor.
/// Async so the PNG encode, the disk write and the clipboard call happen off the
/// main thread — none of them belongs in the event loop.
#[tauri::command]
pub async fn finish_capture(
    app: AppHandle,
    index: usize,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let cropped = {
        let guard = FRAMES.lock().map_err(|_| "capture lock poisoned")?;
        let frames = guard.as_ref().ok_or_else(|| "no capture running".to_string())?;
        let frame = frames.get(index).ok_or_else(|| "no such monitor".to_string())?;

        // Trust nothing from the frontend: a crop outside the image would panic
        // inside `image`.
        let img = &frame.image;
        if width == 0 || height == 0 || x >= img.width() || y >= img.height() {
            return Err("selection is outside the captured frame".into());
        }
        let w = width.min(img.width() - x);
        let h = height.min(img.height() - y);
        image::imageops::crop_imm(img, x, y, w, h).to_image()
    };

    let path = save_png(&app, &cropped)?;
    // The file is the durable result, so a clipboard failure is reported but
    // must not lose the capture.
    if let Err(e) = to_clipboard(&cropped) {
        eprintln!("bubble: could not copy screenshot to clipboard: {e}");
    }

    cleanup(&app);
    Ok(path)
}

#[tauri::command]
pub fn cancel_capture(app: AppHandle) {
    cleanup(&app);
}

/// Close every overlay, drop the frames, and give the bubble back.
fn cleanup(app: &AppHandle) {
    let count = FRAMES
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|f| f.len()))
        .unwrap_or(0);

    for index in 0..count {
        if let Some(w) = app.get_webview_window(&overlay_label(index)) {
            let _ = w.close();
        }
    }
    if let Ok(mut g) = FRAMES.lock() {
        *g = None;
    }
    restore_bubble(app);
}

fn restore_bubble(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("bubble") {
        let _ = w.show();
    }
}

fn save_png(app: &AppHandle, image: &RgbaImage) -> Result<String, String> {
    let dir = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| format!("no place to save: {e}"))?
        .join("Blury");
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {dir:?}: {e}"))?;

    let path = dir.join(format!("blury-{}.png", timestamp()));
    std::fs::write(&path, encode_png(image)?)
        .map_err(|e| format!("could not write {path:?}: {e}"))?;

    Ok(path.to_string_lossy().into_owned())
}

fn to_clipboard(image: &RgbaImage) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: image.width() as usize,
            height: image.height() as usize,
            bytes: std::borrow::Cow::Borrowed(image.as_raw()),
        })
        .map_err(|e| e.to_string())
}

/// `YYYYMMDD-HHMMSS` in UTC.
///
/// Hand-rolled rather than pulling in a date crate for one filename. The
/// days-to-civil conversion is Howard Hinnant's, which is exact for any date
/// this will ever see.
fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (year, month, day) = civil_from_days(days);

    format!(
        "{year:04}{month:02}{day:02}-{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::{civil_from_days, grab_all};

    /// Exercises the whole backend pipeline — grab, crop, encode, save, copy —
    /// without any windows or synthetic input, so a failure here points at the
    /// capture itself rather than at the overlay UI.
    ///
    /// Ignored by default because it touches real hardware and the clipboard.
    /// Run it when a capture misbehaves with no visible cause:
    /// `cargo test -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn captures_crops_and_saves() {
        let frames = match grab_all() {
            Ok(f) => f,
            Err(e) => panic!("xcap could not capture: {e}"),
        };
        assert!(!frames.is_empty(), "no monitors reported");

        for (i, f) in frames.iter().enumerate() {
            println!(
                "monitor {i}: origin ({},{}) frame {}x{} scale {}",
                f.x,
                f.y,
                f.image.width(),
                f.image.height(),
                f.scale
            );
            assert!(f.image.width() > 0 && f.image.height() > 0, "empty frame");
            assert!(f.scale > 0.0, "nonsensical scale factor");
        }

        // Crop the same way `finish_capture` does.
        let frame = &frames[0];
        let (w, h) = (320u32.min(frame.image.width()), 180u32.min(frame.image.height()));
        let crop = image::imageops::crop_imm(&frame.image, 0, 0, w, h).to_image();
        assert_eq!((crop.width(), crop.height()), (w, h), "crop lost its size");

        let bytes = super::encode_png(&crop).expect("png encode");
        assert!(bytes.len() > 8, "suspiciously small png");
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n", "not a png");

        let out = std::env::temp_dir().join("bubble-pipeline-test.png");
        std::fs::write(&out, &bytes).expect("write png");
        println!("wrote {} bytes to {}", bytes.len(), out.display());

        match super::to_clipboard(&crop) {
            Ok(()) => println!("clipboard: ok"),
            Err(e) => panic!("clipboard failed: {e}"),
        }
    }

    #[test]
    fn converts_known_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        // A leap day, which is where naive implementations drift.
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(20_575), (2026, 5, 2));
    }
}
