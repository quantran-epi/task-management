mod sqlite_persistence;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            sqlite_persistence::select_sqlite_path,
            sqlite_persistence::sqlite_file_status,
            sqlite_persistence::sqlite_init,
            sqlite_persistence::sqlite_apply_changes,
            sqlite_persistence::sqlite_read_rows,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
