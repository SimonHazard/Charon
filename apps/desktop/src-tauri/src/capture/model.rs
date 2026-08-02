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
    CommandDoubleShift,
    InApp,
}

#[derive(Clone, Eq, PartialEq)]
pub enum CaptureAction {
    CreateNote { body: String },
    OpenEditor { request_id: u32 },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureEditorRequest {
    pub request_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureStatusEvent {
    pub message_key: String,
}
