mod bubble;
mod capture;
mod settings;
mod tray;
mod win;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::ShortcutState;

/// Emitted when the hotkey fires and the bubble is already on screen; the
/// frontend springs it to the reported centre.
#[cfg(desktop)]
const SUMMON_EVENT: &str = "bubble://summon";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        // Fire on press only; the release would summon twice.
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        summon(app);
                    })
                    .build(),
            )
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ));
    }

    builder
        .manage(bubble::BubbleState::default())
        .invoke_handler(tauri::generate_handler![
            bubble::bubble_ready,
            bubble::bubble_env,
            bubble::cursor_pos,
            bubble::work_area_at,
            bubble::start_drag,
            bubble::drag_tick,
            bubble::set_center,
            bubble::set_interactive,
            bubble::summon,
            settings::get_settings,
            settings::save_settings,
            settings::save_position,
            settings::get_notes,
            settings::save_notes,
            capture::begin_capture,
            capture::overlay_ready,
            capture::overlay_show,
            capture::capture_frame,
            capture::finish_capture,
            capture::cancel_capture,
            capture::capture_log,
        ])
        .setup(|app| {
            use tauri::Manager;
            let window = app
                .get_webview_window("bubble")
                .expect("bubble window missing from tauri.conf.json");

            // The window is created hidden so it never flashes at the default
            // position. Showing it here is what actually realises the OS window.
            if let Err(e) = window.show() {
                eprintln!("bubble: show failed: {e}");
            }

            if let Err(e) = tray::build(app.handle()) {
                eprintln!("bubble: tray icon failed: {e}");
            }

            #[cfg(desktop)]
            {
                register_hotkey(app.handle());
                sync_autostart(app.handle());
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// A bad hotkey in the config must not take the app down with it — fall back to
/// the default, and if that is also unavailable carry on without one.
#[cfg(desktop)]
fn register_hotkey(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let configured = settings::load(app).hotkey;
    let candidates = [configured.as_str(), settings::DEFAULT_HOTKEY];

    for candidate in candidates {
        let Ok(shortcut) = candidate.parse::<Shortcut>() else {
            eprintln!("bubble: could not parse hotkey {candidate:?}");
            continue;
        };
        match app.global_shortcut().register(shortcut) {
            Ok(()) => return,
            Err(e) => eprintln!("bubble: could not register hotkey {candidate:?}: {e}"),
        }
    }
}

/// Make the OS agree with the config.
///
/// The registry entry can be removed behind the app's back — by an uninstall,
/// a cleanup tool, or the user — so trusting the stored flag alone would leave
/// the settings panel claiming autostart is on when it isn't. Only written when
/// the two actually disagree.
#[cfg(desktop)]
fn sync_autostart(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;

    let want = settings::load(app).autostart;
    let manager = app.autolaunch();
    let is = manager.is_enabled().unwrap_or(false);
    if want == is {
        return;
    }
    let result = if want { manager.enable() } else { manager.disable() };
    if let Err(e) = result {
        eprintln!("bubble: could not sync autostart to {want}: {e}");
    }
}

#[cfg(desktop)]
fn summon(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};

    let Some(window) = app.get_webview_window("bubble") else {
        return;
    };
    let state = window.state::<bubble::BubbleState>();
    match bubble::summon(window.clone(), state) {
        Ok(env) => {
            let _ = app.emit(SUMMON_EVENT, env);
        }
        Err(e) => eprintln!("bubble: summon failed: {e}"),
    }
}
