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
        previous_revision: previous_manifest.revision,
        next_revision: next_manifest.revision,
        state: TransactionState::Staged,
    };
    write_record(storage, &transaction_dir, &record)?;
    storage.sync_dir(&transaction_dir)?;
    hook(TransactionState::Staged)?;
    apply_note_state(
        storage,
        &transaction_id,
        previous_manifest,
        next_manifest,
        next_bodies,
    )?;
    record.state = TransactionState::FilesApplied;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::FilesApplied)?;
    replace_manifest(storage, &transaction_id, next_manifest)?;
    record.state = TransactionState::ManifestCommitted;
    write_record(storage, &transaction_dir, &record)?;
    hook(TransactionState::ManifestCommitted)?;
    storage.remove_dir_all(&transaction_dir).map_err(|_| {
        if previous_manifest.notes.len() > next_manifest.notes.len() {
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
        previous.validate(&previous_bodies)?;
        next.validate(&next_bodies)?;
        let current = read_manifest(storage).map_err(|_| WorkspaceError::RecoveryRequired {
            backup_location: transaction_dir.clone(),
        })?;
        if current == next {
            apply_note_state(storage, &transaction_id, &previous, &next, &next_bodies)?;
            replace_manifest(storage, &transaction_id, &next)?;
        } else if current == previous {
            apply_note_state(storage, &transaction_id, &next, &previous, &previous_bodies)?;
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

fn apply_note_state(
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
        |state| {
            let fail = matches!(
                (state, failure),
                (TransactionState::Staged, InjectedFailure::AfterStaging)
                    | (TransactionState::FilesApplied, InjectedFailure::AfterFiles)
                    | (
                        TransactionState::ManifestCommitted,
                        InjectedFailure::AfterManifest | InjectedFailure::BeforeCleanup
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
