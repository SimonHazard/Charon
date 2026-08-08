use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::WorkspaceError;
use super::model::{PersistedManifest, MAX_MANIFEST_BYTES};
use super::storage::WorkspaceStorage;

const MANIFEST_PATH: &str = "charon.workspace.json";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum TransactionState {
    Staged,
    FilesApplied,
    ManifestCommitted,
    CleanupPending,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionRecord {
    transaction_id: String,
    previous_revision: u64,
    next_revision: u64,
    state: TransactionState,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InjectedFailure {
    AfterStaging,
    AfterFiles,
    AfterManifest,
    BeforeCleanup,
}

pub(crate) struct CommitOutput {
    pub transaction_id: String,
}

pub(crate) fn commit(
    storage: &dyn WorkspaceStorage,
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
) -> Result<CommitOutput, WorkspaceError> {
    commit_with_new_attachments(
        storage,
        previous_manifest,
        previous_bodies,
        next_manifest,
        next_bodies,
        &HashMap::new(),
    )
}

pub(crate) fn commit_with_new_attachments(
    storage: &dyn WorkspaceStorage,
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
    supplied_attachments: &HashMap<String, Vec<u8>>,
) -> Result<CommitOutput, WorkspaceError> {
    commit_with_hook(
        storage,
        previous_manifest,
        previous_bodies,
        next_manifest,
        next_bodies,
        supplied_attachments,
        |_| Ok(()),
    )
}

fn commit_with_hook(
    storage: &dyn WorkspaceStorage,
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
    supplied_attachments: &HashMap<String, Vec<u8>>,
    mut hook: impl FnMut(TransactionState) -> Result<(), WorkspaceError>,
) -> Result<CommitOutput, WorkspaceError> {
    previous_manifest.validate(previous_bodies)?;
    next_manifest.validate(next_bodies)?;
    if next_manifest.revision != previous_manifest.revision.saturating_add(1) {
        return Err(WorkspaceError::Validation(
            "a transaction must advance the revision exactly once".to_owned(),
        ));
    }
    let previous_attachments =
        current_attachment_bytes(storage, previous_manifest, &HashMap::new())?;
    let next_attachments = current_attachment_bytes(storage, next_manifest, supplied_attachments)?;
    let transaction_id = Uuid::new_v4().to_string();
    let transaction_dir = format!("backups/{transaction_id}");
    storage.create_dir_all("backups")?;
    let mut record = TransactionRecord {
        transaction_id: transaction_id.clone(),
        previous_revision: previous_manifest.revision,
        next_revision: next_manifest.revision,
        state: TransactionState::Staged,
    };
    let staging = (|| {
        storage.create_dir_all(&transaction_dir)?;
        storage.create_dir_all(&format!("{transaction_dir}/previous"))?;
        storage.create_dir_all(&format!("{transaction_dir}/next"))?;
        write_manifest_copy(storage, &transaction_dir, "previous", previous_manifest)?;
        write_manifest_copy(storage, &transaction_dir, "next", next_manifest)?;
        write_body_copies(storage, &transaction_dir, "previous", previous_bodies)?;
        write_body_copies(storage, &transaction_dir, "next", next_bodies)?;
        write_attachment_copies(
            storage,
            &transaction_dir,
            "previous",
            previous_manifest,
            &previous_attachments,
        )?;
        write_attachment_copies(
            storage,
            &transaction_dir,
            "next",
            next_manifest,
            &next_attachments,
        )?;
        write_record(storage, &transaction_dir, &record)?;
        storage.sync_dir(&transaction_dir)
    })();
    if let Err(error) = staging {
        if storage.remove_dir_all(&transaction_dir).is_err() || storage.sync_dir("backups").is_err()
        {
            return Err(WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir,
            });
        }
        return Err(error);
    }
    hook(TransactionState::Staged)?;
    apply_state(
        storage,
        &transaction_id,
        previous_manifest,
        next_manifest,
        next_bodies,
        &next_attachments,
    )?;
    record.state = TransactionState::FilesApplied;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::FilesApplied)?;
    replace_manifest(storage, &transaction_id, next_manifest)?;
    record.state = TransactionState::ManifestCommitted;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::ManifestCommitted)?;
    record.state = TransactionState::CleanupPending;
    write_record(storage, &transaction_dir, &record)?;
    if let Err(error) = hook(TransactionState::CleanupPending) {
        return if deletion_occurred(previous_manifest, next_manifest) {
            Err(WorkspaceError::DeletionCleanupRequired { transaction_id })
        } else {
            Err(error)
        };
    }
    storage.remove_dir_all(&transaction_dir).map_err(|_| {
        if deletion_occurred(previous_manifest, next_manifest) {
            WorkspaceError::DeletionCleanupRequired {
                transaction_id: transaction_id.clone(),
            }
        } else {
            WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir.clone(),
            }
        }
    })?;
    storage.sync_dir("backups")?;
    Ok(CommitOutput { transaction_id })
}

pub(crate) fn recover_incomplete(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    if !storage.exists("backups")? {
        return Ok(());
    }
    for transaction_id in storage.list("backups")? {
        if transaction_id == "migration-v1-v2" {
            continue;
        }
        let transaction_dir = format!("backups/{transaction_id}");
        let record = read_record(storage, &transaction_dir).map_err(|_| {
            WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir.clone(),
            }
        })?;
        if record.transaction_id != transaction_id {
            return Err(WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir,
            });
        }
        let previous = read_manifest_copy(storage, &transaction_dir, "previous")?;
        let next = read_manifest_copy(storage, &transaction_dir, "next")?;
        let previous_bodies = read_body_copies(storage, &transaction_dir, "previous", &previous)?;
        let next_bodies = read_body_copies(storage, &transaction_dir, "next", &next)?;
        let previous_attachments =
            read_attachment_copies(storage, &transaction_dir, "previous", &previous)?;
        let next_attachments = read_attachment_copies(storage, &transaction_dir, "next", &next)?;
        previous.validate(&previous_bodies)?;
        next.validate(&next_bodies)?;
        let current = read_manifest(storage).map_err(|_| WorkspaceError::RecoveryRequired {
            backup_location: transaction_dir.clone(),
        })?;
        if current == next {
            apply_state(
                storage,
                &transaction_id,
                &previous,
                &next,
                &next_bodies,
                &next_attachments,
            )?;
            replace_manifest(storage, &transaction_id, &next)?;
        } else if current == previous {
            apply_state(
                storage,
                &transaction_id,
                &next,
                &previous,
                &previous_bodies,
                &previous_attachments,
            )?;
            replace_manifest(storage, &transaction_id, &previous)?;
        } else {
            return Err(WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir,
            });
        }
        storage.remove_dir_all(&format!("backups/{transaction_id}"))?;
    }
    storage.sync_dir("backups")?;
    Ok(())
}

pub(crate) fn read_manifest(
    storage: &dyn WorkspaceStorage,
) -> Result<PersistedManifest, WorkspaceError> {
    let bytes = storage.read(MANIFEST_PATH)?;
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::InvalidManifest);
    }
    serde_json::from_slice(&bytes).map_err(|_| WorkspaceError::InvalidManifest)
}

pub(crate) fn replace_manifest(
    storage: &dyn WorkspaceStorage,
    transaction_id: &str,
    manifest: &PersistedManifest,
) -> Result<(), WorkspaceError> {
    let bytes = manifest_bytes(manifest)?;
    let temporary = format!(".charon-{transaction_id}.manifest.tmp");
    storage.write_synced(&temporary, &bytes)?;
    storage.rename(&temporary, MANIFEST_PATH)?;
    storage.sync_dir("")?;
    Ok(())
}

fn apply_state(
    storage: &dyn WorkspaceStorage,
    transaction_id: &str,
    from_manifest: &PersistedManifest,
    to_manifest: &PersistedManifest,
    to_bodies: &HashMap<String, String>,
    to_attachments: &HashMap<String, Vec<u8>>,
) -> Result<(), WorkspaceError> {
    storage.create_dir_all("notes")?;
    for note in &to_manifest.notes {
        let body = to_bodies
            .get(&note.id)
            .ok_or_else(|| WorkspaceError::NotFound("transaction note body".to_owned()))?;
        let temporary = format!("notes/.charon-{transaction_id}-{}.tmp", note.id);
        storage.write_synced(&temporary, body.as_bytes())?;
        storage.rename(&temporary, &format!("notes/{}.md", note.id))?;
    }
    let target_ids = to_manifest
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<HashSet<_>>();
    for note in &from_manifest.notes {
        if !target_ids.contains(note.id.as_str()) {
            storage.remove_file(&format!("notes/{}.md", note.id))?;
        }
    }
    storage.sync_dir("notes")?;

    storage.create_dir_all("attachments")?;
    for note in &to_manifest.notes {
        if !note.attachments.is_empty() {
            storage.create_dir_all(&format!("attachments/{}", note.id))?;
        }
        for attachment in &note.attachments {
            let bytes = to_attachments
                .get(&attachment.relative_path)
                .ok_or_else(|| {
                    WorkspaceError::NotFound("transaction attachment bytes".to_owned())
                })?;
            let file_name = attachment
                .relative_path
                .rsplit('/')
                .next()
                .ok_or(WorkspaceError::InvalidPath)?;
            let temporary = format!(
                "attachments/{}/.charon-{transaction_id}-{file_name}.tmp",
                note.id
            );
            storage.write_synced(&temporary, bytes)?;
            storage.rename(&temporary, &attachment.relative_path)?;
        }
    }
    let target_paths = to_manifest
        .notes
        .iter()
        .flat_map(|note| {
            note.attachments
                .iter()
                .map(|attachment| attachment.relative_path.as_str())
        })
        .collect::<HashSet<_>>();
    for note in &from_manifest.notes {
        for attachment in &note.attachments {
            if !target_paths.contains(attachment.relative_path.as_str()) {
                storage.remove_file(&attachment.relative_path)?;
            }
        }
        storage.remove_dir_if_empty(&format!("attachments/{}", note.id))?;
    }
    remove_transaction_temporaries(storage, transaction_id, from_manifest, to_manifest)?;
    storage.sync_dir("attachments")?;
    Ok(())
}

fn remove_transaction_temporaries(
    storage: &dyn WorkspaceStorage,
    transaction_id: &str,
    first: &PersistedManifest,
    second: &PersistedManifest,
) -> Result<(), WorkspaceError> {
    let mut note_ids = HashSet::new();
    for note in first.notes.iter().chain(&second.notes) {
        if note_ids.insert(note.id.as_str()) {
            storage.remove_file(&format!("notes/.charon-{transaction_id}-{}.tmp", note.id))?;
        }
        for attachment in &note.attachments {
            let file_name = attachment
                .relative_path
                .rsplit('/')
                .next()
                .ok_or(WorkspaceError::InvalidPath)?;
            storage.remove_file(&format!(
                "attachments/{}/.charon-{transaction_id}-{file_name}.tmp",
                note.id
            ))?;
        }
        storage.remove_dir_if_empty(&format!("attachments/{}", note.id))?;
    }
    Ok(())
}

fn deletion_occurred(previous: &PersistedManifest, next: &PersistedManifest) -> bool {
    let next_notes = next
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<HashSet<_>>();
    let next_attachments = next
        .notes
        .iter()
        .flat_map(|note| {
            note.attachments
                .iter()
                .map(|attachment| attachment.id.as_str())
        })
        .collect::<HashSet<_>>();
    previous.notes.iter().any(|note| {
        !next_notes.contains(note.id.as_str())
            || note
                .attachments
                .iter()
                .any(|attachment| !next_attachments.contains(attachment.id.as_str()))
    })
}

fn current_attachment_bytes(
    storage: &dyn WorkspaceStorage,
    manifest: &PersistedManifest,
    supplied: &HashMap<String, Vec<u8>>,
) -> Result<HashMap<String, Vec<u8>>, WorkspaceError> {
    manifest
        .notes
        .iter()
        .flat_map(|note| &note.attachments)
        .map(|attachment| {
            let bytes = supplied
                .get(&attachment.relative_path)
                .cloned()
                .map_or_else(|| storage.read(&attachment.relative_path), Ok)?;
            Ok((attachment.relative_path.clone(), bytes))
        })
        .collect()
}
fn write_manifest_copy(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
) -> Result<(), WorkspaceError> {
    storage.write_synced(
        &format!("{transaction_dir}/{state}/manifest.json"),
        &manifest_bytes(manifest)?,
    )
}
fn read_manifest_copy(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
) -> Result<PersistedManifest, WorkspaceError> {
    let bytes = storage.read(&format!("{transaction_dir}/{state}/manifest.json"))?;
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::InvalidManifest);
    }
    serde_json::from_slice(&bytes).map_err(|_| WorkspaceError::InvalidManifest)
}
fn write_body_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    bodies: &HashMap<String, String>,
) -> Result<(), WorkspaceError> {
    for (id, body) in bodies {
        storage.write_synced(
            &format!("{transaction_dir}/{state}/{id}.md"),
            body.as_bytes(),
        )?;
    }
    Ok(())
}
fn read_body_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
) -> Result<HashMap<String, String>, WorkspaceError> {
    manifest
        .notes
        .iter()
        .map(|note| {
            let bytes = storage.read(&format!("{transaction_dir}/{state}/{}.md", note.id))?;
            let body = String::from_utf8(bytes)
                .map_err(|_| WorkspaceError::Validation("note body must be UTF-8".to_owned()))?;
            Ok((note.id.clone(), body))
        })
        .collect()
}
fn write_attachment_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
    attachments: &HashMap<String, Vec<u8>>,
) -> Result<(), WorkspaceError> {
    if attachments.is_empty() {
        return Ok(());
    }
    storage.create_dir_all(&format!("{transaction_dir}/{state}/attachments"))?;
    for (index, attachment) in manifest
        .notes
        .iter()
        .flat_map(|note| &note.attachments)
        .enumerate()
    {
        let bytes = attachments
            .get(&attachment.relative_path)
            .ok_or_else(|| WorkspaceError::NotFound("transaction attachment bytes".to_owned()))?;
        storage.write_synced(
            &format!("{transaction_dir}/{state}/attachments/{index}.bin"),
            bytes,
        )?;
    }
    Ok(())
}
fn read_attachment_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
) -> Result<HashMap<String, Vec<u8>>, WorkspaceError> {
    manifest
        .notes
        .iter()
        .flat_map(|note| &note.attachments)
        .enumerate()
        .map(|(index, attachment)| {
            Ok((
                attachment.relative_path.clone(),
                storage.read(&format!(
                    "{transaction_dir}/{state}/attachments/{index}.bin"
                ))?,
            ))
        })
        .collect()
}
fn write_record(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    record: &TransactionRecord,
) -> Result<(), WorkspaceError> {
    let mut bytes =
        serde_json::to_vec_pretty(record).map_err(|_| WorkspaceError::InvalidManifest)?;
    bytes.push(b'\n');
    let temporary = format!("{transaction_dir}/.record.tmp");
    storage.write_synced(&temporary, &bytes)?;
    storage.rename(&temporary, &format!("{transaction_dir}/transaction.json"))?;
    storage.sync_dir(transaction_dir)?;
    Ok(())
}
fn read_record(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
) -> Result<TransactionRecord, WorkspaceError> {
    serde_json::from_slice(&storage.read(&format!("{transaction_dir}/transaction.json"))?)
        .map_err(|_| WorkspaceError::InvalidManifest)
}
pub(crate) fn manifest_bytes(manifest: &PersistedManifest) -> Result<Vec<u8>, WorkspaceError> {
    let mut bytes =
        serde_json::to_vec_pretty(manifest).map_err(|_| WorkspaceError::InvalidManifest)?;
    bytes.push(b'\n');
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::Validation(
            "manifest exceeds the v2 limit".to_owned(),
        ));
    }
    Ok(bytes)
}

#[cfg(test)]
pub(crate) fn commit_with_failure(
    storage: &dyn WorkspaceStorage,
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
    failure: InjectedFailure,
) -> Result<CommitOutput, WorkspaceError> {
    commit_with_hook(
        storage,
        previous_manifest,
        previous_bodies,
        next_manifest,
        next_bodies,
        &HashMap::new(),
        |state| {
            let fail = matches!(
                (state, failure),
                (TransactionState::Staged, InjectedFailure::AfterStaging)
                    | (TransactionState::FilesApplied, InjectedFailure::AfterFiles)
                    | (
                        TransactionState::ManifestCommitted,
                        InjectedFailure::AfterManifest
                    )
                    | (
                        TransactionState::CleanupPending,
                        InjectedFailure::BeforeCleanup
                    )
            );
            if fail {
                Err(WorkspaceError::Io(std::io::Error::new(
                    std::io::ErrorKind::Interrupted,
                    "injected transaction interruption",
                )))
            } else {
                Ok(())
            }
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::command::{apply_command, WorkspaceCommand};
    use crate::workspace::model::fixture_manifest;
    use crate::workspace::storage::{MemoryWorkspaceStorage, WorkspaceStorage};

    const NOTE_ID: &str = "fef8abcc-7047-4a35-a070-b6d9f0eca026";

    fn prepared() -> (
        MemoryWorkspaceStorage,
        PersistedManifest,
        HashMap<String, String>,
        PersistedManifest,
        HashMap<String, String>,
    ) {
        let storage = MemoryWorkspaceStorage::new();
        storage.create_dir_all("notes").expect("notes");
        storage.create_dir_all("attachments").expect("attachments");
        storage.create_dir_all("backups").expect("backups");
        let (previous, previous_bodies) = fixture_manifest();
        replace_manifest(&storage, "initial", &previous).expect("manifest");
        let applied = apply_command(
            &previous,
            &previous_bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "deletion sentinel".to_owned(),
            },
            || NOTE_ID.to_owned(),
            || "2026-07-30T12:01:00Z".to_owned(),
        )
        .expect("create plan");
        (
            storage,
            previous,
            previous_bodies,
            applied.manifest,
            applied.bodies,
        )
    }

    #[test]
    fn every_interrupted_phase_recovers_to_one_complete_revision() {
        for failure in [
            InjectedFailure::AfterStaging,
            InjectedFailure::AfterFiles,
            InjectedFailure::AfterManifest,
        ] {
            let (storage, previous, previous_bodies, next, next_bodies) = prepared();
            assert!(commit_with_failure(
                &storage,
                &previous,
                &previous_bodies,
                &next,
                &next_bodies,
                failure
            )
            .is_err());
            recover_incomplete(&storage).expect("recover");
            let recovered = read_manifest(&storage).expect("manifest");
            assert!(recovered == previous || recovered == next);
            assert!(storage.list("backups").expect("backups").is_empty());
        }
    }

    #[test]
    fn deletion_cleanup_failure_blocks_success_until_recovery_removes_copies() {
        let (storage, previous, previous_bodies, current, current_bodies) = prepared();
        commit(
            &storage,
            &previous,
            &previous_bodies,
            &current,
            &current_bodies,
        )
        .expect("create commit");
        let deleted = apply_command(
            &current,
            &current_bodies,
            &WorkspaceCommand::DeleteNotes {
                expected_revision: 1,
                note_ids: vec![NOTE_ID.to_owned()],
            },
            || unreachable!(),
            || "2026-07-30T12:02:00Z".to_owned(),
        )
        .expect("delete plan");
        assert!(matches!(
            commit_with_failure(
                &storage,
                &current,
                &current_bodies,
                &deleted.manifest,
                &deleted.bodies,
                InjectedFailure::BeforeCleanup
            ),
            Err(WorkspaceError::DeletionCleanupRequired { .. })
        ));
        assert!(!storage.list("backups").expect("pending backup").is_empty());
        recover_incomplete(&storage).expect("cleanup recovery");
        assert!(storage.list("backups").expect("clean backups").is_empty());
        assert!(!storage
            .exists(&format!("notes/{NOTE_ID}.md"))
            .expect("note absent"));
    }
}
