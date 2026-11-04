use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// How long ⌘Q waits for the page to answer before quitting anyway.
const QUIT_SAVE_TIMEOUT: Duration = Duration::from_secs(5);

/// Once the page has answered, how much longer ⌘Q waits for its `quit_now`.
/// The page caps its own wait at 5 s, so this fires only if the page died
/// (a crash or reload) between answering and quitting.
const QUIT_ACKED_TIMEOUT: Duration = Duration::from_secs(10);

/// Each ⌘Q is numbered. When the page answers, the first deadline for that
/// ⌘Q and every earlier one gives way to the longer second one. Numbering
/// keeps a second ⌘Q from moving the first one's deadline.
static QUIT_REQUESTED: AtomicU64 = AtomicU64::new(0);
static QUIT_ACKED: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn quit_ack() {
    QUIT_ACKED.fetch_max(QUIT_REQUESTED.load(Ordering::SeqCst), Ordering::SeqCst);
}

/// Called by the page once queued annotation saves are done (src/lib/runtime.ts quitAfter).
#[tauri::command]
fn quit_now(app: AppHandle) {
    app.exit(0);
}

fn handle_menu_event<R: tauri::Runtime>(app: &AppHandle<R>, id: &str) {
    if id == "quit" {
        let request = QUIT_REQUESTED.fetch_add(1, Ordering::SeqCst) + 1;
        if app.emit("quit-requested", ()).is_err() {
            app.exit(0);
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(QUIT_SAVE_TIMEOUT);
            if QUIT_ACKED.load(Ordering::SeqCst) >= request {
                std::thread::sleep(QUIT_ACKED_TIMEOUT);
            }
            app.exit(0);
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![quit_ack, quit_now]);
    // The built-in Quit ends the app with no close-requested event, so a save
    // still queued was lost. Our own Quit (⌘Q) asks the page to finish its
    // saves, then quits; if the page never answers, it quits anyway after
    // QUIT_SAVE_TIMEOUT, and if it answers but never quits, after
    // QUIT_ACKED_TIMEOUT more. Only macOS gets a default menu, and with it a Quit;
    // elsewhere the window has no menu and quitting means closing it, which
    // the page already waits on (holdCloseUntil).
    #[cfg(target_os = "macos")]
    {
        builder = builder.menu(|handle| {
            let menu = tauri::menu::Menu::default(handle)?;
            if let Some(app_menu) = menu.items()?.first().and_then(|k| k.as_submenu().cloned()) {
                if let Some(builtin_quit) = app_menu.items()?.last().cloned() {
                    app_menu.remove(&builtin_quit)?;
                }
                app_menu.append(&tauri::menu::MenuItem::with_id(
                    handle,
                    "quit",
                    format!("Quit {}", handle.package_info().name),
                    true,
                    Some("CmdOrCtrl+Q"),
                )?)?;
            }
            Ok(menu)
        });
    }
    // The updater plugin panics at startup unless a `plugins.updater` config
    // block (pubkey + endpoints) is present, so it is registered only when the
    // merged config carries one — i.e. release builds made with
    // tauri.release.conf.json after the signing-key ceremony (see README).
    if context.config().plugins.0.contains_key("updater") {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder
        .run(context)
        .expect("error while running tauri application");
}
