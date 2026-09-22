pub mod capture;
pub mod clipboard;
mod ipc;
pub mod preferences;
pub mod workspace;

use tauri::Manager;

pub fn application_health() -> &'static str {
    "ok"
}

pub fn run() {
    tauri::Builder::default()
        .manage(ipc::workspace::WorkspaceRuntime::default())
        .manage(ipc::capture::CaptureRuntime::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            ipc::workspace::workspace_choose_directory,
            ipc::workspace::workspace_choose_attachments,
            ipc::workspace::workspace_bootstrap,
            ipc::workspace::workspace_bootstrap_default,
            ipc::workspace::workspace_open_or_create,
            ipc::workspace::workspace_snapshot,
            ipc::workspace::workspace_execute,
            ipc::clipboard::clipboard_compose_and_write,
            ipc::capture::capture_capabilities,
            ipc::capture::capture_open,
            ipc::capture::capture_request_permission,
            ipc::capture::capture_composer_ready,
            ipc::preferences::preferences_read,
            ipc::preferences::preferences_reset,
        ])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            let register_native_shortcut = !capture::platform::linux::is_wayland();
            #[cfg(not(target_os = "linux"))]
            let register_native_shortcut = true;
            if register_native_shortcut {
                let _ = app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                ipc::capture::handle_global_shortcut(app);
                            }
                        })
                        .build(),
                );
            }
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
