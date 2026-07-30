use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::WorkspaceError;
use super::model::{PersistedManifest, MAX_MANIFEST_BYTES};
use super::storage::WorkspaceStorage;

const MANIFEST_PATH: &str = "charon.workspace.json";
const BACKUP_LIMIT: usize = 20;
const BACKUP_MAX_AGE_SECONDS: u64 = 30 * 24 * 60 * 60;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum TransactionState {
    Staged,
    NotesApplied,
    ManifestCommitted,
    Committed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionRecord {
    transaction_id: String,
    created_unix_seconds: u64,
    previous_revision: u64,
    next_revision: u64,
    state: TransactionState,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InjectedFailure {
    AfterStaging,
    AfterNotes,
    AfterManifest,
    BeforeCommittedMarker,
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
    commit_with_hook(
        storage,
        previous_manifest,
        previous_bodies,
        next_manifest,
        next_bodies,
        |_| Ok(()),
    )
}

fn commit_with_hook(
    storage: &dyn WorkspaceStorage,
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
    mut hook: impl FnMut(TransactionState) -> Result<(), WorkspaceError>,
) -> Result<CommitOutput, WorkspaceError> {
    previous_manifest.validate(previous_bodies)?;
    next_manifest.validate(next_bodies)?;
    if next_manifest.revision != previous_manifest.revision.saturating_add(1) {
        return Err(WorkspaceError::Validation(
            "a transaction must advance the revision exactly once".to_owned(),
        ));
    }

    let transaction_id = Uuid::new_v4().to_string();
    let transaction_dir = format!("backups/{transaction_id}");
    storage.create_dir_all("backups")?;
    storage.create_dir_all(&transaction_dir)?;
    storage.create_dir_all(&format!("{transaction_dir}/previous"))?;
    storage.create_dir_all(&format!("{transaction_dir}/next"))?;

    write_manifest_copy(storage, &transaction_dir, "previous", previous_manifest)?;
    write_manifest_copy(storage, &transaction_dir, "next", next_manifest)?;
    write_body_copies(storage, &transaction_dir, "previous", previous_bodies)?;
    write_body_copies(storage, &transaction_dir, "next", next_bodies)?;

    let mut record = TransactionRecord {
        transaction_id: transaction_id.clone(),
        created_unix_seconds: unix_seconds(),
        previous_revision: previous_manifest.revision,
        next_revision: next_manifest.revision,
        state: TransactionState::Staged,
    };
    write_record(storage, &transaction_dir, &record)?;
    storage.sync_dir(&transaction_dir)?;
    hook(TransactionState::Staged)?;

    apply_state(
        storage,
        &transaction_id,
        previous_manifest,
        next_manifest,
        next_bodies,
    )?;
    record.state = TransactionState::NotesApplied;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::NotesApplied)?;

    replace_manifest(storage, &transaction_id, next_manifest)?;
    record.state = TransactionState::ManifestCommitted;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::ManifestCommitted)?;

    record.state = TransactionState::Committed;
    hook(TransactionState::Committed)?;
    write_record(storage, &transaction_dir, &record)?;
    storage.sync_dir(&transaction_dir)?;
    prune_backups(storage)?;

    Ok(CommitOutput { transaction_id })
}

pub(crate) fn recover_incomplete(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    if !storage.exists("backups")? {
        return Ok(());
    }
    for transaction_id in storage.list("backups")? {
        let transaction_dir = format!("backups/{transaction_id}");
        let record = read_record(storage, &transaction_dir).map_err(|_| {
            WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir.clone(),
            }
        })?;
        if record.transaction_id != transaction_id || record.state == TransactionState::Committed {
            continue;
        }
        let previous = read_manifest_copy(storage, &transaction_dir, "previous")?;
        let next = read_manifest_copy(storage, &transaction_dir, "next")?;
        let previous_bodies = read_body_copies(storage, &transaction_dir, "previous", &previous)?;
        let next_bodies = read_body_copies(storage, &transaction_dir, "next", &next)?;
        previous.validate(&previous_bodies)?;
        next.validate(&next_bodies)?;

        let current = read_manifest(storage).map_err(|_| WorkspaceError::RecoveryRequired {
            backup_location: transaction_dir.clone(),
        })?;
        if current.revision == next.revision && current == next {
            apply_state(storage, &transaction_id, &previous, &next, &next_bodies)?;
            replace_manifest(storage, &transaction_id, &next)?;
        } else if current.revision == previous.revision && current == previous {
            apply_state(storage, &transaction_id, &next, &previous, &previous_bodies)?;
            replace_manifest(storage, &transaction_id, &previous)?;
        } else {
            return Err(WorkspaceError::RecoveryRequired {
                backup_location: transaction_dir,
            });
        }

        let committed = TransactionRecord {
            state: TransactionState::Committed,
            ..record
        };
        write_record(storage, &format!("backups/{transaction_id}"), &committed)?;
    }
    Ok(())
}

pub(crate) fn undo(
    storage: &dyn WorkspaceStorage,
    current_manifest: &PersistedManifest,
    current_bodies: &HashMap<String, String>,
    transaction_id: &str,
) -> Result<(PersistedManifest, HashMap<String, String>, String), WorkspaceError> {
    let transaction_dir = format!("backups/{transaction_id}");
    let record = read_record(storage, &transaction_dir)?;
    if record.state != TransactionState::Committed
        || record.next_revision != current_manifest.revision
    {
        return Err(WorkspaceError::Validation(
            "undo conflicts with a later Workspace revision".to_owned(),
        ));
    }
    let mut previous = read_manifest_copy(storage, &transaction_dir, "previous")?;
    let previous_bodies = read_body_copies(storage, &transaction_dir, "previous", &previous)?;
    previous.revision = current_manifest
        .revision
        .checked_add(1)
        .ok_or_else(|| WorkspaceError::Validation("revision overflow".to_owned()))?;
    let output = commit(
        storage,
        current_manifest,
        current_bodies,
        &previous,
        &previous_bodies,
    )?;
    Ok((previous, previous_bodies, output.transaction_id))
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
) -> Result<(), WorkspaceError> {
    storage.create_dir_all("notes")?;
    for note in &to_manifest.notes {
        let body = to_bodies
            .get(&note.id)
            .ok_or_else(|| WorkspaceError::NotFound("transaction note body".to_owned()))?;
        let temporary = format!("notes/.charon-{transaction_id}-{}.tmp", note.id);
        let destination = format!("notes/{}.md", note.id);
        storage.write_synced(&temporary, body.as_bytes())?;
        storage.rename(&temporary, &destination)?;
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
    Ok(())
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

fn write_record(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    record: &TransactionRecord,
) -> Result<(), WorkspaceError> {
    let mut bytes =
        serde_json::to_vec_pretty(record).map_err(|_| WorkspaceError::InvalidManifest)?;
    bytes.push(b'\n');
    let temporary = format!("{transaction_dir}/.record.tmp");
    let destination = format!("{transaction_dir}/transaction.json");
    storage.write_synced(&temporary, &bytes)?;
    storage.rename(&temporary, &destination)?;
    storage.sync_dir(transaction_dir)?;
    Ok(())
}

fn read_record(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
) -> Result<TransactionRecord, WorkspaceError> {
    let bytes = storage.read(&format!("{transaction_dir}/transaction.json"))?;
    serde_json::from_slice(&bytes).map_err(|_| WorkspaceError::InvalidManifest)
}

fn manifest_bytes(manifest: &PersistedManifest) -> Result<Vec<u8>, WorkspaceError> {
    let mut bytes =
        serde_json::to_vec_pretty(manifest).map_err(|_| WorkspaceError::InvalidManifest)?;
    bytes.push(b'\n');
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::Validation(
            "manifest exceeds the v1 limit".to_owned(),
        ));
    }
    Ok(bytes)
}

fn prune_backups(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    let now = unix_seconds();
    let mut committed = storage
        .list("backups")?
        .into_iter()
        .filter_map(|id| {
            let dir = format!("backups/{id}");
            let record = read_record(storage, &dir).ok()?;
            (record.state == TransactionState::Committed)
                .then_some((id, record.created_unix_seconds))
        })
        .collect::<Vec<_>>();
    committed.sort_by_key(|(_, created)| *created);
    let overflow = committed.len().saturating_sub(BACKUP_LIMIT);
    for (index, (id, created)) in committed.into_iter().enumerate() {
        let expired = now.saturating_sub(created) > BACKUP_MAX_AGE_SECONDS;
        if index < overflow || expired {
            storage.remove_dir_all(&format!("backups/{id}"))?;
        }
    }
    Ok(())
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
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
        |state| {
            let should_fail = matches!(
                (state, failure),
                (TransactionState::Staged, InjectedFailure::AfterStaging)
                    | (TransactionState::NotesApplied, InjectedFailure::AfterNotes)
                    | (
                        TransactionState::ManifestCommitted,
                        InjectedFailure::AfterManifest
                    )
                    | (
                        TransactionState::Committed,
                        InjectedFailure::BeforeCommittedMarker
                    )
            );
            if should_fail {
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

    fn prepare() -> (
        MemoryWorkspaceStorage,
        PersistedManifest,
        HashMap<String, String>,
        PersistedManifest,
        HashMap<String, String>,
    ) {
        let storage = MemoryWorkspaceStorage::new();
        storage.create_dir_all("notes").expect("notes dir");
        let (previous, previous_bodies) = fixture_manifest();
        replace_manifest(&storage, "initial", &previous).expect("initial manifest");
        let section_id = previous.sections[0].id.clone();
        let applied = apply_command(
            &previous,
            &previous_bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                section_id,
                body: "new body".to_owned(),
                sort_key: 0,
            },
            || "fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned(),
            || "2026-07-30T12:01:00Z".to_owned(),
        )
        .expect("next state");
        (
            storage,
            previous,
            previous_bodies,
            applied.manifest,
            applied.bodies,
        )
    }

    #[test]
    fn every_interrupted_phase_recovers_to_a_complete_revision() {
        for failure in [
            InjectedFailure::AfterStaging,
            InjectedFailure::AfterNotes,
            InjectedFailure::AfterManifest,
            InjectedFailure::BeforeCommittedMarker,
        ] {
            let (storage, previous, previous_bodies, next, next_bodies) = prepare();
            let result = commit_with_failure(
                &storage,
                &previous,
                &previous_bodies,
                &next,
                &next_bodies,
                failure,
            );
            assert!(result.is_err());
            recover_incomplete(&storage).expect("recovery");
            let recovered = read_manifest(&storage).expect("recovered manifest");
            let body_exists = storage
                .exists("notes/fef8abcc-7047-4a35-a070-b6d9f0eca026.md")
                .expect("body existence");
            assert!(
                (recovered == previous && !body_exists) || (recovered == next && body_exists),
                "phase {failure:?} produced a mixed state"
            );
        }
    }
}
