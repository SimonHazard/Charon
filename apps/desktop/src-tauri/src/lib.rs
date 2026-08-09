pub mod capture;
pub mod clipboard;
mod ipc;
pub mod preferences;
pub mod workspace;

use tauri::Manager;

pub fn application_health() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ipc::workspace::WorkspaceRuntime::default())
        .manage(ipc::capture::CaptureRuntime::default())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        ipc::capture::handle_global_shortcut(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            ipc::workspace::workspace_choose_directory,
            ipc::workspace::workspace_bootstrap,
            ipc::workspace::workspace_bootstrap_default,
            ipc::workspace::workspace_create,
            ipc::workspace::workspace_open,
            ipc::workspace::workspace_open_or_create,
            ipc::workspace::workspace_snapshot,
            ipc::workspace::workspace_execute,
            ipc::workspace::workspace_close,
            ipc::workspace::workspace_health,
            ipc::clipboard::clipboard_compose_and_write,
            ipc::capture::capture_capabilities,
            ipc::capture::capture_open,
            ipc::capture::capture_request_permission,
            ipc::capture::capture_composer_ready,
            ipc::preferences::preferences_read,
            ipc::preferences::preferences_update,
            ipc::preferences::preferences_reset,
        ])
        .setup(|app| {
            ipc::capture::initialize(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Focused(true)) {
                ipc::capture::handle_main_focus(window.app_handle());
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                ipc::capture::shutdown(window.app_handle());
            }
        })
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
