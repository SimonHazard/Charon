use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("the capture shortcut is invalid")]
    InvalidShortcut,
    #[error("the capture shortcut could not be registered")]
    ShortcutRegistration,
    #[error("the capture shortcut could not be removed")]
    ShortcutUnregistration,
    #[error("the enhanced capture listener could not start")]
    ListenerUnavailable,
    #[error("Accessibility permission is denied")]
    PermissionDenied,
    #[error("selected-text capture is unsupported")]
    SelectionUnsupported,
    #[error("selected-text capture failed")]
    SelectionFailed,
    #[error("the main editor is unavailable")]
    MainEditorUnavailable,
    #[error("the capture coordinator has shut down")]
    Shutdown,
    #[error("the capture runtime lock is unavailable")]
    RuntimeLock,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureIpcError {
    pub code: String,
    pub message_key: String,
}

impl From<CaptureError> for CaptureIpcError {
    fn from(error: CaptureError) -> Self {
        let (code, message_key) = match error {
            CaptureError::InvalidShortcut => ("invalid_shortcut", "capture_error_invalid_shortcut"),
            CaptureError::ShortcutRegistration => (
                "shortcut_registration",
                "capture_error_shortcut_registration",
            ),
            CaptureError::ShortcutUnregistration => (
                "shortcut_unregistration",
                "capture_error_shortcut_unregistration",
            ),
            CaptureError::ListenerUnavailable => {
                ("listener_unavailable", "capture_error_listener_unavailable")
            }
            CaptureError::PermissionDenied => {
                ("permission_denied", "capture_error_permission_denied")
            }
            CaptureError::SelectionUnsupported => (
                "selection_unsupported",
                "capture_error_selection_unsupported",
            ),
            CaptureError::SelectionFailed => ("selection_failed", "capture_error_selection_failed"),
            CaptureError::MainEditorUnavailable => (
                "main_editor_unavailable",
                "capture_error_main_editor_unavailable",
            ),
            CaptureError::Shutdown => ("shutdown", "capture_error_shutdown"),
            CaptureError::RuntimeLock => ("runtime_lock", "capture_error_runtime_lock"),
        };
        Self {
            code: code.to_owned(),
            message_key: message_key.to_owned(),
        }
    }
}
