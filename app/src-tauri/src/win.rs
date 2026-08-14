//! Thin Win32 helpers.
//!
//! Two things the cross-platform API can't give us:
//!   * an *atomic* move+resize, so the bubble never lands on screen at a stale
//!     position for a frame while expanding;
//!   * the monitor work area (taskbar excluded) in physical pixels.

use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
};

/// Physical-pixel rectangle. Origin is the virtual desktop, so `x`/`y` can be
/// negative on multi-monitor setups.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn hwnd_from_raw(raw: isize) -> HWND {
    HWND(raw as *mut core::ffi::c_void)
}

// Note: finding our window by title with EnumWindows was tried and removed. A
// Tauri process owns several top-level windows — a global-hotkey message
// window, tao's "Tao Thread Event Target", an IME window — and none of them
// carries the configured title, so the lookup either missed or matched a helper
// window and moved that instead. The handle comes from Tauri now, once the
// event loop is up.

/// Move and resize in a single `SetWindowPos` call. Anything split across
/// `set_size` + `set_position` gives the compositor a chance to present the
/// in-between state.
pub fn set_window_rect(raw: isize, x: i32, y: i32, width: i32, height: i32) {
    unsafe {
        let _ = SetWindowPos(
            hwnd_from_raw(raw),
            None,
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }
}

// Note: clipping the window to its inscribed circle with SetWindowRgn — to hand
// the square's corners back to whatever is behind them — does not work here and
// has been removed. A transparent Tauri window renders through
// DirectComposition (WS_EX_NOREDIRECTIONBITMAP), so a window region applies to a
// redirection surface that doesn't exist; the result is a window that paints
// nothing at all. Per-pixel click-through needs cursor polling plus
// setIgnoreCursorEvents instead. See IDEAS.md.

/// Work area (taskbar excluded) of the monitor containing `point`, in physical
/// pixels. Falls back to the nearest monitor when the point is off-desktop.
pub fn work_area_at(x: f64, y: f64) -> Option<PhysRect> {
    unsafe {
        let monitor = MonitorFromPoint(
            POINT {
                x: x.round() as i32,
                y: y.round() as i32,
            },
            MONITOR_DEFAULTTONEAREST,
        );
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        Some(rect_to_phys(info.rcWork))
    }
}

fn rect_to_phys(r: RECT) -> PhysRect {
    PhysRect {
        x: r.left as f64,
        y: r.top as f64,
        width: (r.right - r.left) as f64,
        height: (r.bottom - r.top) as f64,
    }
}

/// Current outer rect in physical pixels.
///
/// Deliberately not `WebviewWindow::outer_position()`/`outer_size()`: those
/// round-trip through the webview and fail with "failed to receive message from
/// webview" before the event loop is running — which is exactly when we place
/// the window. `GetWindowRect` reads the same state `SetWindowPos` writes.
pub fn window_rect(raw: isize) -> Option<PhysRect> {
    let mut r = RECT::default();
    unsafe {
        if GetWindowRect(hwnd_from_raw(raw), &mut r).is_err() {
            return None;
        }
    }
    Some(rect_to_phys(r))
}

/// Cursor position in physical pixels on the virtual desktop.
pub fn cursor_pos() -> (f64, f64) {
    let mut p = POINT::default();
    unsafe {
        if GetCursorPos(&mut p).is_err() {
            return (0.0, 0.0);
        }
    }
    (p.x as f64, p.y as f64)
}

/// DPI scale of the monitor containing `point` (1.0 = 96 dpi).
///
/// Needed because a flick can project onto a second monitor with a different
/// scale factor, and the landing spot has to be computed in that monitor's
/// terms, not the one the bubble is leaving.
pub fn scale_factor_at(x: f64, y: f64) -> f64 {
    unsafe {
        let monitor = MonitorFromPoint(
            POINT {
                x: x.round() as i32,
                y: y.round() as i32,
            },
            MONITOR_DEFAULTTONEAREST,
        );
        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        if GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_err()
            || dpi_x == 0
        {
            return 1.0;
        }
        dpi_x as f64 / 96.0
    }
}

/// DPI scale of the monitor the window currently sits on (1.0 = 96 dpi).
pub fn scale_factor(raw: isize) -> f64 {
    let dpi = unsafe { GetDpiForWindow(hwnd_from_raw(raw)) };
    if dpi == 0 {
        1.0
    } else {
        dpi as f64 / 96.0
    }
}
