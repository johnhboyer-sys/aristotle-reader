mod assist;
mod packs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
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
