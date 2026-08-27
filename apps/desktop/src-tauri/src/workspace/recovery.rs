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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    change_set: Option<ChangeSet>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangeSet {
    bodies: Vec<String>,
    attachments_added: Vec<String>,
    attachments_removed: Vec<String>,
    notes_removed: Vec<String>,
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
    supplied_attachments: &HashMap<String, String>,
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
    supplied_attachments: &HashMap<String, String>,
    mut hook: impl FnMut(TransactionState) -> Result<(), WorkspaceError>,
) -> Result<CommitOutput, WorkspaceError> {
    previous_manifest.validate(previous_bodies)?;
    next_manifest.validate(next_bodies)?;
    if next_manifest.revision != previous_manifest.revision.saturating_add(1) {
        return Err(WorkspaceError::Validation(
            "a transaction must advance the revision exactly once".to_owned(),
        ));
    }
    let change_set = compute_change_set(
        previous_manifest,
        previous_bodies,
        next_manifest,
        next_bodies,
    );
    let transaction_id = Uuid::new_v4().to_string();
    let transaction_dir = format!("backups/{transaction_id}");
    storage.create_dir_all("backups")?;
    let mut record = TransactionRecord {
        transaction_id: transaction_id.clone(),
        previous_revision: previous_manifest.revision,
        next_revision: next_manifest.revision,
        state: TransactionState::Staged,
        change_set: Some(change_set.clone()),
    };
    let staging = (|| {
        storage.create_dir_all(&transaction_dir)?;
        storage.create_dir_all(&format!("{transaction_dir}/previous"))?;
        storage.create_dir_all(&format!("{transaction_dir}/next"))?;
        write_manifest_copy(storage, &transaction_dir, "previous", previous_manifest)?;
        write_manifest_copy(storage, &transaction_dir, "next", next_manifest)?;
        write_changed_body_copies(
            storage,
            &transaction_dir,
            "previous",
            previous_manifest,
            previous_bodies,
            &change_set,
        )?;
        write_changed_body_copies(
            storage,
            &transaction_dir,
            "next",
            next_manifest,
            next_bodies,
            &change_set,
        )?;
        write_changed_attachment_copies(
            storage,
            &transaction_dir,
            "previous",
            previous_manifest,
            &change_set,
            &HashMap::new(),
        )?;
        write_changed_attachment_copies(
            storage,
            &transaction_dir,
            "next",
            next_manifest,
            &change_set,
            supplied_attachments,
        )?;
        write_record(storage, &transaction_dir, &record)?;
        sync_staged_directories(storage, &transaction_dir, &change_set)
    })();
    for staged in supplied_attachments.values() {
        let _ = storage.remove_file(staged);
    }
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
    apply_changed_state(
        storage,
        &transaction_id,
        next_manifest,
        &transaction_dir,
        "next",
        &change_set,
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
        let current = read_manifest(storage).map_err(|_| WorkspaceError::RecoveryRequired {
            backup_location: transaction_dir.clone(),
        })?;
        if let Some(change_set) = &record.change_set {
            if current == next {
                apply_changed_state(
                    storage,
                    &transaction_id,
                    &next,
                    &transaction_dir,
                    "next",
                    change_set,
                )?;
                replace_manifest(storage, &transaction_id, &next)?;
            } else if current == previous {
                apply_changed_state(
                    storage,
                    &transaction_id,
                    &previous,
                    &transaction_dir,
                    "previous",
                    change_set,
                )?;
                replace_manifest(storage, &transaction_id, &previous)?;
            } else {
                return Err(WorkspaceError::RecoveryRequired {
                    backup_location: transaction_dir,
                });
            }
            storage.remove_dir_all(&format!("backups/{transaction_id}"))?;
            continue;
        }
        let previous_bodies = read_body_copies(storage, &transaction_dir, "previous", &previous)?;
        let next_bodies = read_body_copies(storage, &transaction_dir, "next", &next)?;
        let previous_attachments =
            read_attachment_copies(storage, &transaction_dir, "previous", &previous)?;
        let next_attachments = read_attachment_copies(storage, &transaction_dir, "next", &next)?;
        previous.validate(&previous_bodies)?;
        next.validate(&next_bodies)?;
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

fn compute_change_set(
    previous_manifest: &PersistedManifest,
    previous_bodies: &HashMap<String, String>,
    next_manifest: &PersistedManifest,
    next_bodies: &HashMap<String, String>,
) -> ChangeSet {
    let mut body_ids = previous_bodies
        .keys()
        .chain(next_bodies.keys())
        .filter(|id| previous_bodies.get(*id) != next_bodies.get(*id))
        .cloned()
        .collect::<Vec<_>>();
    body_ids.sort();
    body_ids.dedup();

    let previous_attachments = attachment_paths(previous_manifest);
    let next_attachments = attachment_paths(next_manifest);
    let mut attachments_added = next_attachments
        .difference(&previous_attachments)
        .cloned()
        .collect::<Vec<_>>();
    let mut attachments_removed = previous_attachments
        .difference(&next_attachments)
        .cloned()
        .collect::<Vec<_>>();
    attachments_added.sort();
    attachments_removed.sort();

    let next_ids = next_manifest
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<HashSet<_>>();
    let mut notes_removed = previous_manifest
        .notes
        .iter()
        .filter(|note| !next_ids.contains(note.id.as_str()))
        .map(|note| note.id.clone())
        .collect::<Vec<_>>();
    notes_removed.sort();
    ChangeSet {
        bodies: body_ids,
        attachments_added,
        attachments_removed,
        notes_removed,
    }
}

fn attachment_paths(manifest: &PersistedManifest) -> HashSet<String> {
    manifest
        .notes
        .iter()
        .flat_map(|note| note.attachments.iter())
        .map(|attachment| attachment.relative_path.clone())
        .collect()
}

fn write_changed_body_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
    bodies: &HashMap<String, String>,
    change_set: &ChangeSet,
) -> Result<(), WorkspaceError> {
    let ids = manifest
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<HashSet<_>>();
    for id in &change_set.bodies {
        if ids.contains(id.as_str()) {
            let body = bodies
                .get(id)
                .ok_or_else(|| WorkspaceError::NotFound("transaction note body".to_owned()))?;
            storage.write_synced(
                &format!("{transaction_dir}/{state}/{id}.md"),
                body.as_bytes(),
            )?;
        }
    }
    Ok(())
}

fn changed_attachment_paths(change_set: &ChangeSet) -> Vec<&str> {
    let mut paths = change_set
        .attachments_added
        .iter()
        .chain(&change_set.attachments_removed)
        .map(String::as_str)
        .collect::<Vec<_>>();
    paths.sort_unstable();
    paths.dedup();
    paths
}

fn write_changed_attachment_copies(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    state: &str,
    manifest: &PersistedManifest,
    change_set: &ChangeSet,
    supplied: &HashMap<String, String>,
) -> Result<(), WorkspaceError> {
    let target_paths = attachment_paths(manifest);
    for relative in changed_attachment_paths(change_set) {
        if !target_paths.contains(relative) {
            continue;
        }
        let source = supplied.get(relative).map_or(relative, String::as_str);
        let backup = format!("{transaction_dir}/{state}/{relative}");
        let parent = backup
            .rsplit_once('/')
            .ok_or(WorkspaceError::InvalidPath)?
            .0;
        storage.create_dir_all(parent)?;
        storage.copy_file(source, &backup)?;
    }
    Ok(())
}

fn sync_staged_directories(
    storage: &dyn WorkspaceStorage,
    transaction_dir: &str,
    change_set: &ChangeSet,
) -> Result<(), WorkspaceError> {
    for state in ["previous", "next"] {
        let state_dir = format!("{transaction_dir}/{state}");
        let attachments_dir = format!("{state_dir}/attachments");
        if storage.exists(&attachments_dir)? {
            for relative in changed_attachment_paths(change_set) {
                let parts = relative.split('/').collect::<Vec<_>>();
                if parts.len() == 3 {
                    let note_dir = format!("{attachments_dir}/{}", parts[1]);
                    if storage.exists(&note_dir)? {
                        storage.sync_dir(&note_dir)?;
                    }
                }
            }
            storage.sync_dir(&attachments_dir)?;
        }
        storage.sync_dir(&state_dir)?;
    }
    storage.sync_dir(transaction_dir)
}

fn apply_changed_state(
    storage: &dyn WorkspaceStorage,
    transaction_id: &str,
    target_manifest: &PersistedManifest,
    transaction_dir: &str,
    state: &str,
    change_set: &ChangeSet,
) -> Result<(), WorkspaceError> {
    let target_ids = target_manifest
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<HashSet<_>>();
    storage.create_dir_all("notes")?;
    for id in &change_set.bodies {
        let target = format!("notes/{id}.md");
        if target_ids.contains(id.as_str()) {
            let temporary = format!("notes/.charon-{transaction_id}-{id}.tmp");
            storage.copy_file(&format!("{transaction_dir}/{state}/{id}.md"), &temporary)?;
            storage.rename(&temporary, &target)?;
        } else {
            storage.remove_file(&target)?;
        }
    }
    storage.sync_dir("notes")?;

    let target_paths = attachment_paths(target_manifest);
    storage.create_dir_all("attachments")?;
    let mut note_dirs = HashSet::new();
    for relative in changed_attachment_paths(change_set) {
        let mut parts = relative.split('/');
        if parts.next() != Some("attachments") {
            return Err(WorkspaceError::InvalidPath);
        }
        let note_id = parts.next().ok_or(WorkspaceError::InvalidPath)?;
        let file_name = parts.next().ok_or(WorkspaceError::InvalidPath)?;
        if parts.next().is_some() {
            return Err(WorkspaceError::InvalidPath);
        }
        let note_dir = format!("attachments/{note_id}");
        note_dirs.insert(note_dir.clone());
        if target_paths.contains(relative) {
            storage.create_dir_all(&note_dir)?;
            let temporary = format!("{note_dir}/.charon-{transaction_id}-{file_name}.tmp");
            storage.copy_file(&format!("{transaction_dir}/{state}/{relative}"), &temporary)?;
            storage.rename(&temporary, relative)?;
        } else {
            storage.remove_file(relative)?;
            storage.remove_file(&format!(
                "{note_dir}/.charon-{transaction_id}-{file_name}.tmp"
            ))?;
        }
    }
    for note_dir in note_dirs {
        if storage.exists(&note_dir)? {
            storage.sync_dir(&note_dir)?;
            storage.remove_dir_if_empty(&note_dir)?;
        }
    }
    storage.sync_dir("attachments")?;
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
    use crate::workspace::model::{fixture_manifest, NoteStatus, PersistedAttachment};
    use crate::workspace::storage::{MemoryWorkspaceStorage, WorkspaceStorage};

    const NOTE_ID: &str = "fef8abcc-7047-4a35-a070-b6d9f0eca026";
    const ATTACHMENT_ID: &str = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
    const ADDED_ATTACHMENT_ID: &str = "dc12da6c-573f-453d-ab47-0c30c1cbe221";

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

    fn prepared_with_attachment() -> (
        MemoryWorkspaceStorage,
        PersistedManifest,
        HashMap<String, String>,
    ) {
        let (storage, previous, previous_bodies, mut current, current_bodies) = prepared();
        commit(
            &storage,
            &previous,
            &previous_bodies,
            &current,
            &current_bodies,
        )
        .expect("create base note");
        let relative_path = format!("attachments/{NOTE_ID}/{ATTACHMENT_ID}.txt");
        let staged = format!("attachments/{NOTE_ID}/.seed.tmp");
        storage
            .create_dir_all(&format!("attachments/{NOTE_ID}"))
            .expect("attachment directory");
        storage.write_synced(&staged, b"seed bytes").expect("seed");
        current.revision += 1;
        current.notes[0].attachments.push(PersistedAttachment {
            id: ATTACHMENT_ID.to_owned(),
            file_name: "seed.txt".to_owned(),
            relative_path: relative_path.clone(),
            created_at: "2026-07-30T12:02:00Z".to_owned(),
        });
        commit_with_new_attachments(
            &storage,
            &previous_with_created_note(),
            &current_bodies,
            &current,
            &current_bodies,
            &HashMap::from([(relative_path, staged)]),
        )
        .expect("attach seed");
        (storage, current, current_bodies)
    }

    fn previous_with_created_note() -> PersistedManifest {
        let (previous, previous_bodies) = fixture_manifest();
        apply_command(
            &previous,
            &previous_bodies,
            &WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "deletion sentinel".to_owned(),
            },
            || NOTE_ID.to_owned(),
            || "2026-07-30T12:01:00Z".to_owned(),
        )
        .expect("created manifest")
        .manifest
    }

    #[derive(Clone, Copy, Debug)]
    enum CommandScenario {
        Status,
        Tags,
        Body,
        AttachmentAdd,
        AttachmentRemove,
        Delete,
    }

    type ScenarioState = (
        MemoryWorkspaceStorage,
        PersistedManifest,
        HashMap<String, String>,
        PersistedManifest,
        HashMap<String, String>,
        HashMap<String, String>,
    );

    fn scenario(kind: CommandScenario) -> ScenarioState {
        let (storage, previous, previous_bodies) = prepared_with_attachment();
        let mut supplied = HashMap::new();
        let applied = match kind {
            CommandScenario::Status => apply_command(
                &previous,
                &previous_bodies,
                &WorkspaceCommand::SetNoteStatus {
                    expected_revision: previous.revision,
                    note_id: NOTE_ID.to_owned(),
                    status: NoteStatus::Done,
                },
                || unreachable!(),
                || "2026-07-30T12:03:00Z".to_owned(),
            )
            .expect("status"),
            CommandScenario::Tags => apply_command(
                &previous,
                &previous_bodies,
                &WorkspaceCommand::SetNoteTags {
                    expected_revision: previous.revision,
                    note_id: NOTE_ID.to_owned(),
                    tags: vec!["recovery".to_owned()],
                },
                || unreachable!(),
                || "2026-07-30T12:03:00Z".to_owned(),
            )
            .expect("tags"),
            CommandScenario::Body => apply_command(
                &previous,
                &previous_bodies,
                &WorkspaceCommand::UpdateNote {
                    expected_revision: previous.revision,
                    note_id: NOTE_ID.to_owned(),
                    body: "updated body".to_owned(),
                },
                || unreachable!(),
                || "2026-07-30T12:03:00Z".to_owned(),
            )
            .expect("body"),
            CommandScenario::AttachmentAdd => {
                let mut manifest = previous.clone();
                manifest.revision += 1;
                let relative = format!("attachments/{NOTE_ID}/{ADDED_ATTACHMENT_ID}.bin");
                let staged = format!("attachments/{NOTE_ID}/.added.tmp");
                storage
                    .write_synced(&staged, b"added bytes")
                    .expect("stage add");
                manifest.notes[0].attachments.push(PersistedAttachment {
                    id: ADDED_ATTACHMENT_ID.to_owned(),
                    file_name: "added.bin".to_owned(),
                    relative_path: relative.clone(),
                    created_at: "2026-07-30T12:03:00Z".to_owned(),
                });
                supplied.insert(relative, staged);
                super::super::command::AppliedCommand {
                    manifest,
                    bodies: previous_bodies.clone(),
                }
            }
            CommandScenario::AttachmentRemove => {
                let mut manifest = previous.clone();
                manifest.revision += 1;
                manifest.notes[0].attachments.clear();
                super::super::command::AppliedCommand {
                    manifest,
                    bodies: previous_bodies.clone(),
                }
            }
            CommandScenario::Delete => apply_command(
                &previous,
                &previous_bodies,
                &WorkspaceCommand::DeleteNote {
                    expected_revision: previous.revision,
                    note_id: NOTE_ID.to_owned(),
                },
                || unreachable!(),
                || "2026-07-30T12:03:00Z".to_owned(),
            )
            .expect("delete"),
        };
        (
            storage,
            previous,
            previous_bodies,
            applied.manifest,
            applied.bodies,
            supplied,
        )
    }

    fn commit_scenario_with_failure(
        storage: &dyn WorkspaceStorage,
        previous: &PersistedManifest,
        previous_bodies: &HashMap<String, String>,
        next: &PersistedManifest,
        next_bodies: &HashMap<String, String>,
        supplied: &HashMap<String, String>,
        failure: InjectedFailure,
    ) -> Result<CommitOutput, WorkspaceError> {
        commit_with_hook(
            storage,
            previous,
            previous_bodies,
            next,
            next_bodies,
            supplied,
            |state| {
                let should_fail = matches!(
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
                if should_fail {
                    Err(WorkspaceError::Io(std::io::Error::new(
                        std::io::ErrorKind::Interrupted,
                        "injected scenario interruption",
                    )))
                } else {
                    Ok(())
                }
            },
        )
    }

    fn assert_live_files_match(
        storage: &dyn WorkspaceStorage,
        manifest: &PersistedManifest,
        bodies: &HashMap<String, String>,
    ) {
        manifest.validate(bodies).expect("valid expected state");
        for note in &manifest.notes {
            assert_eq!(
                storage
                    .read(&format!("notes/{}.md", note.id))
                    .expect("live body"),
                bodies[&note.id].as_bytes()
            );
            for attachment in &note.attachments {
                assert!(storage
                    .exists(&attachment.relative_path)
                    .expect("attachment existence"));
            }
        }
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
    fn every_changed_set_command_recovers_at_every_interruption_phase() {
        for kind in [
            CommandScenario::Status,
            CommandScenario::Tags,
            CommandScenario::Body,
            CommandScenario::AttachmentAdd,
            CommandScenario::AttachmentRemove,
            CommandScenario::Delete,
        ] {
            for failure in [
                InjectedFailure::AfterStaging,
                InjectedFailure::AfterFiles,
                InjectedFailure::AfterManifest,
                InjectedFailure::BeforeCleanup,
            ] {
                let (storage, previous, previous_bodies, next, next_bodies, supplied) =
                    scenario(kind);
                assert!(commit_scenario_with_failure(
                    &storage,
                    &previous,
                    &previous_bodies,
                    &next,
                    &next_bodies,
                    &supplied,
                    failure,
                )
                .is_err());
                recover_incomplete(&storage)
                    .unwrap_or_else(|error| panic!("recover {kind:?} after {failure:?}: {error}"));
                let recovered = read_manifest(&storage).expect("recovered manifest");
                let committed = matches!(
                    failure,
                    InjectedFailure::AfterManifest | InjectedFailure::BeforeCleanup
                );
                if committed {
                    assert_eq!(recovered, next, "{kind:?} after {failure:?}");
                    assert_live_files_match(&storage, &next, &next_bodies);
                } else {
                    assert_eq!(recovered, previous, "{kind:?} after {failure:?}");
                    assert_live_files_match(&storage, &previous, &previous_bodies);
                }
                assert!(storage.list("backups").expect("backups").is_empty());
                if matches!(kind, CommandScenario::Delete) && committed {
                    assert!(!storage
                        .exists(&format!("notes/{NOTE_ID}.md"))
                        .expect("deleted body absent"));
                    assert!(!storage
                        .exists(&format!("attachments/{NOTE_ID}/{ATTACHMENT_ID}.txt"))
                        .expect("deleted attachment absent"));
                }
            }
        }
    }

    #[test]
    fn records_without_a_change_set_keep_the_full_state_recovery_path() {
        for committed in [false, true] {
            let (storage, previous, previous_bodies, next, next_bodies) = prepared();
            let transaction_id = if committed {
                "old-next"
            } else {
                "old-previous"
            };
            let transaction_dir = format!("backups/{transaction_id}");
            storage
                .create_dir_all(&format!("{transaction_dir}/previous"))
                .expect("previous directory");
            storage
                .create_dir_all(&format!("{transaction_dir}/next"))
                .expect("next directory");
            write_manifest_copy(&storage, &transaction_dir, "previous", &previous)
                .expect("previous manifest");
            write_manifest_copy(&storage, &transaction_dir, "next", &next).expect("next manifest");
            for (id, body) in &next_bodies {
                storage
                    .write_synced(&format!("{transaction_dir}/next/{id}.md"), body.as_bytes())
                    .expect("next body");
            }
            storage
                .write_synced(
                    &format!("{transaction_dir}/transaction.json"),
                    serde_json::to_vec(&serde_json::json!({
                        "transactionId": transaction_id,
                        "previousRevision": previous.revision,
                        "nextRevision": next.revision,
                        "state": if committed { "manifestCommitted" } else { "filesApplied" }
                    }))
                    .expect("old record")
                    .as_slice(),
                )
                .expect("transaction record");
            if committed {
                storage.create_dir_all("notes").expect("notes");
                for (id, body) in &next_bodies {
                    storage
                        .write_synced(&format!("notes/{id}.md"), body.as_bytes())
                        .expect("live next body");
                }
                replace_manifest(&storage, "old-current", &next).expect("current next");
            }
            recover_incomplete(&storage).expect("recover old record");
            let recovered = read_manifest(&storage).expect("manifest");
            if committed {
                assert_eq!(recovered, next);
                assert_live_files_match(&storage, &next, &next_bodies);
            } else {
                assert_eq!(recovered, previous);
                assert_live_files_match(&storage, &previous, &previous_bodies);
            }
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
            &WorkspaceCommand::DeleteNote {
                expected_revision: 1,
                note_id: NOTE_ID.to_owned(),
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
