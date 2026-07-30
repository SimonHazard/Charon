use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::workspace::{
    Workspace, WorkspaceCommand, WorkspaceCommandResult, WorkspaceHealth, WorkspaceIpcError,
    WorkspaceSnapshot,
};

#[derive(Default)]
pub struct WorkspaceRuntime {
    current: Mutex<Option<Workspace>>,
}

#[tauri::command]
pub fn workspace_choose_directory(app: AppHandle) -> Result<Option<String>, WorkspaceIpcError> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| {
            path.into_path()
                .map_err(|_| crate::workspace::WorkspaceError::InvalidPath.into())
                .and_then(|path| {
                    path.into_os_string()
                        .into_string()
                        .map_err(|_| crate::workspace::WorkspaceError::InvalidPath.into())
                })
        })
        .transpose()
}

#[tauri::command]
pub fn workspace_create(
    path: String,
    initial_section_name: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    replace_workspace(&runtime, Workspace::create(path, initial_section_name)?)
}

#[tauri::command]
pub fn workspace_open(
    path: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    replace_workspace(&runtime, Workspace::open(path)?)
}

#[tauri::command]
pub fn workspace_snapshot(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    with_workspace(&runtime, |workspace| {
        let snapshot = workspace.snapshot()?;
        emit_pending(&app, workspace);
        Ok(snapshot)
    })
}

#[tauri::command]
pub fn workspace_execute(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
    command: WorkspaceCommand,
) -> Result<WorkspaceCommandResult, WorkspaceIpcError> {
    with_workspace(&runtime, |workspace| {
        let result = workspace.execute(command)?;
        emit_pending(&app, workspace);
        Ok(result)
    })
}

#[tauri::command]
pub fn workspace_health(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceHealth, WorkspaceIpcError> {
    with_workspace(&runtime, |workspace| {
        let health = workspace.health()?;
        emit_pending(&app, workspace);
        Ok(health)
    })
}

#[tauri::command]
pub fn workspace_close(runtime: State<'_, WorkspaceRuntime>) -> Result<(), WorkspaceIpcError> {
    let mut current = runtime.current.lock().map_err(|_| WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    })?;
    if let Some(mut workspace) = current.take() {
        workspace.stop_watching();
    }
    Ok(())
}

fn replace_workspace(
    runtime: &State<'_, WorkspaceRuntime>,
    mut workspace: Workspace,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let mut current = runtime.current.lock().map_err(|_| WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    })?;
    if let Some(mut previous) = current.take() {
        previous.stop_watching();
    }
    workspace.start_watching()?;
    let snapshot = workspace.snapshot()?;
    *current = Some(workspace);
    Ok(snapshot)
}

fn with_workspace<T>(
    runtime: &State<'_, WorkspaceRuntime>,
    operation: impl FnOnce(&mut Workspace) -> Result<T, crate::workspace::WorkspaceError>,
) -> Result<T, WorkspaceIpcError> {
    let mut current = runtime.current.lock().map_err(|_| WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    })?;
    let workspace = current
        .as_mut()
        .ok_or(crate::workspace::WorkspaceError::NotOpen)?;
    operation(workspace).map_err(WorkspaceIpcError::from)
}

fn emit_pending(app: &AppHandle, workspace: &mut Workspace) {
    for event in workspace.take_events() {
        let _ = app.emit("workspace://changed", event);
    }
}
