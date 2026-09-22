#[cfg(any(target_os = "linux", test))]
use std::ffi::OsStr;
use std::path::Path;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

use crate::preferences::{
    InstallKind, PreferencesIpcError, PreferencesSnapshot, PreferencesStorage,
};

static INSTALL_KIND: OnceLock<InstallKind> = OnceLock::new();

fn storage(app: &AppHandle) -> Result<PreferencesStorage, PreferencesIpcError> {
    let root = app
        .path()
        .app_config_dir()
        .map_err(|_| crate::preferences::PreferencesError::InvalidPath)?;
    Ok(PreferencesStorage::new(root))
}

pub(crate) fn read_persisted(
    app: &AppHandle,
) -> Result<crate::preferences::PersistedPreferences, PreferencesIpcError> {
    storage(app)?.read().map_err(PreferencesIpcError::from)
}

pub(crate) fn remember_workspace(
    app: &AppHandle,
    path: &Path,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let root = app
        .path()
        .app_config_dir()
        .map_err(|_| crate::preferences::PreferencesError::InvalidPath)?;
    crate::preferences::remember_workspace(root, path)
        .map(with_install_kind)
        .map_err(PreferencesIpcError::from)
}

#[tauri::command(async)]
pub fn preferences_read(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(with_install_kind(storage(&app)?.read()?.snapshot()))
}

#[tauri::command(async)]
pub fn preferences_reset(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(with_install_kind(storage(&app)?.reset()?.snapshot()))
}

fn with_install_kind(mut snapshot: PreferencesSnapshot) -> PreferencesSnapshot {
    snapshot.install_kind = *INSTALL_KIND.get_or_init(detect_install_kind);
    snapshot
}

#[cfg(target_os = "linux")]
fn detect_install_kind() -> InstallKind {
    detect_linux_install_kind(
        std::env::var_os("APPIMAGE").as_deref(),
        std::env::current_exe().ok().as_deref(),
        Path::new("/var/lib/dpkg/status").exists(),
        Path::new("/var/lib/rpm").exists(),
    )
}

#[cfg(target_os = "windows")]
fn detect_install_kind() -> InstallKind {
    detect_windows_install_kind(std::env::current_exe().ok().as_deref())
}

#[cfg(target_os = "macos")]
fn detect_install_kind() -> InstallKind {
    InstallKind::Macos
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
fn detect_install_kind() -> InstallKind {
    InstallKind::Unknown
}

#[cfg(any(target_os = "linux", test))]
fn detect_linux_install_kind(
    appimage: Option<&OsStr>,
    executable: Option<&Path>,
    dpkg_status_exists: bool,
    rpm_database_exists: bool,
) -> InstallKind {
    if appimage.is_some() {
        return InstallKind::Appimage;
    }
    if executable.is_some_and(|path| path.starts_with(Path::new("/usr/"))) && dpkg_status_exists {
        return InstallKind::Deb;
    }
    if rpm_database_exists {
        return InstallKind::Rpm;
    }
    InstallKind::Unknown
}

#[cfg(any(target_os = "windows", test))]
fn detect_windows_install_kind(executable: Option<&Path>) -> InstallKind {
    let Some(executable) = executable else {
        return InstallKind::Unknown;
    };
    if executable
        .parent()
        .is_some_and(|parent| parent.join("uninstall.exe").is_file())
    {
        InstallKind::Nsis
    } else {
        InstallKind::Msi
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_detection_prefers_appimage_and_distinguishes_package_managers() {
        assert_eq!(
            detect_linux_install_kind(
                Some(OsStr::new("/tmp/Charon.AppImage")),
                Some(Path::new("/usr/bin/Charon")),
                true,
                true,
            ),
            InstallKind::Appimage
        );
        assert_eq!(
            detect_linux_install_kind(
                None,
                Some(Path::new("/usr/bin/Charon")),
                true,
                true,
            ),
            InstallKind::Deb
        );
        assert_eq!(
            detect_linux_install_kind(None, Some(Path::new("/opt/Charon")), false, true),
            InstallKind::Rpm
        );
        assert_eq!(
            detect_linux_install_kind(None, Some(Path::new("/opt/Charon")), false, false),
            InstallKind::Unknown
        );
    }

    #[test]
    fn windows_detection_uses_the_adjacent_uninstaller_marker() {
        assert_eq!(detect_windows_install_kind(None), InstallKind::Unknown);

        let directory = tempfile::tempdir().expect("temporary install directory");
        let executable = directory.path().join("Charon.exe");
        std::fs::write(directory.path().join("uninstall.exe"), b"marker")
            .expect("uninstaller marker");
        assert_eq!(
            detect_windows_install_kind(Some(&executable)),
            InstallKind::Nsis
        );
        std::fs::remove_file(directory.path().join("uninstall.exe")).expect("remove marker");
        assert_eq!(
            detect_windows_install_kind(Some(&executable)),
            InstallKind::Msi
        );
    }
}
