use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::WorkspaceError;
use super::model::{
    validate_body, validate_name, validate_uuid, NoteStatus, PersistedManifest, PersistedNote,
    PersistedSection,
};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(tag = "type", rename_all = "camelCase")]
pub enum WorkspaceCommand {
    CreateSection {
        expected_revision: u64,
        name: String,
        sort_key: i64,
    },
    RenameSection {
        expected_revision: u64,
        section_id: String,
        name: String,
    },
    ReorderSection {
        expected_revision: u64,
        section_id: String,
        sort_key: i64,
    },
    DeleteSection {
        expected_revision: u64,
        section_id: String,
    },
    CreateNote {
        expected_revision: u64,
        section_id: String,
        body: String,
        sort_key: i64,
    },
    UpdateNote {
        expected_revision: u64,
        note_id: String,
        body: String,
    },
    MoveNote {
        expected_revision: u64,
        note_id: String,
        section_id: String,
        sort_key: i64,
    },
    ReorderNote {
        expected_revision: u64,
        note_id: String,
        sort_key: i64,
    },
    SetNoteStatus {
        expected_revision: u64,
        note_id: String,
        status: NoteStatus,
    },
    TrashNote {
        expected_revision: u64,
        note_id: String,
    },
    RestoreNote {
        expected_revision: u64,
        note_id: String,
    },
    PermanentlyDeleteNote {
        expected_revision: u64,
        note_id: String,
    },
    MergeNotes {
        expected_revision: u64,
        note_ids: Vec<String>,
        destination_section_id: String,
        sort_key: i64,
    },
    BatchSetStatus {
        expected_revision: u64,
        note_ids: Vec<String>,
        status: NoteStatus,
    },
    BatchTrash {
        expected_revision: u64,
        note_ids: Vec<String>,
    },
    BatchRestore {
        expected_revision: u64,
        note_ids: Vec<String>,
    },
    BatchMove {
        expected_revision: u64,
        note_ids: Vec<String>,
        destination_section_id: String,
    },
    Undo {
        expected_revision: u64,
        transaction_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceCommandResult {
    pub snapshot: super::model::WorkspaceSnapshot,
    pub transaction_id: String,
    pub undo_token: Option<String>,
}

pub(crate) struct AppliedCommand {
    pub manifest: PersistedManifest,
    pub bodies: HashMap<String, String>,
    pub undoable: bool,
}

impl WorkspaceCommand {
    pub fn expected_revision(&self) -> u64 {
        match self {
            Self::CreateSection {
                expected_revision, ..
            }
            | Self::RenameSection {
                expected_revision, ..
            }
            | Self::ReorderSection {
                expected_revision, ..
            }
            | Self::DeleteSection {
                expected_revision, ..
            }
            | Self::CreateNote {
                expected_revision, ..
            }
            | Self::UpdateNote {
                expected_revision, ..
            }
            | Self::MoveNote {
                expected_revision, ..
            }
            | Self::ReorderNote {
                expected_revision, ..
            }
            | Self::SetNoteStatus {
                expected_revision, ..
            }
            | Self::TrashNote {
                expected_revision, ..
            }
            | Self::RestoreNote {
                expected_revision, ..
            }
            | Self::PermanentlyDeleteNote {
                expected_revision, ..
            }
            | Self::MergeNotes {
                expected_revision, ..
            }
            | Self::BatchSetStatus {
                expected_revision, ..
            }
            | Self::BatchTrash {
                expected_revision, ..
            }
            | Self::BatchRestore {
                expected_revision, ..
            }
            | Self::BatchMove {
                expected_revision, ..
            }
            | Self::Undo {
                expected_revision, ..
            } => *expected_revision,
        }
    }
}

pub(crate) fn apply_command(
    current_manifest: &PersistedManifest,
    current_bodies: &HashMap<String, String>,
    command: &WorkspaceCommand,
    mut new_id: impl FnMut() -> String,
    mut now: impl FnMut() -> String,
) -> Result<AppliedCommand, WorkspaceError> {
    let expected = command.expected_revision();
    if expected != current_manifest.revision {
        return Err(WorkspaceError::StaleRevision {
            expected,
            actual: current_manifest.revision,
        });
    }
    if matches!(command, WorkspaceCommand::Undo { .. }) {
        return Err(WorkspaceError::Validation(
            "undo is resolved by the transaction recovery layer".to_owned(),
        ));
    }

    let mut manifest = current_manifest.clone();
    let mut bodies = current_bodies.clone();
    let changed_at = now();
    let undoable = !matches!(command, WorkspaceCommand::PermanentlyDeleteNote { .. });

    match command {
        WorkspaceCommand::CreateSection { name, sort_key, .. } => {
            validate_name(name)?;
            let id = new_id();
            validate_uuid(&id, "generated section id")?;
            manifest.sections.push(PersistedSection {
                id,
                name: name.trim().to_owned(),
                sort_key: *sort_key,
                created_at: changed_at.clone(),
                updated_at: changed_at.clone(),
            });
        }
        WorkspaceCommand::RenameSection {
            section_id, name, ..
        } => {
            validate_name(name)?;
            let section = find_section_mut(&mut manifest, section_id)?;
            section.name = name.trim().to_owned();
            section.updated_at.clone_from(&changed_at);
        }
        WorkspaceCommand::ReorderSection {
            section_id,
            sort_key,
            ..
        } => {
            let section = find_section_mut(&mut manifest, section_id)?;
            section.sort_key = *sort_key;
            section.updated_at.clone_from(&changed_at);
        }
        WorkspaceCommand::DeleteSection { section_id, .. } => {
            if manifest.sections.len() == 1 {
                return Err(WorkspaceError::Validation(
                    "the last section cannot be deleted".to_owned(),
                ));
            }
            if manifest
                .notes
                .iter()
                .any(|note| note.section_id == *section_id)
            {
                return Err(WorkspaceError::Validation(
                    "a non-empty section cannot be deleted".to_owned(),
                ));
            }
            let before = manifest.sections.len();
            manifest
                .sections
                .retain(|section| section.id != *section_id);
            if before == manifest.sections.len() {
                return Err(WorkspaceError::NotFound("section".to_owned()));
            }
        }
        WorkspaceCommand::CreateNote {
            section_id,
            body,
            sort_key,
            ..
        } => {
            validate_body(body)?;
            ensure_section(&manifest, section_id)?;
            let id = new_id();
            validate_uuid(&id, "generated note id")?;
            manifest.notes.push(PersistedNote {
                id: id.clone(),
                section_id: section_id.clone(),
                status: NoteStatus::Open,
                sort_key: *sort_key,
                created_at: changed_at.clone(),
                updated_at: changed_at.clone(),
                completed_at: None,
                trashed_at: None,
            });
            bodies.insert(id, body.clone());
        }
        WorkspaceCommand::UpdateNote { note_id, body, .. } => {
            validate_body(body)?;
            let note = find_note_mut(&mut manifest, note_id)?;
            note.updated_at.clone_from(&changed_at);
            bodies.insert(note_id.clone(), body.clone());
        }
        WorkspaceCommand::MoveNote {
            note_id,
            section_id,
            sort_key,
            ..
        } => {
            ensure_section(&manifest, section_id)?;
            let note = find_note_mut(&mut manifest, note_id)?;
            note.section_id.clone_from(section_id);
            note.sort_key = *sort_key;
            note.updated_at.clone_from(&changed_at);
        }
        WorkspaceCommand::ReorderNote {
            note_id, sort_key, ..
        } => {
            let note = find_note_mut(&mut manifest, note_id)?;
            note.sort_key = *sort_key;
            note.updated_at.clone_from(&changed_at);
        }
        WorkspaceCommand::SetNoteStatus {
            note_id, status, ..
        } => set_status(&mut manifest, note_id, *status, &changed_at)?,
        WorkspaceCommand::TrashNote { note_id, .. } => {
            trash_note(&mut manifest, note_id, &changed_at)?;
        }
        WorkspaceCommand::RestoreNote { note_id, .. } => {
            restore_note(&mut manifest, note_id, &changed_at)?;
        }
        WorkspaceCommand::PermanentlyDeleteNote { note_id, .. } => {
            let note = manifest
                .notes
                .iter()
                .find(|note| note.id == *note_id)
                .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))?;
            if note.trashed_at.is_none() {
                return Err(WorkspaceError::Validation(
                    "only a trashed note can be permanently deleted".to_owned(),
                ));
            }
            manifest.notes.retain(|note| note.id != *note_id);
            bodies.remove(note_id);
        }
        WorkspaceCommand::MergeNotes {
            note_ids,
            destination_section_id,
            sort_key,
            ..
        } => {
            validate_batch_ids(note_ids, 2)?;
            ensure_section(&manifest, destination_section_id)?;
            let mut parts = Vec::with_capacity(note_ids.len());
            for note_id in note_ids {
                let note = manifest
                    .notes
                    .iter()
                    .find(|note| note.id == *note_id)
                    .ok_or_else(|| WorkspaceError::NotFound("merge source note".to_owned()))?;
                if note.trashed_at.is_some() {
                    return Err(WorkspaceError::Validation(
                        "trashed notes cannot be merged".to_owned(),
                    ));
                }
                parts.push(
                    bodies
                        .get(note_id)
                        .ok_or_else(|| WorkspaceError::NotFound("note body".to_owned()))?
                        .trim_end()
                        .to_owned(),
                );
            }
            let composite = parts.join("\n\n---\n\n");
            validate_body(&composite)?;
            for note_id in note_ids {
                trash_note(&mut manifest, note_id, &changed_at)?;
            }
            let id = new_id();
            validate_uuid(&id, "generated note id")?;
            manifest.notes.push(PersistedNote {
                id: id.clone(),
                section_id: destination_section_id.clone(),
                status: NoteStatus::Open,
                sort_key: *sort_key,
                created_at: changed_at.clone(),
                updated_at: changed_at.clone(),
                completed_at: None,
                trashed_at: None,
            });
            bodies.insert(id, composite);
        }
        WorkspaceCommand::BatchSetStatus {
            note_ids, status, ..
        } => {
            validate_batch_ids(note_ids, 1)?;
            ensure_notes_exist(&manifest, note_ids)?;
            for note_id in note_ids {
                set_status(&mut manifest, note_id, *status, &changed_at)?;
            }
        }
        WorkspaceCommand::BatchTrash { note_ids, .. } => {
            validate_batch_ids(note_ids, 1)?;
            ensure_notes_exist(&manifest, note_ids)?;
            for note_id in note_ids {
                trash_note(&mut manifest, note_id, &changed_at)?;
            }
        }
        WorkspaceCommand::BatchRestore { note_ids, .. } => {
            validate_batch_ids(note_ids, 1)?;
            ensure_notes_exist(&manifest, note_ids)?;
            for note_id in note_ids {
                restore_note(&mut manifest, note_id, &changed_at)?;
            }
        }
        WorkspaceCommand::BatchMove {
            note_ids,
            destination_section_id,
            ..
        } => {
            validate_batch_ids(note_ids, 1)?;
            ensure_notes_exist(&manifest, note_ids)?;
            ensure_section(&manifest, destination_section_id)?;
            for (index, note_id) in note_ids.iter().enumerate() {
                let note = find_note_mut(&mut manifest, note_id)?;
                note.section_id.clone_from(destination_section_id);
                note.sort_key = i64::try_from(index).unwrap_or(i64::MAX);
                note.updated_at.clone_from(&changed_at);
            }
        }
        WorkspaceCommand::Undo { .. } => unreachable!("undo rejected before command dispatch"),
    }

    manifest.revision = manifest
        .revision
        .checked_add(1)
        .ok_or_else(|| WorkspaceError::Validation("revision overflow".to_owned()))?;
    manifest.validate(&bodies)?;
    Ok(AppliedCommand {
        manifest,
        bodies,
        undoable,
    })
}

fn find_section_mut<'a>(
    manifest: &'a mut PersistedManifest,
    section_id: &str,
) -> Result<&'a mut PersistedSection, WorkspaceError> {
    manifest
        .sections
        .iter_mut()
        .find(|section| section.id == section_id)
        .ok_or_else(|| WorkspaceError::NotFound("section".to_owned()))
}

fn find_note_mut<'a>(
    manifest: &'a mut PersistedManifest,
    note_id: &str,
) -> Result<&'a mut PersistedNote, WorkspaceError> {
    manifest
        .notes
        .iter_mut()
        .find(|note| note.id == note_id)
        .ok_or_else(|| WorkspaceError::NotFound("note".to_owned()))
}

fn ensure_section(manifest: &PersistedManifest, section_id: &str) -> Result<(), WorkspaceError> {
    if manifest
        .sections
        .iter()
        .any(|section| section.id == section_id)
    {
        Ok(())
    } else {
        Err(WorkspaceError::NotFound("section".to_owned()))
    }
}

fn ensure_notes_exist(
    manifest: &PersistedManifest,
    note_ids: &[String],
) -> Result<(), WorkspaceError> {
    if note_ids
        .iter()
        .all(|id| manifest.notes.iter().any(|note| note.id == *id))
    {
        Ok(())
    } else {
        Err(WorkspaceError::NotFound("batch note".to_owned()))
    }
}

fn validate_batch_ids(note_ids: &[String], minimum: usize) -> Result<(), WorkspaceError> {
    if note_ids.len() < minimum {
        return Err(WorkspaceError::Validation(format!(
            "the command requires at least {minimum} note ids"
        )));
    }
    let distinct = note_ids.iter().collect::<HashSet<_>>();
    if distinct.len() != note_ids.len() {
        return Err(WorkspaceError::Validation(
            "batch note ids must be distinct".to_owned(),
        ));
    }
    Ok(())
}

fn set_status(
    manifest: &mut PersistedManifest,
    note_id: &str,
    status: NoteStatus,
    changed_at: &str,
) -> Result<(), WorkspaceError> {
    let note = find_note_mut(manifest, note_id)?;
    note.status = status;
    note.completed_at = match status {
        NoteStatus::Open => None,
        NoteStatus::Done => Some(changed_at.to_owned()),
    };
    note.updated_at = changed_at.to_owned();
    Ok(())
}

fn trash_note(
    manifest: &mut PersistedManifest,
    note_id: &str,
    changed_at: &str,
) -> Result<(), WorkspaceError> {
    let note = find_note_mut(manifest, note_id)?;
    if note.trashed_at.is_some() {
        return Err(WorkspaceError::Validation(
            "note is already in trash".to_owned(),
        ));
    }
    note.trashed_at = Some(changed_at.to_owned());
    note.updated_at = changed_at.to_owned();
    Ok(())
}

fn restore_note(
    manifest: &mut PersistedManifest,
    note_id: &str,
    changed_at: &str,
) -> Result<(), WorkspaceError> {
    let note = find_note_mut(manifest, note_id)?;
    if note.trashed_at.is_none() {
        return Err(WorkspaceError::Validation(
            "only a trashed note can be restored".to_owned(),
        ));
    }
    note.trashed_at = None;
    note.updated_at = changed_at.to_owned();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::model::fixture_manifest;

    const NOTE_ID: &str = "fef8abcc-7047-4a35-a070-b6d9f0eca026";

    fn id() -> String {
        NOTE_ID.to_owned()
    }

    fn now() -> String {
        "2026-07-30T12:01:00Z".to_owned()
    }

    #[test]
    fn creates_a_note_and_rejects_stale_revisions() {
        let (manifest, bodies) = fixture_manifest();
        let section_id = manifest.sections[0].id.clone();
        let applied = apply_command(
            &manifest,
            &bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                section_id,
                body: "portable **Markdown**".to_owned(),
                sort_key: 4,
            },
            id,
            now,
        )
        .expect("create note");
        assert_eq!(applied.manifest.revision, 1);
        assert_eq!(applied.bodies[NOTE_ID], "portable **Markdown**");

        let error = apply_command(
            &applied.manifest,
            &applied.bodies,
            &WorkspaceCommand::TrashNote {
                expected_revision: 0,
                note_id: NOTE_ID.to_owned(),
            },
            id,
            now,
        )
        .err()
        .expect("stale command");
        assert!(matches!(error, WorkspaceError::StaleRevision { .. }));
    }

    #[test]
    fn merge_is_atomic_in_the_domain_plan() {
        let (manifest, bodies) = fixture_manifest();
        let section_id = manifest.sections[0].id.clone();
        let first = apply_command(
            &manifest,
            &bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                section_id: section_id.clone(),
                body: "first".to_owned(),
                sort_key: 0,
            },
            || "fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned(),
            now,
        )
        .expect("first note");
        let second = apply_command(
            &first.manifest,
            &first.bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 1,
                section_id: section_id.clone(),
                body: "second".to_owned(),
                sort_key: 1,
            },
            || "54ab01eb-ee1c-4c62-999e-147d9c0c8dab".to_owned(),
            now,
        )
        .expect("second note");
        let merged = apply_command(
            &second.manifest,
            &second.bodies,
            &WorkspaceCommand::MergeNotes {
                expected_revision: 2,
                note_ids: vec![
                    "fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned(),
                    "54ab01eb-ee1c-4c62-999e-147d9c0c8dab".to_owned(),
                ],
                destination_section_id: section_id,
                sort_key: 0,
            },
            || "a21ad3ba-ac2f-4037-8f26-d8b66b275e08".to_owned(),
            now,
        )
        .expect("merge");
        assert_eq!(
            merged.bodies["a21ad3ba-ac2f-4037-8f26-d8b66b275e08"],
            "first\n\n---\n\nsecond"
        );
        assert_eq!(
            merged
                .manifest
                .notes
                .iter()
                .filter(|note| note.trashed_at.is_some())
                .count(),
            2
        );
    }

    #[test]
    fn batches_validate_every_id_before_mutating() {
        let (manifest, bodies) = fixture_manifest();
        let error = apply_command(
            &manifest,
            &bodies,
            &WorkspaceCommand::BatchTrash {
                expected_revision: 0,
                note_ids: vec!["missing".to_owned()],
            },
            id,
            now,
        )
        .err()
        .expect("invalid batch");
        assert!(matches!(error, WorkspaceError::NotFound(_)));
        assert_eq!(manifest.revision, 0);
    }
}
