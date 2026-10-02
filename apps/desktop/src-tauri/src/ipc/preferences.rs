#[cfg(any(target_os = "linux", test))]
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

use super::{notification, shell};
use crate::preferences::{InstallKind, PreferencesIpcError, PreferencesSnapshot};

static INSTALL_KIND: OnceLock<InstallKind> = OnceLock::new();

/// Every access goes through `crate::preferences`, whose process-wide lock
/// keeps concurrent commands from overwriting one another's changes.
fn root(app: &AppHandle) -> Result<PathBuf, PreferencesIpcError> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| crate::preferences::PreferencesError::InvalidPath)?)
}

pub(crate) fn read_persisted(
    app: &AppHandle,
) -> Result<crate::preferences::PersistedPreferences, PreferencesIpcError> {
    crate::preferences::read(root(app)?).map_err(PreferencesIpcError::from)
}

pub(crate) fn remember_workspace(
    app: &AppHandle,
    path: &Path,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    crate::preferences::remember_workspace(root(app)?, path)
        .map(|snapshot| with_runtime(app, snapshot))
        .map_err(PreferencesIpcError::from)
}

/// Stores the user's composer accelerator (ADR 0025), or clears it with `None`.
pub(crate) fn remember_composer_shortcut(
    app: &AppHandle,
    shortcut: Option<String>,
) -> Result<(), PreferencesIpcError> {
    crate::preferences::remember_composer_shortcut(root(app)?, shortcut.as_deref())
        .map(|_| ())
        .map_err(PreferencesIpcError::from)
}

#[tauri::command(async)]
pub fn preferences_read(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(with_runtime(&app, read_persisted(&app)?.snapshot()))
}

#[tauri::command(async)]
pub fn preferences_reset(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let preferences = crate::preferences::reset(root(&app)?)?;
    // The reset file has background mode, capture notifications, and formatted
    // capture off and no chosen composer shortcut, so the tray, the
    // notification, a custom accelerator, and the HTML read go with it.
    shell::disable_background(&app);
    notification::set_enabled(&app, false);
    super::capture::reset_shortcut(&app);
    super::capture::apply_rich_capture(&app, false);
    Ok(with_runtime(&app, preferences.snapshot()))
}

/// Enabling shows the tray before persisting, so a stored `true` always had a
/// working icon; disabling persists first, then removes the icon.
#[tauri::command(async)]
pub fn preferences_set_background_mode(
    app: AppHandle,
    enabled: bool,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let root = root(&app)?;
    let preferences = if enabled {
        shell::enable_background(&app)?;
        crate::preferences::set_background_mode(root, true).inspect_err(|_| {
            shell::disable_background(&app);
        })?
    } else {
        let preferences = crate::preferences::set_background_mode(root, false)?;
        shell::disable_background(&app);
        preferences
    };
    Ok(with_runtime(&app, preferences.snapshot()))
}

/// Persists the capture-notification choice (ADR 0024), then applies it to the
/// running capture path; a failed write leaves both unchanged.
#[tauri::command(async)]
pub fn preferences_set_capture_notifications(
    app: AppHandle,
    enabled: bool,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let root = root(&app)?;
    let preferences = crate::preferences::set_capture_notifications(root, enabled)?;
    notification::set_enabled(&app, preferences.capture_notifications);
    Ok(with_runtime(&app, preferences.snapshot()))
}

/// Persists the formatted-capture choice (ADR 0026), then applies it to the
/// running capture adapter; a failed write leaves both unchanged.
#[tauri::command(async)]
pub fn preferences_set_rich_capture(
    app: AppHandle,
    enabled: bool,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let root = root(&app)?;
    let preferences = crate::preferences::set_rich_capture(root, enabled)?;
    super::capture::apply_rich_capture(&app, preferences.rich_capture);
    Ok(with_runtime(&app, preferences.snapshot()))
}

/// Adds the runtime-only facts the persisted file cannot hold.
fn with_runtime(app: &AppHandle, mut snapshot: PreferencesSnapshot) -> PreferencesSnapshot {
    snapshot.install_kind = *INSTALL_KIND.get_or_init(detect_install_kind);
    snapshot.tray_availability = shell::tray_availability();
    snapshot.background_active = shell::background_active(app);
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
            detect_linux_install_kind(None, Some(Path::new("/usr/bin/Charon")), true, true,),
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
