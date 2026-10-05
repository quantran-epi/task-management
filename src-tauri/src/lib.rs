mod ai_proxy;
mod jira_proxy;
mod keyring_store;
mod sqlite_persistence;

#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            open_devtools,
            sqlite_persistence::select_sqlite_path,
            sqlite_persistence::sqlite_file_status,
            sqlite_persistence::sqlite_init,
            sqlite_persistence::sqlite_apply_changes,
            sqlite_persistence::sqlite_read_rows,
            jira_proxy::jira_proxy_request,
            ai_proxy::ai_proxy_request,
            ai_proxy::graphiti_mcp_request,
            jira_proxy::open_external_url,
            jira_proxy::open_local_path,
            jira_proxy::select_local_folder,
            jira_proxy::select_local_file,
            jira_proxy::read_local_file_text_head,
            jira_proxy::read_local_file_slice,
            jira_proxy::complete_local_path,
            jira_proxy::launch_claude_terminal,
            jira_proxy::launch_claude_at_local_path,
            keyring_store::store_credential,
            keyring_store::get_credential,
            keyring_store::delete_credential,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
