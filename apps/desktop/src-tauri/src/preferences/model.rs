use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::PreferencesError;

pub const PREFERENCES_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistedPreferences {
    pub schema_version: u32,
    pub last_workspace_path: Option<String>,
    // reserved, unused since Plan 030; kept on disk for schema-v1 compatibility.
    pub capture_hint_dismissed: bool,
    /// The opt-in background mode (ADR 0023). Older schema-v1 files omit it.
    #[serde(default)]
    pub background_mode: bool,
    /// The opt-in capture notification (ADR 0024). Older schema-v1 files omit it.
    #[serde(default)]
    pub capture_notifications: bool,
    /// The user's composer accelerator (ADR 0025); `None` keeps the platform
    /// default. Older schema-v1 files omit it. `capture::shortcut` owns its
    /// meaning; this file only bounds its shape.
    #[serde(default)]
    pub composer_shortcut: Option<String>,
    /// The opt-in formatted capture (ADR 0026). Older schema-v1 files omit it.
    #[serde(default)]
    pub rich_capture: bool,
}

/// Matches `capture::shortcut::MAX_ACCELERATOR_LEN`.
const COMPOSER_SHORTCUT_MAX_BYTES: usize = 64;

impl Default for PersistedPreferences {
    fn default() -> Self {
        Self {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            last_workspace_path: None,
            capture_hint_dismissed: false,
            background_mode: false,
            capture_notifications: false,
            composer_shortcut: None,
            rich_capture: false,
        }
    }
}

impl PersistedPreferences {
    pub fn validate(&self) -> Result<(), PreferencesError> {
        if self.schema_version != PREFERENCES_SCHEMA_VERSION {
            return Err(PreferencesError::UnsupportedSchema);
        }
        if self
            .last_workspace_path
            .as_deref()
            .is_some_and(|path| !Path::new(path).is_absolute())
        {
            return Err(PreferencesError::InvalidPath);
        }
        if self.composer_shortcut.as_deref().is_some_and(|shortcut| {
            shortcut.is_empty()
                || shortcut.len() > COMPOSER_SHORTCUT_MAX_BYTES
                || !shortcut.is_ascii()
                || shortcut
                    .chars()
                    .any(|character| character.is_ascii_control())
        }) {
            return Err(PreferencesError::InvalidValue);
        }
        Ok(())
    }

    pub fn snapshot(&self) -> PreferencesSnapshot {
        PreferencesSnapshot {
            schema_version: self.schema_version,
            workspace_name: self.last_workspace_path.as_deref().and_then(workspace_name),
            has_remembered_workspace: self.last_workspace_path.is_some(),
            install_kind: InstallKind::Unknown,
            background_mode: self.background_mode,
            tray_availability: TrayAvailability::Unavailable,
            background_active: false,
            capture_notifications: self.capture_notifications,
            rich_capture: self.rich_capture,
        }
    }
}

fn workspace_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| {
            !value.is_empty()
                && value.chars().count() <= 128
                && !value.chars().any(char::is_control)
        })
        .map(str::to_owned)
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum InstallKind {
    Appimage,
    Deb,
    Rpm,
    Nsis,
    Msi,
    Macos,
    Unknown,
}

/// Whether this build can show the background-mode tray icon (ADR 0023).
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum TrayAvailability {
    Available,
    Unavailable,
}

/// Localized native shell labels: the background-mode tray (ADR 0023) and the
/// fixed, content-free capture notification (ADR 0024). React renders them
/// through Paraglide and pushes them to Rust, so Rust never hardcodes UI copy.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(rename_all = "camelCase")]
pub struct NativeLabels {
    pub tray_open: String,
    pub tray_quit: String,
    pub tray_tooltip: String,
    pub notification_title: String,
    pub notification_body: String,
}

const NATIVE_LABEL_MAX_SCALARS: usize = 64;

impl NativeLabels {
    pub fn validate(&self) -> Result<(), PreferencesError> {
        [
            &self.tray_open,
            &self.tray_quit,
            &self.tray_tooltip,
            &self.notification_title,
            &self.notification_body,
        ]
        .into_iter()
        .all(|label| {
            !label.trim().is_empty()
                && label.chars().count() <= NATIVE_LABEL_MAX_SCALARS
                && !label.chars().any(char::is_control)
        })
        .then_some(())
        .ok_or(PreferencesError::InvalidValue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(value: &str) -> NativeLabels {
        NativeLabels {
            tray_open: "Open Charon".to_owned(),
            tray_quit: value.to_owned(),
            tray_tooltip: "Charon".to_owned(),
            notification_title: "Charon".to_owned(),
            notification_body: "Note captured.".to_owned(),
        }
    }

    fn notification_body(value: &str) -> NativeLabels {
        NativeLabels {
            notification_body: value.to_owned(),
            ..labels("Quit Charon")
        }
    }

    #[test]
    fn native_labels_are_bounded_single_line_text() {
        assert!(labels("Quit Charon").validate().is_ok());
        assert!(labels(&"q".repeat(64)).validate().is_ok());
        assert!(labels(&"é".repeat(64)).validate().is_ok());
        for invalid in ["", "   ", "Quit\nCharon", "Quit\u{7}", &"q".repeat(65)] {
            assert!(matches!(
                labels(invalid).validate(),
                Err(PreferencesError::InvalidValue)
            ));
        }
    }

    #[test]
    fn notification_labels_follow_the_same_bounds() {
        assert!(notification_body(&"n".repeat(64)).validate().is_ok());
        for invalid in ["", " ", "Note\ncaptured.", "Note\u{1b}", &"n".repeat(65)] {
            assert!(matches!(
                notification_body(invalid).validate(),
                Err(PreferencesError::InvalidValue)
            ));
        }
        let untitled = NativeLabels {
            notification_title: String::new(),
            ..labels("Quit Charon")
        };
        assert!(matches!(
            untitled.validate(),
            Err(PreferencesError::InvalidValue)
        ));
    }

    #[test]
    fn snapshot_reports_the_capture_notification_choice() {
        assert!(
            !PersistedPreferences::default()
                .snapshot()
                .capture_notifications
        );
        let preferences = PersistedPreferences {
            capture_notifications: true,
            ..PersistedPreferences::default()
        };
        assert!(preferences.snapshot().capture_notifications);
    }

    #[test]
    fn snapshot_reports_the_background_choice_and_no_runtime_tray() {
        let preferences = PersistedPreferences {
            background_mode: true,
            ..PersistedPreferences::default()
        };
        let snapshot = preferences.snapshot();
        assert!(snapshot.background_mode);
        assert_eq!(snapshot.tray_availability, TrayAvailability::Unavailable);
        assert!(!snapshot.background_active);
    }

    #[test]
    fn composer_shortcut_is_bounded_single_line_ascii() {
        let with = |shortcut: &str| PersistedPreferences {
            composer_shortcut: Some(shortcut.to_owned()),
            ..PersistedPreferences::default()
        };
        assert!(PersistedPreferences::default().validate().is_ok());
        assert!(with("Ctrl+Alt+N").validate().is_ok());
        // Semantic validity belongs to capture::shortcut; launch falls back to the default.
        assert!(with("Cmd+F").validate().is_ok());
        assert!(with(&"N".repeat(64)).validate().is_ok());
        for invalid in [
            "",
            "Ctrl+Alt+\n",
            "Ctrl+Alt+\u{7f}",
            "Ctrl+Alt+é",
            &"N".repeat(65),
        ] {
            assert!(matches!(
                with(invalid).validate(),
                Err(PreferencesError::InvalidValue)
            ));
        }
    }

    #[test]
    fn older_files_without_a_composer_shortcut_keep_the_default() {
        let preferences: PersistedPreferences = serde_json::from_str(
            r#"{"schemaVersion":1,"lastWorkspacePath":null,"captureHintDismissed":false}"#,
        )
        .expect("schema-v1 file without newer fields");
        assert_eq!(preferences.composer_shortcut, None);
        assert!(!preferences.rich_capture);
        assert_eq!(preferences, PersistedPreferences::default());
    }

    #[test]
    fn snapshot_reports_the_formatted_capture_choice() {
        assert!(!PersistedPreferences::default().snapshot().rich_capture);
        let preferences = PersistedPreferences {
            rich_capture: true,
            ..PersistedPreferences::default()
        };
        assert!(preferences.snapshot().rich_capture);
        assert_eq!(
            serde_json::to_value(&preferences).expect("serialize")["richCapture"],
            true
        );
    }

    #[test]
    fn snapshot_omits_unsafe_workspace_basenames() {
        let preferences = PersistedPreferences {
            last_workspace_path: Some("/tmp/unsafe\nname".to_owned()),
            ..PersistedPreferences::default()
        };
        assert_eq!(preferences.snapshot().workspace_name, None);
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PreferencesSnapshot {
    pub schema_version: u32,
    pub workspace_name: Option<String>,
    pub has_remembered_workspace: bool,
    pub install_kind: InstallKind,
    /// The persisted background-mode choice.
    pub background_mode: bool,
    /// Runtime only: whether this build can show the tray icon.
    pub tray_availability: TrayAvailability,
    /// Runtime only: whether the tray icon exists, so closing hides Charon.
    pub background_active: bool,
    /// The persisted capture-notification choice (ADR 0024).
    pub capture_notifications: bool,
    /// The persisted formatted-capture choice (ADR 0026).
    pub rich_capture: bool,
}
