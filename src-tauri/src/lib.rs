mod agent_diff_ops;
mod agent_manager;
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
            agent_manager::start_ghost_dev_session,
            agent_manager::stop_ghost_dev_session,
            agent_manager::list_agent_sessions,
            agent_manager::get_worktree_diff,
            agent_manager::accept_all_diff,
            agent_manager::revert_all_diff,
            agent_manager::revert_file_diff,
            agent_manager::send_agent_feedback,
            agent_manager::respond_shell_permission,
            agent_diff_ops::list_worktree_files,
            agent_diff_ops::read_worktree_file_content,
            agent_diff_ops::revert_hunk_diff,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // D-18: Kill active process groups immediately, preserve .plannermate/worktrees on disk
                agent_manager::cleanup_on_exit();
            }
        });
}
