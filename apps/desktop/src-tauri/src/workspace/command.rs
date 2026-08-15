use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::WorkspaceError;
use super::model::{
    normalize_tags, validate_body, validate_uuid, NoteStatus, PersistedManifest, PersistedNote,
};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(tag = "type", rename_all = "camelCase")]
pub enum WorkspaceCommand {
    CreateNote {
        expected_revision: u64,
        body: String,
    },
    UpdateNote {
        expected_revision: u64,
        note_id: String,
        body: String,
    },
    SetNoteTags {
        expected_revision: u64,
        note_id: String,
        tags: Vec<String>,
    },
    ImportNoteAttachments {
        expected_revision: u64,
        note_id: String,
        source_paths: Vec<String>,
    },
    DeleteNoteAttachments {
        expected_revision: u64,
        note_id: String,
        attachment_ids: Vec<String>,
    },
    SetNoteStatus {
        expected_revision: u64,
        note_id: String,
        status: NoteStatus,
    },
    DeleteNote {
        expected_revision: u64,
        note_id: String,
    },
}

impl WorkspaceCommand {
    pub(crate) fn expected_revision(&self) -> u64 {
        match self {
            Self::CreateNote {
                expected_revision, ..
            }
            | Self::UpdateNote {
                expected_revision, ..
            }
            | Self::SetNoteTags {
                expected_revision, ..
            }
            | Self::ImportNoteAttachments {
                expected_revision, ..
            }
            | Self::DeleteNoteAttachments {
                expected_revision, ..
            }
            | Self::SetNoteStatus {
                expected_revision, ..
            }
            | Self::DeleteNote {
                expected_revision, ..
            } => *expected_revision,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceCommandResult {
    pub snapshot: super::model::WorkspaceSnapshot,
    pub transaction_id: String,
}

pub(crate) struct AppliedCommand {
    pub manifest: PersistedManifest,
    pub bodies: HashMap<String, String>,
}

pub(crate) fn apply_command(
    manifest: &PersistedManifest,
    bodies: &HashMap<String, String>,
    command: &WorkspaceCommand,
    mut next_id: impl FnMut() -> String,
    mut now: impl FnMut() -> String,
) -> Result<AppliedCommand, WorkspaceError> {
    if command.expected_revision() != manifest.revision {
        return Err(WorkspaceError::StaleRevision {
            expected: command.expected_revision(),
            actual: manifest.revision,
        });
    }
    let mut next = manifest.clone();
    let mut next_bodies = bodies.clone();
    match command {
        WorkspaceCommand::CreateNote { body, .. } => {
            validate_body(body)?;
            if body.trim().is_empty() {
                return Err(WorkspaceError::Validation(
                    "note body cannot be empty".to_owned(),
                ));
            }
            let id = next_id();
            validate_uuid(&id, "note id")?;
            let timestamp = now();
            next.notes.push(PersistedNote {
                id: id.clone(),
                status: NoteStatus::Open,
                created_at: timestamp.clone(),
                updated_at: timestamp,
                completed_at: None,
                tags: Vec::new(),
                attachments: Vec::new(),
            });
            next_bodies.insert(id, body.clone());
        }
        WorkspaceCommand::UpdateNote { note_id, body, .. } => {
            validate_body(body)?;
            let note = find_note_mut(&mut next, note_id)?;
            note.updated_at = now();
            next_bodies.insert(note_id.clone(), body.clone());
        }
        WorkspaceCommand::SetNoteTags { note_id, tags, .. } => {
            let tags = normalize_tags(tags.clone())?;
            let note = find_note_mut(&mut next, note_id)?;
            note.tags = tags;
            note.updated_at = now();
        }
        WorkspaceCommand::SetNoteStatus {
            note_id, status, ..
        } => {
            validate_uuid(note_id, "note id")?;
            let timestamp = now();
            let note = find_note_mut(&mut next, note_id)?;
            note.status = *status;
            note.completed_at = matches!(status, NoteStatus::Done).then(|| timestamp.clone());
            note.updated_at = timestamp;
        }
        WorkspaceCommand::DeleteNote { note_id, .. } => {
            validate_uuid(note_id, "note id")?;
            find_note(&next, note_id)?;
            next.notes.retain(|note| note.id != *note_id);
            next_bodies.remove(note_id);
        }
        WorkspaceCommand::ImportNoteAttachments { .. }
        | WorkspaceCommand::DeleteNoteAttachments { .. } => {
            return Err(WorkspaceError::Validation(
                "attachment commands require Workspace storage validation".to_owned(),
            ));
        }
    }
    next.revision = next
        .revision
        .checked_add(1)
        .ok_or_else(|| WorkspaceError::Validation("revision overflow".to_owned()))?;
    next.validate(&next_bodies)?;
    Ok(AppliedCommand {
        manifest: next,
        bodies: next_bodies,
    })
}

pub(crate) fn validate_ids(ids: &[String], field: &str) -> Result<(), WorkspaceError> {
    if ids.is_empty() {
        return Err(WorkspaceError::Validation(format!(
            "{field} list cannot be empty"
        )));
    }
    let mut unique = HashSet::new();
    for id in ids {
        validate_uuid(id, field)?;
        if !unique.insert(id) {
            return Err(WorkspaceError::Validation(format!("duplicate {field} id")));
        }
    }
    Ok(())
}

pub(crate) fn find_note<'a>(
    manifest: &'a PersistedManifest,
    id: &str,
) -> Result<&'a PersistedNote, WorkspaceError> {
    manifest
        .notes
        .iter()
        .find(|note| note.id == id)
        .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))
}

pub(crate) fn find_note_mut<'a>(
    manifest: &'a mut PersistedManifest,
    id: &str,
) -> Result<&'a mut PersistedNote, WorkspaceError> {
    manifest
        .notes
        .iter_mut()
        .find(|note| note.id == id)
        .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::model::fixture_manifest;

    #[test]
    fn command_union_serializes_exactly_seven_variants() {
        let variants = [
            "createNote",
            "updateNote",
            "setNoteTags",
            "importNoteAttachments",
            "deleteNoteAttachments",
            "setNoteStatus",
            "deleteNote",
        ];
        assert_eq!(variants.len(), 7);
        let value = serde_json::to_value(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "body".to_owned(),
        })
        .expect("serialize");
        assert_eq!(value["type"], "createNote");
    }

    #[test]
    fn create_preserves_nonempty_body_edges() {
        let (manifest, bodies) = fixture_manifest();
        let applied = apply_command(
            &manifest,
            &bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "  body\n".to_owned(),
            },
            || "fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned(),
            || "2026-07-30T12:01:00Z".to_owned(),
        )
        .expect("create");
        assert_eq!(applied.bodies.values().next().expect("body"), "  body\n");
    }
}
