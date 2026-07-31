pub mod clipboard;
mod ipc;
pub mod workspace;

pub fn application_health() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ipc::workspace::WorkspaceRuntime::default())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            ipc::workspace::workspace_choose_directory,
            ipc::workspace::workspace_create,
            ipc::workspace::workspace_open,
            ipc::workspace::workspace_snapshot,
            ipc::workspace::workspace_execute,
            ipc::workspace::workspace_close,
            ipc::workspace::workspace_health,
            ipc::clipboard::clipboard_preview,
            ipc::clipboard::clipboard_compose_and_write,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Charon");
}

#[cfg(test)]
mod tests {
    use super::application_health;

    #[test]
    fn reports_application_health_without_io() {
        assert_eq!(application_health(), "ok");
    }
}
