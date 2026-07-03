#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init());
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
