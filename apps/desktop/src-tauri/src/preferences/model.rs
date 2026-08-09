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
    pub capture_hint_dismissed: bool,
}

impl Default for PersistedPreferences {
    fn default() -> Self {
        Self {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            last_workspace_path: None,
            capture_hint_dismissed: false,
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
        Ok(())
    }

    pub fn snapshot(&self) -> PreferencesSnapshot {
        PreferencesSnapshot {
            schema_version: self.schema_version,
            workspace_name: self.last_workspace_path.as_deref().and_then(workspace_name),
            has_remembered_workspace: self.last_workspace_path.is_some(),
            capture_hint_dismissed: self.capture_hint_dismissed,
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

#[cfg(test)]
mod tests {
    use super::*;

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
    pub capture_hint_dismissed: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PreferencesUpdate {
    pub capture_hint_dismissed: bool,
}
