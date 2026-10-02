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
    let builder = tauri::Builder::default();
    // `Cmd+Q` asks the webview first, like the menu bar icon's Quit (ADR 0023).
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(ipc::shell::app_menu)
        .on_menu_event(|app, event| ipc::shell::handle_app_menu_event(app, &event));
    builder
        .manage(ipc::workspace::WorkspaceRuntime::default())
        .manage(ipc::capture::CaptureRuntime::default())
        .manage(ipc::shell::ShellRuntime::default())
        .manage(ipc::notification::NotificationRuntime::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = reveal_main(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Shown from Rust only (ADR 0024); the webview holds no notification permission.
        .plugin(tauri_plugin_notification::init())
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
            ipc::capture::capture_set_shortcut,
            ipc::preferences::preferences_read,
            ipc::preferences::preferences_reset,
            ipc::preferences::preferences_set_background_mode,
            ipc::preferences::preferences_set_capture_notifications,
            ipc::preferences::preferences_set_rich_capture,
            ipc::shell::shell_set_labels,
            ipc::shell::shell_quit,
            ipc::shell::shell_cancel_quit,
        ])
        .setup(|app| {
            // The main window is created hidden and the window-state plugin has
            // already restored its size and position. Show it before any other
            // setup work; if it cannot be shown, setup fails and Charon exits
            // rather than running without a visible window.
            reveal_main(app.handle())?;
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
            ipc::notification::load(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Capture threads read this flag: window getters such as
            // `is_focused` wait for the main thread, which may be waiting for
            // them while Charon quits.
            if let tauri::WindowEvent::Focused(focused) = event {
                if window.label() == "main" {
                    ipc::shell::set_main_focused(window.app_handle(), *focused);
                    if *focused {
                        ipc::capture::handle_main_focus(window.app_handle());
                    }
                }
            }
            // Closing hides Charon and keeps capture armed on macOS (the Dock
            // icon, the reveal shortcut, or a second launch shows it again)
            // and, elsewhere, only while the background-mode tray icon exists
            // (ADR 0023). If hiding fails, the window closes normally.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main"
                    && ipc::shell::close_hides(window.app_handle())
                    && window.hide().is_ok()
                {
                    api.prevent_close();
                }
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                ipc::capture::shutdown(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Charon")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if matches!(event, tauri::RunEvent::Reopen { .. }) {
                let _ = reveal_main(app);
            }
            // Every exit ends here, including AppKit's own terminate paths;
            // stopping capture is bounded and idempotent with `Destroyed`.
            // `ExitRequested` needs no guard: Tauri sends it without a code
            // only after the last window was destroyed, and with a code only
            // for an exit Charon itself requested after its draft guard.
            if matches!(event, tauri::RunEvent::Exit) {
                ipc::capture::shutdown(app);
            }
        });
}

/// Unminimizes, shows, and focuses the main window. Launch, a second launch,
/// the macOS Dock icon, and the background-mode tray all reveal Charon through it.
pub(crate) fn reveal_main<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        window.show()?;
        let _ = window.set_focus();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::application_health;

    #[test]
    fn reports_application_health_without_io() {
        assert_eq!(application_health(), "ok");
    }
}
