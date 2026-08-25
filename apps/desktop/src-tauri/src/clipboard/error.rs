use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::workspace::WorkspaceIpcError;

#[derive(Debug, Error)]
pub enum ClipboardError {
    #[error("the clipboard composition request contains an empty note body")]
    EmptyBody,
    #[error("the clipboard composition request is invalid")]
    InvalidRequest,
    #[error("clipboard write permission was denied")]
    PermissionDenied,
    #[error("clipboard writing is unavailable on this platform")]
    PlatformUnavailable,
    #[error("the clipboard write failed")]
    WriteFailed,
    #[error("the current Workspace snapshot could not be read")]
    WorkspaceUnavailable,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ClipboardIpcError {
    pub code: String,
    pub message_key: String,
}

impl From<ClipboardError> for ClipboardIpcError {
    fn from(error: ClipboardError) -> Self {
        let (code, message_key) = match error {
            ClipboardError::EmptyBody => ("empty_body", "clipboard_error_empty_body"),
            ClipboardError::InvalidRequest => {
                ("invalid_request", "clipboard_error_invalid_request")
            }
            ClipboardError::PermissionDenied => {
                ("permission_denied", "clipboard_error_permission_denied")
            }
            ClipboardError::PlatformUnavailable => (
                "platform_unavailable",
                "clipboard_error_platform_unavailable",
            ),
            ClipboardError::WriteFailed => ("write_failed", "clipboard_error_write_failed"),
            ClipboardError::WorkspaceUnavailable => (
                "workspace_unavailable",
                "clipboard_error_workspace_unavailable",
            ),
        };

        Self {
            code: code.to_owned(),
            message_key: message_key.to_owned(),
        }
    }
}

impl From<WorkspaceIpcError> for ClipboardIpcError {
    fn from(error: WorkspaceIpcError) -> Self {
        match error.code.as_str() {
            "stale_revision" => Self {
                code: "stale_revision".to_owned(),
                message_key: "workspace_error_stale_revision".to_owned(),
            },
            "not_found" => Self {
                code: "not_found".to_owned(),
                message_key: "workspace_error_not_found".to_owned(),
            },
            "validation" => Self {
                code: "validation".to_owned(),
                message_key: "clipboard_error_invalid_request".to_owned(),
            },
            "not_open" => ClipboardError::WorkspaceUnavailable.into(),
            _ => ClipboardError::WorkspaceUnavailable.into(),
        }
    }
}
