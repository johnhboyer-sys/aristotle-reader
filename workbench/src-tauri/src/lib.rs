mod assist;
#[cfg(test)]
mod capability_tests;
mod commands;
mod jobs;
mod nav;
mod packs;
mod sandbox;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Emitter};

/// How long ⌘Q waits for the frontend to answer before quitting anyway.
const QUIT_SAVE_TIMEOUT: Duration = Duration::from_secs(5);

/// Each ⌘Q is numbered. When the frontend answers, it owns the quit (a failed
/// save keeps the app open), so the timeout for that ⌘Q and every earlier one
/// stands down. Numbering keeps a second ⌘Q from re-arming the first timeout.
static QUIT_REQUESTED: AtomicU64 = AtomicU64::new(0);
static QUIT_ACKED: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn quit_ack() {
    QUIT_ACKED.fetch_max(QUIT_REQUESTED.load(Ordering::SeqCst), Ordering::SeqCst);
}

/// Called by the frontend once every open editor has saved (src/lib/quit.ts).
#[tauri::command]
fn quit_now(app: AppHandle) {
    app.exit(0);
}

/// The fs plugin, and the plugin that brings the user's dialog picks back
/// after a restart (it must come after fs). Shared with the capability tests
/// (capability_tests.rs), so they test the app's own wiring. $APPDATA is
/// created here because the window may not name it — not even to mkdir it
/// (capabilities/default.json).
fn with_fs_plugins<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            Ok(())
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_fs_plugins(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(nav::init())
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
                let request = QUIT_REQUESTED.fetch_add(1, Ordering::SeqCst) + 1;
                if app.emit("quit-requested", ()).is_err() {
                    app.exit(0);
                    return;
                }
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(QUIT_SAVE_TIMEOUT);
                    if QUIT_ACKED.load(Ordering::SeqCst) < request {
                        app.exit(0);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            quit_now,
            quit_ack,
            commands::pandoc_version,
            commands::pick_pandoc,
            commands::forget_pandoc,
            commands::choose_docx_target,
            commands::export_docx,
            commands::diogenes_status,
            commands::diogenes_export,
            commands::assist_detect,
            commands::assist_run,
            commands::assist_set_custom,
            commands::assist_forget_custom,
            commands::pick_status,
            packs::install_lexicon_pack,
            packs::list_lexicon_packs,
            packs::remove_lexicon_pack
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
