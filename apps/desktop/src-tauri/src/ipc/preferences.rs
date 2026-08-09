use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::preferences::{
    PreferencesIpcError, PreferencesSnapshot, PreferencesStorage, PreferencesUpdate,
};

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

#[tauri::command]
pub fn preferences_read(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(storage(&app)?.read()?.snapshot())
}

#[tauri::command]
pub fn preferences_update(
    app: AppHandle,
    update: PreferencesUpdate,
) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    let storage = storage(&app)?;
    let mut preferences = storage.read()?;
    preferences.capture_hint_dismissed = update.capture_hint_dismissed;
    storage.write(&preferences)?;
    Ok(preferences.snapshot())
}

#[tauri::command]
pub fn preferences_reset(app: AppHandle) -> Result<PreferencesSnapshot, PreferencesIpcError> {
    Ok(storage(&app)?.reset()?.snapshot())
}
