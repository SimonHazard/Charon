mod error;
mod model;
mod storage;

use std::path::{Path, PathBuf};

pub use error::{PreferencesError, PreferencesIpcError};
pub use model::{PersistedPreferences, PreferencesSnapshot, PreferencesUpdate};
pub use storage::PreferencesStorage;

pub fn read(root: impl Into<PathBuf>) -> Result<PersistedPreferences, PreferencesError> {
    PreferencesStorage::new(root).read()
}

pub fn remember_workspace(
    root: impl Into<PathBuf>,
    workspace_path: &Path,
) -> Result<PreferencesSnapshot, PreferencesError> {
    let workspace_path = workspace_path
        .to_str()
        .ok_or(PreferencesError::InvalidPath)?;
    let storage = PreferencesStorage::new(root);
    let mut preferences = storage.read()?;
    preferences.last_workspace_path = Some(workspace_path.to_owned());
    storage.write(&preferences)?;
    Ok(preferences.snapshot())
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::ffi::OsStringExt;

    use super::*;

    #[test]
    fn non_utf8_workspace_path_is_rejected_without_persistence() {
        let root = tempfile::tempdir().expect("root");
        let invalid = PathBuf::from(std::ffi::OsString::from_vec(vec![b'/', 0xff]));
        assert!(matches!(
            remember_workspace(root.path(), &invalid),
            Err(PreferencesError::InvalidPath)
        ));
        assert!(!root.path().join("preferences.json").exists());
    }
}
