fn main() {
    // Scope every custom command through the app manifest: a command runs only
    // when a capability grants its generated `allow-<command>` permission.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "workspace_choose_directory",
            "workspace_choose_attachments",
            "workspace_bootstrap",
            "workspace_bootstrap_default",
            "workspace_open_or_create",
            "workspace_snapshot",
            "workspace_execute",
            "clipboard_compose_and_write",
            "capture_capabilities",
            "capture_open",
            "capture_request_permission",
            "capture_composer_ready",
            "capture_set_shortcut",
            "preferences_read",
            "preferences_reset",
            "preferences_set_background_mode",
            "preferences_set_capture_notifications",
            "preferences_set_rich_capture",
            "shell_set_labels",
            "shell_quit",
            "shell_cancel_quit",
        ]),
    ))
    .expect("failed to run tauri-build");
}
