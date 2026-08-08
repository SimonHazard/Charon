use std::collections::{HashMap, HashSet};

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
    let notes = with_workspace(&runtime, |workspace| resolve_request(workspace, &request))?;
    let mut writer = TauriClipboardWriter::new(&app);
    compose_and_write(&mut writer, &notes).map_err(ClipboardIpcError::from)
}

fn resolve_request(
    workspace: &mut Workspace,
    request: &ComposeRequest,
) -> Result<Vec<ComposeNote>, WorkspaceError> {
    let snapshot = workspace.snapshot()?;
    if request.expected_revision != snapshot.revision {
        return Err(WorkspaceError::StaleRevision {
            expected: request.expected_revision,
            actual: snapshot.revision,
        });
    }
    if request.note_ids.is_empty() {
        return Err(WorkspaceError::Validation(
            "clipboard selection cannot be empty".to_owned(),
        ));
    }
    let notes = snapshot
        .notes
        .iter()
        .map(|note| (note.id.as_str(), note))
        .collect::<HashMap<_, _>>();
    let mut ids = HashSet::new();
    request
        .note_ids
        .iter()
        .map(|id| {
            if !ids.insert(id.as_str()) {
                return Err(WorkspaceError::Validation(
                    "clipboard selection contains duplicate IDs".to_owned(),
                ));
            }
            let note = notes
                .get(id.as_str())
                .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))?;
            if note.body.trim().is_empty() {
                return Err(WorkspaceError::Validation(
                    "clipboard selection contains an empty body".to_owned(),
                ));
            }
            let attachments = note
                .attachments
                .iter()
                .map(|attachment| {
                    Ok(ComposeAttachment {
                        id: attachment.id.clone(),
                        file_name: attachment.file_name.clone(),
                        absolute_path: workspace
                            .canonical_managed_path(&attachment.relative_path)?,
                        created_at: attachment.created_at.clone(),
                    })
                })
                .collect::<Result<Vec<_>, WorkspaceError>>()?;
            Ok(ComposeNote {
                id: note.id.clone(),
                body: note.body.clone(),
                tags: note.tags.clone(),
                attachments,
            })
        })
        .collect()
}
