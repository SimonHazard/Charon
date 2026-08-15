use tauri::{AppHandle, State};

use crate::clipboard::{
    compose_and_write, ClipboardIpcError, ComposeAttachment, ComposeNote, ComposeRequest,
    ComposedClipboard, TauriClipboardWriter,
};
use crate::workspace::{Workspace, WorkspaceError};

use super::workspace::{with_workspace, WorkspaceRuntime};

#[tauri::command]
pub fn clipboard_compose_and_write(
    app: AppHandle,
    request: ComposeRequest,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<ComposedClipboard, ClipboardIpcError> {
    let note = with_workspace(&runtime, |workspace| resolve_request(workspace, &request))?;
    let mut writer = TauriClipboardWriter::new(&app);
    compose_and_write(&mut writer, &note).map_err(ClipboardIpcError::from)
}

fn resolve_request(
    workspace: &mut Workspace,
    request: &ComposeRequest,
) -> Result<ComposeNote, WorkspaceError> {
    let snapshot = workspace.snapshot()?;
    if request.expected_revision != snapshot.revision {
        return Err(WorkspaceError::StaleRevision {
            expected: request.expected_revision,
            actual: snapshot.revision,
        });
    }
    if request.note_id.is_empty() {
        return Err(WorkspaceError::Validation(
            "clipboard note ID cannot be empty".to_owned(),
        ));
    }
    let note = snapshot
        .notes
        .iter()
        .find(|note| note.id == request.note_id)
        .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))?;
    let attachments = note
        .attachments
        .iter()
        .map(|attachment| {
            Ok(ComposeAttachment {
                id: attachment.id.clone(),
                file_name: attachment.file_name.clone(),
                absolute_path: workspace.canonical_managed_path(&attachment.relative_path)?,
                created_at: attachment.created_at.clone(),
            })
        })
        .collect::<Result<Vec<_>, WorkspaceError>>()?;
    Ok(ComposeNote {
        body: note.body.clone(),
        tags: note.tags.clone(),
        attachments,
    })
}
