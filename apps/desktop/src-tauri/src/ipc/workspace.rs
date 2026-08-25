use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::workspace::{
    Workspace, WorkspaceCommand, WorkspaceCommandResult, WorkspaceHealth, WorkspaceHealthIssue,
    WorkspaceHealthIssueKind, WorkspaceIpcError, WorkspaceSnapshot,
};

#[derive(Default)]
pub struct WorkspaceRuntime {
    current: Mutex<Option<Workspace>>,
    switching: Mutex<()>,
}

#[tauri::command]
pub async fn workspace_choose_directory(
    app: AppHandle,
) -> Result<Option<String>, WorkspaceIpcError> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    app.dialog().file().pick_folder(move |selection| {
        let _ = sender.blocking_send(selection);
    });
    selected_folder_path(receiver.recv().await.flatten())
}

fn selected_folder_path(
    selection: Option<tauri_plugin_dialog::FilePath>,
) -> Result<Option<String>, WorkspaceIpcError> {
    selection
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
    app: AppHandle,
    path: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let path = PathBuf::from(path);
    let snapshot = replace_workspace(&runtime, Workspace::create(&path)?)?;
    remember_workspace(&app, &path)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn workspace_open_or_create(
    app: AppHandle,
    path: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let path = PathBuf::from(path);
    let snapshot = replace_workspace(&runtime, open_or_create_workspace(&path)?)?;
    remember_workspace(&app, &path)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn workspace_bootstrap(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let preferences = super::preferences::read_persisted(&app).map_err(preferences_error)?;
    if let Some(path) = preferences.last_workspace_path {
        let path = PathBuf::from(path);
        return match Workspace::open(&path) {
            Ok(workspace) => replace_workspace(&runtime, workspace),
            Err(
                crate::workspace::WorkspaceError::InvalidPath
                | crate::workspace::WorkspaceError::Io(_),
            ) => workspace_bootstrap_default(app, runtime),
            Err(error) => Err(error.into()),
        };
    }
    workspace_bootstrap_default(app, runtime)
}

#[tauri::command]
pub fn workspace_bootstrap_default(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let documents = match app.path().document_dir() {
        Ok(path) => path,
        Err(_) => app
            .path()
            .home_dir()
            .map(|home| home.join("Documents"))
            .map_err(|_| crate::workspace::WorkspaceError::DefaultLocationUnavailable)?,
    };
    let path = resolve_default_workspace_path(&documents)?;
    let snapshot = replace_workspace(&runtime, open_or_create_workspace(&path)?)?;
    remember_workspace(&app, &path)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn workspace_open(
    app: AppHandle,
    path: String,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let path = PathBuf::from(path);
    let snapshot = replace_workspace(&runtime, Workspace::open(&path)?)?;
    remember_workspace(&app, &path)?;
    Ok(snapshot)
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
    let _switch = runtime.switching.lock().map_err(|_| runtime_lock_error())?;
    workspace.start_watching()?;
    let snapshot = validate_candidate(&mut workspace)?;
    let mut current = runtime.current.lock().map_err(|_| WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    })?;
    let mut previous = current.replace(workspace);
    drop(current);
    if let Some(previous) = previous.as_mut() {
        previous.stop_watching();
    }
    Ok(snapshot)
}

fn validate_candidate(workspace: &mut Workspace) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
    let snapshot = workspace.snapshot()?;
    let health = workspace.health()?;
    if health.issues.iter().any(blocks_open) {
        return Err(crate::workspace::WorkspaceError::Validation(
            "candidate Workspace cannot be opened safely".to_owned(),
        )
        .into());
    }
    let missing_attachments = health
        .issues
        .iter()
        .filter(|issue| issue.kind == WorkspaceHealthIssueKind::MissingAttachment)
        .filter_map(|issue| issue.resource_id.as_deref())
        .collect::<std::collections::HashSet<_>>();
    for note in &snapshot.notes {
        for attachment in &note.attachments {
            if missing_attachments.contains(attachment.id.as_str()) {
                continue;
            }
            workspace.canonical_managed_path(&attachment.relative_path)?;
        }
    }
    Ok(snapshot)
}

fn blocks_open(issue: &WorkspaceHealthIssue) -> bool {
    matches!(
        issue.kind,
        WorkspaceHealthIssueKind::InvalidManifest | WorkspaceHealthIssueKind::RecoveryRequired
    )
}

fn remember_workspace(app: &AppHandle, path: &Path) -> Result<(), WorkspaceIpcError> {
    super::preferences::remember_workspace(app, path)
        .map(|_| ())
        .map_err(preferences_error)
}

fn preferences_error(error: crate::preferences::PreferencesIpcError) -> WorkspaceIpcError {
    WorkspaceIpcError {
        code: format!("preferences_{}", error.code),
        message_key: error.message_key,
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    }
}

fn runtime_lock_error() -> WorkspaceIpcError {
    WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    }
}

fn open_or_create_workspace(path: &Path) -> Result<Workspace, crate::workspace::WorkspaceError> {
    match fs::symlink_metadata(path.join("charon.workspace.json")) {
        Ok(_) => Workspace::open(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Workspace::create(path),
        Err(error) => Err(error.into()),
    }
}

fn resolve_default_workspace_path(
    documents: &Path,
) -> Result<PathBuf, crate::workspace::WorkspaceError> {
    let primary = documents.join("Charon");
    if default_candidate_is_safe(&primary)? {
        return Ok(primary);
    }

    let fallback = documents.join("Charon Workspace");
    if default_candidate_is_safe(&fallback)? {
        return Ok(fallback);
    }

    Err(crate::workspace::WorkspaceError::Validation(
        "default Workspace paths are occupied by non-Workspace entries".to_owned(),
    ))
}

fn default_candidate_is_safe(path: &Path) -> Result<bool, crate::workspace::WorkspaceError> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error.into()),
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Ok(false),
        Ok(_) => match fs::symlink_metadata(path.join("charon.workspace.json")) {
            Ok(_) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        },
    }
}

pub(crate) fn with_workspace<T>(
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

pub(crate) fn create_capture_note(
    app: &AppHandle,
    runtime: &State<'_, WorkspaceRuntime>,
    body: String,
) -> Result<bool, WorkspaceIpcError> {
    let mut current = runtime.current.lock().map_err(|_| WorkspaceIpcError {
        code: "runtime_lock".to_owned(),
        message_key: "workspace_error_runtime_lock".to_owned(),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    })?;
    let Some(workspace) = current.as_mut() else {
        return Ok(false);
    };
    let created = execute_capture_note(workspace, body)?;
    if created {
        emit_pending(app, workspace);
    }
    Ok(created)
}

fn execute_capture_note(
    workspace: &mut Workspace,
    body: String,
) -> Result<bool, crate::workspace::WorkspaceError> {
    if body.trim().is_empty() {
        return Ok(false);
    }
    let snapshot = workspace.snapshot()?;
    workspace.execute(WorkspaceCommand::CreateNote {
        expected_revision: snapshot.revision,
        body,
    })?;
    Ok(true)
}

fn emit_pending(app: &AppHandle, workspace: &mut Workspace) {
    for event in workspace.take_events() {
        let _ = app.emit("workspace://changed", event);
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::future::Future;

    use super::{
        execute_capture_note, open_or_create_workspace, resolve_default_workspace_path,
        selected_folder_path, validate_candidate, workspace_choose_directory,
    };
    use crate::workspace::{
        Workspace, WorkspaceCommand, WorkspaceHealthIssueKind, WorkspaceIpcError,
    };
    use tempfile::tempdir;

    #[test]
    fn capture_note_creates_one_flat_note_with_exact_body() {
        let mut workspace = Workspace::in_memory().expect("workspace");
        assert!(
            execute_capture_note(&mut workspace, "  exact selection\n".to_owned())
                .expect("capture note")
        );
        let snapshot = workspace.snapshot().expect("snapshot");
        assert_eq!(snapshot.notes.len(), 1);
        assert_eq!(snapshot.notes[0].body, "  exact selection\n");
        assert_eq!(snapshot.revision, 1);
    }

    #[test]
    fn capture_note_rejects_whitespace() {
        let mut workspace = Workspace::in_memory().expect("workspace");
        assert!(!execute_capture_note(&mut workspace, "  \n".to_owned()).expect("capture note"));
    }

    #[test]
    fn workspace_chooser_remains_async_for_the_native_dialog_event_loop() {
        fn assert_async_command<F, Fut>(_command: F)
        where
            F: FnOnce(tauri::AppHandle) -> Fut,
            Fut: Future<Output = Result<Option<String>, WorkspaceIpcError>>,
        {
        }

        assert_async_command(workspace_choose_directory);
    }

    #[test]
    fn workspace_chooser_returns_the_selected_local_folder() {
        let root = tempdir().expect("folder");
        let selected =
            selected_folder_path(Some(root.path().to_path_buf().into())).expect("selected folder");
        assert_eq!(selected.as_deref(), root.path().to_str());
        assert_eq!(selected_folder_path(None).expect("cancelled folder"), None);
    }

    #[test]
    fn default_workspace_uses_charon_for_a_fresh_documents_directory() {
        let documents = tempdir().expect("documents");
        assert_eq!(
            resolve_default_workspace_path(documents.path()).expect("default path"),
            documents.path().join("Charon")
        );
    }

    #[test]
    fn default_workspace_preserves_an_unrelated_primary_directory() {
        let documents = tempdir().expect("documents");
        let primary = documents.path().join("Charon");
        fs::create_dir(&primary).expect("primary collision");
        fs::write(primary.join("keep.txt"), "untouched").expect("collision contents");

        assert_eq!(
            resolve_default_workspace_path(documents.path()).expect("fallback path"),
            documents.path().join("Charon Workspace")
        );
        assert_eq!(
            fs::read_to_string(primary.join("keep.txt")).expect("preserved contents"),
            "untouched"
        );
    }

    #[test]
    fn default_workspace_reopens_an_existing_workspace() {
        let documents = tempdir().expect("documents");
        let path = documents.path().join("Charon");
        let mut created = open_or_create_workspace(&path).expect("create workspace");
        let workspace_id = created.snapshot().expect("created snapshot").workspace_id;
        drop(created);

        assert_eq!(
            resolve_default_workspace_path(documents.path()).expect("existing path"),
            path
        );
        let mut reopened = open_or_create_workspace(&path).expect("reopen workspace");
        let snapshot = reopened.snapshot().expect("reopened snapshot");
        assert_eq!(snapshot.workspace_id, workspace_id);
        assert!(snapshot.notes.is_empty());
    }

    #[test]
    fn default_workspace_stops_when_both_candidates_are_unrelated() {
        let documents = tempdir().expect("documents");
        for name in ["Charon", "Charon Workspace"] {
            let path = documents.path().join(name);
            fs::create_dir(&path).expect("collision");
            fs::write(path.join("keep.txt"), name).expect("collision contents");
        }

        assert!(resolve_default_workspace_path(documents.path()).is_err());
        for name in ["Charon", "Charon Workspace"] {
            assert_eq!(
                fs::read_to_string(documents.path().join(name).join("keep.txt"))
                    .expect("preserved contents"),
                name
            );
            assert!(!documents
                .path()
                .join(name)
                .join("charon.workspace.json")
                .exists());
        }
    }

    #[test]
    fn open_reports_import_candidate_instead_of_refusing() {
        let root = tempdir().expect("Workspace");
        let mut workspace = Workspace::create(root.path()).expect("create Workspace");
        workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "known".to_owned(),
            })
            .expect("create Note");
        fs::write(root.path().join("notes/stray.md"), "stray").expect("stray Note");
        drop(workspace);

        let mut reopened = Workspace::open(root.path()).expect("domain open");
        let snapshot = validate_candidate(&mut reopened).expect("IPC candidate open");
        assert_eq!(snapshot.notes.len(), 1);
        assert!(reopened
            .health()
            .expect("health")
            .issues
            .iter()
            .any(|issue| { issue.kind == WorkspaceHealthIssueKind::ImportCandidate }));
    }

    #[test]
    fn open_reports_missing_attachment_instead_of_refusing() {
        let root = tempdir().expect("Workspace");
        let source_root = tempdir().expect("source");
        let source = source_root.path().join("brief.txt");
        fs::write(&source, "attachment").expect("source file");
        let mut workspace = Workspace::create(root.path()).expect("create Workspace");
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "known".to_owned(),
            })
            .expect("create Note");
        let imported = workspace
            .execute(WorkspaceCommand::ImportNoteAttachments {
                expected_revision: created.snapshot.revision,
                note_id: created.snapshot.notes[0].id.clone(),
                source_paths: vec![source.to_string_lossy().into_owned()],
            })
            .expect("import Attachment");
        fs::remove_file(
            root.path()
                .join(&imported.snapshot.notes[0].attachments[0].relative_path),
        )
        .expect("delete managed Attachment");
        drop(workspace);

        let mut reopened = Workspace::open(root.path()).expect("domain open");
        let snapshot = validate_candidate(&mut reopened).expect("IPC candidate open");
        assert_eq!(snapshot.notes.len(), 1);
        assert!(reopened
            .health()
            .expect("health")
            .issues
            .iter()
            .any(|issue| { issue.kind == WorkspaceHealthIssueKind::MissingAttachment }));
    }

    #[test]
    fn open_reports_missing_note_body() {
        let root = tempdir().expect("Workspace");
        let mut workspace = Workspace::create(root.path()).expect("create Workspace");
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "known".to_owned(),
            })
            .expect("create Note");
        let note_id = created.snapshot.notes[0].id.clone();
        fs::remove_file(root.path().join(format!("notes/{note_id}.md"))).expect("delete Note body");
        drop(workspace);

        let mut reopened = Workspace::open(root.path()).expect("domain open");
        let snapshot = reopened.snapshot().expect("snapshot");
        assert_eq!(snapshot.notes[0].id, note_id);
        assert_eq!(snapshot.notes[0].body, "");
        assert!(reopened
            .health()
            .expect("health")
            .issues
            .iter()
            .any(|issue| {
                issue.kind == WorkspaceHealthIssueKind::MissingNote
                    && issue.resource_id.as_deref() == Some(note_id.as_str())
            }));
        assert!(matches!(
            reopened.execute(WorkspaceCommand::UpdateNote {
                expected_revision: snapshot.revision,
                note_id: note_id.clone(),
                body: "replacement".to_owned(),
            }),
            Err(crate::workspace::WorkspaceError::Validation(_))
        ));
        let deleted = reopened
            .execute(WorkspaceCommand::DeleteNote {
                expected_revision: snapshot.revision,
                note_id,
            })
            .expect("explicitly delete the sole quarantined Note");
        assert!(deleted.snapshot.notes.is_empty());
    }

    #[test]
    fn open_reports_invalid_note_body() {
        let root = tempdir().expect("Workspace");
        let mut workspace = Workspace::create(root.path()).expect("create Workspace");
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "known".to_owned(),
            })
            .expect("create Note");
        let note_id = created.snapshot.notes[0].id.clone();
        fs::write(root.path().join(format!("notes/{note_id}.md")), [0xff])
            .expect("invalidate Note body");
        drop(workspace);

        let mut reopened = Workspace::open(root.path()).expect("domain open");
        let snapshot = validate_candidate(&mut reopened).expect("IPC candidate open");
        assert_eq!(snapshot.notes[0].body, "");
        assert!(reopened
            .health()
            .expect("health")
            .issues
            .iter()
            .any(|issue| {
                issue.kind == WorkspaceHealthIssueKind::InvalidNote
                    && issue.resource_id.as_deref() == Some(note_id.as_str())
            }));
    }
}
