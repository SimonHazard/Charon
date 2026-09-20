use charon_desktop_lib::capture::{CaptureError, CaptureIpcError};
use charon_desktop_lib::clipboard::{ClipboardError, ClipboardIpcError};
use charon_desktop_lib::preferences::{PreferencesError, PreferencesIpcError};
use charon_desktop_lib::workspace::{WorkspaceError, WorkspaceIpcError};
use serde::Serialize;

fn assert_content_free<T: Serialize>(error: &T) {
    let json = serde_json::to_string(error).expect("serialize IPC error");
    assert!(
        !json.contains("MARKER"),
        "error leaked source content: {json}"
    );
}

#[test]
fn workspace_error_conversion_is_complete_and_content_free() {
    let cases = [
        (
            WorkspaceError::InvalidPath,
            "invalid_path",
            "workspace_error_invalid_path",
        ),
        (
            WorkspaceError::DirectoryNotEmpty,
            "directory_not_empty",
            "workspace_error_directory_not_empty",
        ),
        (
            WorkspaceError::DefaultLocationUnavailable,
            "default_location_unavailable",
            "workspace_error_default_location_unavailable",
        ),
        (
            WorkspaceError::InvalidManifest,
            "invalid_manifest",
            "workspace_error_invalid_manifest",
        ),
        (
            WorkspaceError::UnsupportedSchema(99),
            "unsupported_schema",
            "workspace_error_unsupported_schema",
        ),
        (
            WorkspaceError::Validation("MARKER-validation".to_owned()),
            "validation",
            "workspace_error_validation",
        ),
        (
            WorkspaceError::StaleRevision {
                expected: 4,
                actual: 5,
            },
            "stale_revision",
            "workspace_error_stale_revision",
        ),
        (
            WorkspaceError::Io(std::io::Error::other("MARKER-io")),
            "io",
            "workspace_error_io",
        ),
        (
            WorkspaceError::RecoveryRequired {
                backup_location: "backups/x".to_owned(),
            },
            "recovery_required",
            "workspace_error_recovery_required",
        ),
        (
            WorkspaceError::DeletionCleanupRequired {
                transaction_id: "x".to_owned(),
            },
            "deletion_cleanup_required",
            "workspace_error_deletion_cleanup_required",
        ),
        (
            WorkspaceError::LegacyArchiveCollision,
            "legacy_archive_collision",
            "workspace_error_legacy_archive_collision",
        ),
        (
            WorkspaceError::NotFound("MARKER-note".to_owned()),
            "not_found",
            "workspace_error_not_found",
        ),
        (
            WorkspaceError::NotOpen,
            "not_open",
            "workspace_error_not_open",
        ),
    ];

    for (source, code, message_key) in cases {
        let error = WorkspaceIpcError::from(source);
        assert_eq!(
            (error.code.as_str(), error.message_key.as_str()),
            (code, message_key)
        );
        assert_content_free(&error);
    }
}

#[test]
fn capture_error_conversion_is_complete_and_content_free() {
    let cases = [
        (
            CaptureError::InvalidShortcut,
            "invalid_shortcut",
            "capture_error_invalid_shortcut",
        ),
        (
            CaptureError::ShortcutRegistration,
            "shortcut_registration",
            "capture_error_shortcut_registration",
        ),
        (
            CaptureError::ShortcutUnregistration,
            "shortcut_unregistration",
            "capture_error_shortcut_unregistration",
        ),
        (
            CaptureError::ListenerUnavailable,
            "listener_unavailable",
            "capture_error_listener_unavailable",
        ),
        (
            CaptureError::WorkerUnavailable,
            "worker_unavailable",
            "capture_error_worker_unavailable",
        ),
        (
            CaptureError::PermissionDenied,
            "permission_denied",
            "capture_error_permission_denied",
        ),
        (
            CaptureError::SelectionUnsupported,
            "selection_unsupported",
            "capture_error_selection_unsupported",
        ),
        (
            CaptureError::SelectionFailed,
            "selection_failed",
            "capture_error_selection_failed",
        ),
        (
            CaptureError::MainEditorUnavailable,
            "main_editor_unavailable",
            "capture_error_main_editor_unavailable",
        ),
        (CaptureError::Shutdown, "shutdown", "capture_error_shutdown"),
        (
            CaptureError::RuntimeLock,
            "runtime_lock",
            "capture_error_runtime_lock",
        ),
    ];

    for (source, code, message_key) in cases {
        let error = CaptureIpcError::from(source);
        assert_eq!(
            (error.code.as_str(), error.message_key.as_str()),
            (code, message_key)
        );
        assert_content_free(&error);
    }
}

#[test]
fn clipboard_error_conversion_is_complete_and_content_free() {
    let cases = [
        (
            ClipboardError::EmptyBody,
            "empty_body",
            "clipboard_error_empty_body",
        ),
        (
            ClipboardError::InvalidRequest,
            "invalid_request",
            "clipboard_error_invalid_request",
        ),
        (
            ClipboardError::PermissionDenied,
            "permission_denied",
            "clipboard_error_permission_denied",
        ),
        (
            ClipboardError::PlatformUnavailable,
            "platform_unavailable",
            "clipboard_error_platform_unavailable",
        ),
        (
            ClipboardError::WriteFailed,
            "write_failed",
            "clipboard_error_write_failed",
        ),
        (
            ClipboardError::WorkspaceUnavailable,
            "workspace_unavailable",
            "clipboard_error_workspace_unavailable",
        ),
    ];

    for (source, code, message_key) in cases {
        let error = ClipboardIpcError::from(source);
        assert_eq!(
            (error.code.as_str(), error.message_key.as_str()),
            (code, message_key)
        );
        assert_content_free(&error);
    }
}

#[test]
fn preferences_error_conversion_is_complete_and_content_free() {
    let cases = [
        (
            PreferencesError::InvalidPath,
            "invalid_path",
            "preferences_error_invalid_path",
        ),
        (
            PreferencesError::UnsupportedSchema,
            "unsupported_schema",
            "preferences_error_unsupported_schema",
        ),
        (
            PreferencesError::InvalidValue,
            "invalid_value",
            "preferences_error_invalid_value",
        ),
        (
            PreferencesError::Io(std::io::Error::other("MARKER-preferences-io")),
            "io",
            "preferences_error_io",
        ),
        (
            PreferencesError::Encoding,
            "encoding",
            "preferences_error_encoding",
        ),
    ];

    for (source, code, message_key) in cases {
        let error = PreferencesIpcError::from(source);
        assert_eq!(
            (error.code.as_str(), error.message_key.as_str()),
            (code, message_key)
        );
        assert_content_free(&error);
    }
}
