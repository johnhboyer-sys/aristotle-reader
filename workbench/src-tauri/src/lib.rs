mod assist;
mod packs;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Emitter};

/// How long ⌘Q waits for the frontend to save before quitting anyway.
const QUIT_SAVE_TIMEOUT: Duration = Duration::from_secs(5);

/// Called by the frontend once every open editor has saved (src/lib/quit.ts).
#[tauri::command]
fn quit_now(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        // macOS's built-in Quit ends the app with no chance to save, so the
        // last edit — still inside the autosave debounce — was lost. Our own
        // ⌘Q item asks the frontend to save, then quits; if the frontend
        // never answers, it quits anyway after QUIT_SAVE_TIMEOUT.
        .menu(|handle| {
            let menu = Menu::default(handle)?;
            #[cfg(target_os = "macos")]
            if let Some(app_menu) = menu.items()?.first().and_then(|k| k.as_submenu().cloned()) {
                if let Some(builtin_quit) = app_menu.items()?.last().cloned() {
                    app_menu.remove(&builtin_quit)?;
                }
                let quit = MenuItem::with_id(
                    handle,
                    "quit",
                    format!("Quit {}", handle.package_info().name),
                    true,
                    Some("CmdOrCtrl+Q"),
                )?;
                app_menu.append(&quit)?;
            }
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                if app.emit("quit-requested", ()).is_err() {
                    app.exit(0);
                    return;
                }
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(QUIT_SAVE_TIMEOUT);
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            quit_now,
            assist::assist_which,
            assist::assist_run,
            assist::run_program,
            packs::install_lexicon_pack,
            packs::list_lexicon_packs,
            packs::remove_lexicon_pack
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
