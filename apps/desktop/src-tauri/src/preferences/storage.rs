use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::{PersistedPreferences, PreferencesError};

const FILE_NAME: &str = "preferences.json";

pub struct PreferencesStorage {
    root: PathBuf,
}

impl PreferencesStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn read(&self) -> Result<PersistedPreferences, PreferencesError> {
        let path = self.root.join(FILE_NAME);
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(PersistedPreferences::default());
            }
            Err(error) => return Err(error.into()),
        };
        let preferences = match serde_json::from_slice::<PersistedPreferences>(&bytes) {
            Ok(preferences) => preferences,
            Err(_) => {
                self.back_up_corrupt(&path)?;
                return Ok(PersistedPreferences::default());
            }
        };
        preferences.validate()?;
        Ok(preferences)
    }

    pub fn write(&self, preferences: &PersistedPreferences) -> Result<(), PreferencesError> {
        self.write_inner(preferences, false)
    }

    #[cfg(test)]
    pub(crate) fn write_with_atomic_failure(
        &self,
        preferences: &PersistedPreferences,
    ) -> Result<(), PreferencesError> {
        self.write_inner(preferences, true)
    }

    fn write_inner(
        &self,
        preferences: &PersistedPreferences,
        fail_before_rename: bool,
    ) -> Result<(), PreferencesError> {
        preferences.validate()?;
        fs::create_dir_all(&self.root)?;
        let payload =
            serde_json::to_vec_pretty(preferences).map_err(|_| PreferencesError::Encoding)?;
        let temporary = self
            .root
            .join(format!(".preferences-{}.tmp", Uuid::new_v4()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temporary)?;
            file.write_all(&payload)?;
            file.write_all(b"\n")?;
            file.sync_all()?;
            if fail_before_rename {
                return Err(PreferencesError::Io(std::io::Error::other(
                    "injected atomic write failure",
                )));
            }
            fs::rename(&temporary, self.root.join(FILE_NAME))?;
            sync_directory(&self.root)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn reset(&self) -> Result<PersistedPreferences, PreferencesError> {
        let preferences = PersistedPreferences::default();
        self.write(&preferences)?;
        Ok(preferences)
    }

    fn back_up_corrupt(&self, path: &Path) -> Result<(), PreferencesError> {
        fs::create_dir_all(&self.root)?;
        let backup = self
            .root
            .join(format!("preferences.corrupt-{}.json", Uuid::new_v4()));
        fs::rename(path, backup)?;
        sync_directory(&self.root)
    }
}

fn sync_directory(path: &Path) -> Result<(), PreferencesError> {
    #[cfg(unix)]
    std::fs::File::open(path)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_storage_returns_schema_defaults() {
        let root = tempfile::tempdir().expect("root");
        let storage = PreferencesStorage::new(root.path());
        assert_eq!(
            storage.read().expect("read"),
            PersistedPreferences::default()
        );
    }

    #[test]
    fn writes_and_reads_only_the_bounded_schema() {
        let root = tempfile::tempdir().expect("root");
        let storage = PreferencesStorage::new(root.path());
        let preferences = PersistedPreferences {
            last_workspace_path: Some(root.path().join("Charon").to_string_lossy().into_owned()),
            capture_hint_dismissed: true,
            ..PersistedPreferences::default()
        };
        storage.write(&preferences).expect("write");
        assert_eq!(storage.read().expect("read"), preferences);
    }

    #[cfg(unix)]
    #[test]
    fn preferences_file_is_private_on_unix() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().expect("root");
        let storage = PreferencesStorage::new(root.path());
        storage
            .write(&PersistedPreferences::default())
            .expect("write");
        let mode = fs::metadata(root.path().join(FILE_NAME))
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn atomic_failure_preserves_the_previous_file() {
        let root = tempfile::tempdir().expect("root");
        let storage = PreferencesStorage::new(root.path());
        let previous = PersistedPreferences::default();
        storage.write(&previous).expect("initial write");
        let next = PersistedPreferences {
            capture_hint_dismissed: true,
            ..previous.clone()
        };
        assert!(storage.write_with_atomic_failure(&next).is_err());
        assert_eq!(storage.read().expect("read"), previous);
        assert!(fs::read_dir(root.path())
            .expect("entries")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")));
    }

    #[test]
    fn corrupt_json_is_backed_up_and_reset_in_memory() {
        let root = tempfile::tempdir().expect("root");
        fs::write(root.path().join(FILE_NAME), b"not json").expect("corrupt file");
        let storage = PreferencesStorage::new(root.path());
        assert_eq!(
            storage.read().expect("read"),
            PersistedPreferences::default()
        );
        let names = fs::read_dir(root.path())
            .expect("entries")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert!(names
            .iter()
            .any(|name| name.starts_with("preferences.corrupt-")));
        assert!(!root.path().join(FILE_NAME).exists());
    }

    #[test]
    fn future_schema_fails_without_reclassifying_the_file_as_corrupt() {
        let root = tempfile::tempdir().expect("root");
        fs::write(
            root.path().join(FILE_NAME),
            br#"{"schemaVersion":2,"lastWorkspacePath":null,"captureHintDismissed":false}"#,
        )
        .expect("future file");
        let storage = PreferencesStorage::new(root.path());
        assert!(matches!(
            storage.read(),
            Err(PreferencesError::UnsupportedSchema)
        ));
        assert!(root.path().join(FILE_NAME).exists());
    }

    #[test]
    fn relative_workspace_path_is_rejected_without_echoing_it() {
        let root = tempfile::tempdir().expect("root");
        let storage = PreferencesStorage::new(root.path());
        let invalid = PersistedPreferences {
            last_workspace_path: Some("relative/private/path".to_owned()),
            ..PersistedPreferences::default()
        };
        let error = storage.write(&invalid).expect_err("invalid path");
        assert!(matches!(error, PreferencesError::InvalidPath));
        assert!(!error.to_string().contains("relative/private/path"));
    }
}
