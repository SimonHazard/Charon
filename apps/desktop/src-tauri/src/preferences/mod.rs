mod error;
mod model;
mod storage;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

pub use error::{PreferencesError, PreferencesIpcError};
pub use model::{
    InstallKind, NativeLabels, PersistedPreferences, PreferencesSnapshot, TrayAvailability,
};
pub use storage::PreferencesStorage;

/// Serialises every access to the preferences file in this process. Each
/// change reads the whole file, edits one field, and writes it back, so two
/// concurrent commands (for example two Preferences toggles) would otherwise
/// both start from the same file and the later write would drop the earlier
/// change. The lock covers file I/O only: never wait for the main thread
/// while holding it, because the main thread stores the composer shortcut.
static FILE_LOCK: Mutex<()> = Mutex::new(());

fn file_lock() -> MutexGuard<'static, ()> {
    FILE_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Reads, edits, and writes the file under the process-wide lock, and returns
/// what was stored.
fn update(
    root: impl Into<PathBuf>,
    edit: impl FnOnce(&mut PersistedPreferences),
) -> Result<PersistedPreferences, PreferencesError> {
    let _lock = file_lock();
    let storage = PreferencesStorage::new(root);
    let mut preferences = storage.read()?;
    edit(&mut preferences);
    storage.write(&preferences)?;
    Ok(preferences)
}

pub fn read(root: impl Into<PathBuf>) -> Result<PersistedPreferences, PreferencesError> {
    // A read can move a corrupt file aside, so it never interleaves with a write.
    let _lock = file_lock();
    PreferencesStorage::new(root).read()
}

/// Replaces the file with schema defaults and returns them.
pub fn reset(root: impl Into<PathBuf>) -> Result<PersistedPreferences, PreferencesError> {
    let _lock = file_lock();
    PreferencesStorage::new(root).reset()
}

pub fn remember_workspace(
    root: impl Into<PathBuf>,
    workspace_path: &Path,
) -> Result<PreferencesSnapshot, PreferencesError> {
    let workspace_path = workspace_path
        .to_str()
        .ok_or(PreferencesError::InvalidPath)?;
    update(root, |preferences| {
        preferences.last_workspace_path = Some(workspace_path.to_owned());
    })
    .map(|preferences| preferences.snapshot())
}

/// Persists the background-mode choice and returns the stored preferences.
pub fn set_background_mode(
    root: impl Into<PathBuf>,
    enabled: bool,
) -> Result<PersistedPreferences, PreferencesError> {
    update(root, |preferences| preferences.background_mode = enabled)
}

/// Persists the capture-notification choice (ADR 0024) and returns the stored
/// preferences.
pub fn set_capture_notifications(
    root: impl Into<PathBuf>,
    enabled: bool,
) -> Result<PersistedPreferences, PreferencesError> {
    update(root, |preferences| {
        preferences.capture_notifications = enabled;
    })
}

/// Persists the formatted-capture choice (ADR 0026) and returns the stored
/// preferences.
pub fn set_rich_capture(
    root: impl Into<PathBuf>,
    enabled: bool,
) -> Result<PersistedPreferences, PreferencesError> {
    update(root, |preferences| preferences.rich_capture = enabled)
}

/// Persists the user's composer accelerator (ADR 0025), or clears it with
/// `None`, and returns the stored preferences.
pub fn remember_composer_shortcut(
    root: impl Into<PathBuf>,
    shortcut: Option<&str>,
) -> Result<PersistedPreferences, PreferencesError> {
    update(root, |preferences| {
        preferences.composer_shortcut = shortcut.map(str::to_owned);
    })
}

#[cfg(test)]
mod background_tests {
    use super::*;

    #[test]
    fn background_mode_round_trips_without_touching_the_workspace() {
        let root = tempfile::tempdir().expect("root");
        let workspace = root.path().join("Charon");
        remember_workspace(root.path(), &workspace).expect("remember");

        let enabled = set_background_mode(root.path(), true).expect("enable");
        assert!(enabled.background_mode);
        assert_eq!(read(root.path()).expect("read"), enabled);
        assert_eq!(enabled.last_workspace_path.as_deref(), workspace.to_str());

        assert!(
            !set_background_mode(root.path(), false)
                .expect("disable")
                .background_mode
        );
        assert!(!read(root.path()).expect("read").background_mode);
    }

    #[test]
    fn capture_notifications_round_trip_without_touching_other_choices() {
        let root = tempfile::tempdir().expect("root");
        let workspace = root.path().join("Charon");
        remember_workspace(root.path(), &workspace).expect("remember");
        set_background_mode(root.path(), true).expect("background");

        let enabled = set_capture_notifications(root.path(), true).expect("enable");
        assert!(enabled.capture_notifications);
        assert!(enabled.background_mode);
        assert_eq!(enabled.last_workspace_path.as_deref(), workspace.to_str());
        assert_eq!(read(root.path()).expect("read"), enabled);

        let disabled = set_capture_notifications(root.path(), false).expect("disable");
        assert!(!disabled.capture_notifications);
        assert!(disabled.background_mode);
        assert!(!read(root.path()).expect("read").capture_notifications);
    }

    #[test]
    fn rich_capture_round_trips_without_touching_other_choices() {
        let root = tempfile::tempdir().expect("root");
        let workspace = root.path().join("Charon");
        remember_workspace(root.path(), &workspace).expect("remember");
        remember_composer_shortcut(root.path(), Some("Ctrl+Alt+N")).expect("shortcut");

        let enabled = set_rich_capture(root.path(), true).expect("enable");
        assert!(enabled.rich_capture);
        assert_eq!(enabled.composer_shortcut.as_deref(), Some("Ctrl+Alt+N"));
        assert_eq!(enabled.last_workspace_path.as_deref(), workspace.to_str());
        assert_eq!(read(root.path()).expect("read"), enabled);

        let disabled = set_rich_capture(root.path(), false).expect("disable");
        assert!(!disabled.rich_capture);
        assert_eq!(disabled.composer_shortcut.as_deref(), Some("Ctrl+Alt+N"));
        assert!(!read(root.path()).expect("read").rich_capture);
    }

    #[test]
    fn composer_shortcut_round_trips_and_clears_without_touching_other_choices() {
        let root = tempfile::tempdir().expect("root");
        let workspace = root.path().join("Charon");
        remember_workspace(root.path(), &workspace).expect("remember");
        set_capture_notifications(root.path(), true).expect("notifications");

        let chosen = remember_composer_shortcut(root.path(), Some("Ctrl+Alt+N")).expect("choose");
        assert_eq!(chosen.composer_shortcut.as_deref(), Some("Ctrl+Alt+N"));
        assert!(chosen.capture_notifications);
        assert_eq!(chosen.last_workspace_path.as_deref(), workspace.to_str());
        assert_eq!(read(root.path()).expect("read"), chosen);

        let cleared = remember_composer_shortcut(root.path(), None).expect("reset");
        assert_eq!(cleared.composer_shortcut, None);
        assert!(cleared.capture_notifications);
        assert_eq!(read(root.path()).expect("read").composer_shortcut, None);

        assert!(matches!(
            remember_composer_shortcut(root.path(), Some("")),
            Err(PreferencesError::InvalidValue)
        ));
        assert_eq!(read(root.path()).expect("read"), cleared);
    }
}

#[cfg(test)]
mod concurrency_tests {
    use std::sync::{Arc, Barrier};
    use std::thread;

    use super::*;

    #[test]
    fn concurrent_changes_never_drop_one_another() {
        // Every change reads and rewrites the whole file; unserialised, the
        // later write drops the earlier change, which many rounds expose.
        for _ in 0..40 {
            let root = tempfile::tempdir().expect("root");
            let workspace = root.path().join("Charon");
            let start = Arc::new(Barrier::new(5));
            let changes: Vec<Box<dyn FnOnce() + Send>> = vec![
                Box::new({
                    let root = root.path().to_owned();
                    move || {
                        set_background_mode(root, true).expect("background");
                    }
                }),
                Box::new({
                    let root = root.path().to_owned();
                    move || {
                        set_capture_notifications(root, true).expect("notifications");
                    }
                }),
                Box::new({
                    let root = root.path().to_owned();
                    move || {
                        set_rich_capture(root, true).expect("rich capture");
                    }
                }),
                Box::new({
                    let root = root.path().to_owned();
                    move || {
                        remember_composer_shortcut(root, Some("Ctrl+Alt+N")).expect("shortcut");
                    }
                }),
                Box::new({
                    let root = root.path().to_owned();
                    let workspace = workspace.clone();
                    move || {
                        remember_workspace(root, &workspace).expect("workspace");
                    }
                }),
            ];
            let threads = changes
                .into_iter()
                .map(|change| {
                    let start = Arc::clone(&start);
                    thread::spawn(move || {
                        start.wait();
                        change();
                    })
                })
                .collect::<Vec<_>>();
            for handle in threads {
                handle.join().expect("change thread");
            }

            let stored = read(root.path()).expect("read");
            assert!(stored.background_mode);
            assert!(stored.capture_notifications);
            assert!(stored.rich_capture);
            assert_eq!(stored.composer_shortcut.as_deref(), Some("Ctrl+Alt+N"));
            assert_eq!(stored.last_workspace_path.as_deref(), workspace.to_str());
        }
    }
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
