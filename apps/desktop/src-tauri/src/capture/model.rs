use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CapabilityState {
    Available,
    Denied,
    Unsupported,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum PlatformKind {
    Macos,
    LinuxX11,
    LinuxWayland,
    Windows,
    Unknown,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CapturePermissionKind {
    InputMonitoring,
    Accessibility,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureCapabilities {
    pub platform: PlatformKind,
    pub standard_shortcut: CapabilityState,
    pub input_monitoring: CapabilityState,
    pub accessibility: CapabilityState,
    pub double_shift: CapabilityState,
    pub selected_text: CapabilityState,
    pub active_shortcut: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureTrigger {
    StandardShortcut,
    DoubleShiftCapture,
    InApp,
}

#[derive(Clone, Eq, PartialEq)]
pub enum CaptureAction {
    CreateNote {
        body: String,
        warning: Option<CaptureWarning>,
    },
    FocusComposer {
        request_id: u32,
    },
    ShowWarning {
        warning: CaptureWarning,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureWarning {
    ClipboardNotRestored,
}

impl CaptureWarning {
    pub const fn message_key(self) -> &'static str {
        match self {
            Self::ClipboardNotRestored => "capture_warning_clipboard_not_restored",
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CapturedSelection {
    pub body: Option<String>,
    pub warning: Option<CaptureWarning>,
}

impl CapturedSelection {
    pub fn from_body(body: String) -> Self {
        Self {
            body: Some(body),
            warning: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureComposerRequest {
    pub request_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureStatusEvent {
    pub message_key: String,
}
