use std::collections::{HashMap, HashSet};

use tauri::{AppHandle, State};

use crate::clipboard::{
    compose, compose_and_write, ClipboardError, ClipboardIpcError, ComposeRequest,
    ComposedClipboard, TauriClipboardWriter,
};
use crate::workspace::WorkspaceSnapshot;

use super::workspace::{current_snapshot, WorkspaceRuntime};

#[tauri::command]
pub fn clipboard_preview(
    request: ComposeRequest,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<ComposedClipboard, ClipboardIpcError> {
    let snapshot = current_snapshot(&runtime)?;
    validate_against_snapshot(&request, &snapshot)?;
    compose(&request).map_err(ClipboardIpcError::from)
}

#[tauri::command]
pub fn clipboard_compose_and_write(
    app: AppHandle,
    request: ComposeRequest,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<ComposedClipboard, ClipboardIpcError> {
    let snapshot = current_snapshot(&runtime)?;
    validate_against_snapshot(&request, &snapshot)?;
    let mut writer = TauriClipboardWriter::new(&app);
    compose_and_write(&mut writer, &request).map_err(ClipboardIpcError::from)
}

pub(crate) fn validate_against_snapshot(
    request: &ComposeRequest,
    snapshot: &WorkspaceSnapshot,
) -> Result<(), ClipboardError> {
    let sections = snapshot
        .sections
        .iter()
        .map(|section| (section.id.as_str(), section.name.as_str()))
        .collect::<HashMap<_, _>>();
    let notes = snapshot
        .notes
        .iter()
        .map(|note| (note.id.as_str(), note))
        .collect::<HashMap<_, _>>();
    let mut requested_ids = HashSet::with_capacity(request.notes.len());

    for requested in &request.notes {
        let current = notes
            .get(requested.id.as_str())
            .ok_or(ClipboardError::InvalidRequest)?;
        let section_name = sections
            .get(current.section_id.as_str())
            .ok_or(ClipboardError::InvalidRequest)?;
        if !requested_ids.insert(requested.id.as_str())
            || requested.body != current.body
            || requested.section_name != *section_name
        {
            return Err(ClipboardError::InvalidRequest);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::{ComposeNote, ComposeOptions, CopyPreset};
    use crate::workspace::{NoteDto, NoteStatus, SectionDto};

    fn snapshot() -> WorkspaceSnapshot {
        WorkspaceSnapshot {
            schema_version: 1,
            workspace_id: "workspace".to_owned(),
            revision: 1,
            sections: vec![SectionDto {
                id: "section".to_owned(),
                name: "Inbox".to_owned(),
                sort_key: 0,
                created_at: "2026-07-31T00:00:00Z".to_owned(),
                updated_at: "2026-07-31T00:00:00Z".to_owned(),
            }],
            notes: vec![NoteDto {
                id: "note".to_owned(),
                section_id: "section".to_owned(),
                body: "current".to_owned(),
                status: NoteStatus::Open,
                sort_key: 0,
                created_at: "2026-07-31T00:00:00Z".to_owned(),
                updated_at: "2026-07-31T00:00:00Z".to_owned(),
                completed_at: None,
                trashed_at: None,
            }],
        }
    }

    fn request(body: &str) -> ComposeRequest {
        ComposeRequest {
            notes: vec![ComposeNote {
                id: "note".to_owned(),
                section_name: "Inbox".to_owned(),
                body: body.to_owned(),
                selection_order: 0,
            }],
            preset: CopyPreset::Plain,
            options: ComposeOptions::default(),
        }
    }

    #[test]
    fn clipboard_ipc_validates_current_note_values() {
        assert!(validate_against_snapshot(&request("current"), &snapshot()).is_ok());
        assert!(matches!(
            validate_against_snapshot(&request("stale"), &snapshot()),
            Err(ClipboardError::InvalidRequest)
        ));
    }
}
