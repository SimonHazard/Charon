use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::preferences::{PreferencesIpcError, PreferencesSnapshot, PreferencesStorage};

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
    crate::preferences::remember_workspace(root, path).map_err(PreferencesIpcError::from)
}

#[tauri::command(async)]
pub fn preferences_read(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(storage(&app)?.read()?.snapshot())
}

#[tauri::command(async)]
pub fn preferences_reset(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(storage(&app)?.reset()?.snapshot())
}
