//! Persisted settings, at `%APPDATA%/Mote/config.json`.
//!
//! The path is derived from `config_dir()`, never hardcoded — the store plugin
//! would otherwise resolve relative paths against the bundle identifier and put
//! this in `%APPDATA%/com.bubble.app`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::bubble::Point;

const FILE: &str = "config.json";
const KEY: &str = "settings";

/// Notes live beside the config rather than inside it. The config is small,
/// structured, and read on every startup; a notes buffer is unbounded user text
/// and has no business being parsed as part of it.
const NOTES_FILE: &str = "notes.json";
const NOTES_KEY: &str = "text";

/// Written just before an update installs, read once on the next boot to show
/// the "Updated to x.y.z" card, then deleted — so it never fires a second time
/// on an ordinary launch. Its own file for the same reason notes get one: this
/// is written from a completely different moment in the app's life than the
/// rest of `Settings`, right before the process is about to be replaced.
const PENDING_UPDATE_FILE: &str = "pending-update.json";
const PENDING_UPDATE_KEY: &str = "pending";

pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+Space";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Bubble centre in physical px. Clamped to the work area on load, so a
    /// monitor that has since disappeared can't strand the bubble off-screen.
    pub position: Option<Point>,
    pub hotkey: String,
    pub autostart: bool,
    /// Unused in v1. Present so the schema doesn't have to change later.
    pub license: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            position: None,
            hotkey: DEFAULT_HOTKEY.to_string(),
            autostart: false,
            license: None,
        }
    }
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .config_dir()
        .map_err(|e| e.to_string())?
        .join("Mote"))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(FILE))
}

/// Never fails: a missing or corrupt config falls back to defaults rather than
/// blocking startup.
pub fn load(app: &AppHandle) -> Settings {
    let read = || -> Result<Settings, String> {
        let store = app.store(config_path(app)?).map_err(|e| e.to_string())?;
        let value = store
            .get(KEY)
            .ok_or_else(|| "no settings yet".to_string())?;
        serde_json::from_value(value).map_err(|e| e.to_string())
    };
    read().unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app.store(config_path(app)?).map_err(|e| e.to_string())?;
    store.set(
        KEY,
        serde_json::to_value(settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    load(&app)
}

/// Apply and persist a settings change.
///
/// Position is *not* taken from the caller — it is owned by the drag and
/// written on settle, and letting the settings panel round-trip it would let a
/// stale value overwrite where the bubble actually is.
///
/// `async` so it stays off the main thread: registering a shortcut and toggling
/// autostart both touch the OS, and a sync command runs inside the event loop.
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    hotkey: String,
    autostart: bool,
) -> Result<Settings, String> {
    let mut settings = load(&app);

    if hotkey != settings.hotkey {
        apply_hotkey(&app, &settings.hotkey, &hotkey)?;
        settings.hotkey = hotkey;
    }

    if autostart != settings.autostart {
        apply_autostart(&app, autostart)?;
        settings.autostart = autostart;
    }

    save(&app, &settings)?;
    Ok(settings)
}

/// Swap the global shortcut, leaving the old one in place if the new one is
/// unusable — another app may already own it, and a settings dialog that
/// silently unbinds your hotkey is worse than one that refuses the change.
#[cfg(desktop)]
fn apply_hotkey(app: &AppHandle, current: &str, next: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let parsed: Shortcut = next
        .parse()
        .map_err(|_| format!("{next:?} is not a valid shortcut"))?;

    if let Ok(old) = current.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(old);
    }

    if let Err(e) = app.global_shortcut().register(parsed) {
        // Put the old one back so the user is not left with no hotkey at all.
        if let Ok(old) = current.parse::<Shortcut>() {
            let _ = app.global_shortcut().register(old);
        }
        return Err(format!("could not register {next:?}: {e}"));
    }
    Ok(())
}

#[cfg(not(desktop))]
fn apply_hotkey(_: &AppHandle, _: &str, _: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

#[cfg(not(desktop))]
fn apply_autostart(_: &AppHandle, _: bool) -> Result<(), String> {
    Ok(())
}

/// Written when the bubble comes to rest, not while it moves.
#[tauri::command]
pub fn save_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let mut settings = load(&app);
    settings.position = Some(Point { x, y });
    save(&app, &settings)
}

/// Never fails: an unreadable notes file yields an empty buffer rather than
/// blocking the panel from opening.
#[tauri::command]
pub fn get_notes(app: AppHandle) -> String {
    let read = || -> Result<String, String> {
        let store = app
            .store(config_dir(&app)?.join(NOTES_FILE))
            .map_err(|e| e.to_string())?;
        let value = store
            .get(NOTES_KEY)
            .ok_or_else(|| "no notes yet".to_string())?;
        serde_json::from_value(value).map_err(|e| e.to_string())
    };
    read().unwrap_or_default()
}

/// Debounced by the frontend, not here — this writes the file every time it is
/// called, and a keystroke-rate write would hammer the disk.
#[tauri::command]
pub fn save_notes(app: AppHandle, text: String) -> Result<(), String> {
    let store = app
        .store(config_dir(&app)?.join(NOTES_FILE))
        .map_err(|e| e.to_string())?;
    store.set(NOTES_KEY, serde_json::Value::String(text));
    store.save().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingUpdate {
    pub from_version: String,
    pub to_version: String,
}

/// Called right before `install()`, so the flag is on disk even if the process
/// is replaced a moment later and never gets to run any more JS.
#[tauri::command]
pub fn mark_update_pending(app: AppHandle, to_version: String) -> Result<(), String> {
    let pending = PendingUpdate {
        from_version: app.package_info().version.to_string(),
        to_version,
    };
    let store = app
        .store(config_dir(&app)?.join(PENDING_UPDATE_FILE))
        .map_err(|e| e.to_string())?;
    store.set(
        PENDING_UPDATE_KEY,
        serde_json::to_value(&pending).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

/// Read-and-clear: called once at startup. Returns `None` on an ordinary
/// launch, which is the common case, so a missing file is not an error.
#[tauri::command]
pub fn take_pending_update(app: AppHandle) -> Option<PendingUpdate> {
    let store = app
        .store(config_dir(&app).ok()?.join(PENDING_UPDATE_FILE))
        .ok()?;
    let value = store.get(PENDING_UPDATE_KEY)?;
    store.delete(PENDING_UPDATE_KEY);
    let _ = store.save();
    serde_json::from_value(value).ok()
}
