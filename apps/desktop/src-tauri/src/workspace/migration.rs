use std::collections::HashMap;

use serde_json::{json, Value};
use uuid::Uuid;

use super::error::WorkspaceError;
use super::model::{
    LegacyV1Manifest, PersistedManifest, PersistedNote, MAX_MANIFEST_BYTES, MAX_NOTE_BYTES,
};
use super::recovery::replace_manifest;
use super::storage::WorkspaceStorage;

const MIGRATION_DIR: &str = "backups/migration-v1-v2";
const LEGACY_ARCHIVE: &str = "legacy-trash-v1";
const ARCHIVE_README: &str = "These Markdown files were already in Charon's legacy Trash before the schema v2 migration.\n\nThey are not loaded or indexed by Charon. Review or delete them with normal filesystem tools.\n";

pub(crate) fn schema_version(storage: &dyn WorkspaceStorage) -> Result<u32, WorkspaceError> {
    let bytes = storage.read("charon.workspace.json")?;
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::InvalidManifest);
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| WorkspaceError::InvalidManifest)?;
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or(WorkspaceError::InvalidManifest)?;
    u32::try_from(version).map_err(|_| WorkspaceError::InvalidManifest)
}

pub(crate) fn recover_incomplete_migration(
    storage: &dyn WorkspaceStorage,
) -> Result<(), WorkspaceError> {
    if !storage.exists(MIGRATION_DIR)? {
        return Ok(());
    }
    match schema_version(storage)? {
        2 => finish_committed_migration(storage),
        1 => rollback_staged_migration(storage),
        version => Err(WorkspaceError::UnsupportedSchema(version)),
    }
}

pub(crate) fn migrate_v1(storage: &dyn WorkspaceStorage) -> Result<bool, WorkspaceError> {
    let original_manifest_bytes = storage.read("charon.workspace.json")?;
    if original_manifest_bytes.len() > MAX_MANIFEST_BYTES {
        return Err(WorkspaceError::InvalidManifest);
    }
    let legacy: LegacyV1Manifest = serde_json::from_slice(&original_manifest_bytes)
        .map_err(|_| WorkspaceError::InvalidManifest)?;
    let bodies = read_legacy_bodies(storage, &legacy)?;
    legacy.validate(&bodies)?;
    let trashed = legacy
        .notes
        .iter()
        .filter(|note| note.trashed_at.is_some())
        .collect::<Vec<_>>();
    if !trashed.is_empty() && storage.exists(LEGACY_ARCHIVE)? {
        return Err(WorkspaceError::LegacyArchiveCollision);
    }

    stage_original(storage, &original_manifest_bytes, &bodies)?;
    if !trashed.is_empty() {
        storage.create_dir_all(LEGACY_ARCHIVE)?;
        storage.create_dir_all(&format!("{LEGACY_ARCHIVE}/notes"))?;
        storage.write_synced(
            &format!("{LEGACY_ARCHIVE}/README.md"),
            ARCHIVE_README.as_bytes(),
        )?;
        for note in &trashed {
            storage.write_synced(
                &format!("{LEGACY_ARCHIVE}/notes/{}.md", note.id),
                bodies[&note.id].as_bytes(),
            )?;
        }
        let archived_notes = trashed.iter().map(|note| json!({ "id": note.id, "sectionId": note.section_id, "status": note.status, "createdAt": note.created_at, "updatedAt": note.updated_at, "completedAt": note.completed_at, "trashedAt": note.trashed_at })).collect::<Vec<_>>();
        let archive_manifest = json!({ "explanation": "These notes were archived from Charon schema v1 Trash and are not active schema v2 Notes.", "archivedNotes": archived_notes, "legacySections": legacy.sections, "originalManifest": legacy });
        let mut bytes = serde_json::to_vec_pretty(&archive_manifest)
            .map_err(|_| WorkspaceError::InvalidManifest)?;
        bytes.push(b'\n');
        storage.write_synced(&format!("{LEGACY_ARCHIVE}/manifest.json"), &bytes)?;
        storage.sync_dir(LEGACY_ARCHIVE)?;
    }

    let active_notes = legacy
        .notes
        .iter()
        .filter(|note| note.trashed_at.is_none())
        .map(|note| PersistedNote {
            id: note.id.clone(),
            status: note.status,
            created_at: note.created_at.clone(),
            updated_at: note.updated_at.clone(),
            completed_at: note.completed_at.clone(),
            tags: Vec::new(),
            attachments: Vec::new(),
        })
        .collect::<Vec<_>>();
    let manifest = PersistedManifest {
        schema_version: 2,
        workspace_id: legacy.workspace_id,
        revision: legacy.revision,
        notes: active_notes,
    };
    let active_bodies = manifest
        .notes
        .iter()
        .map(|note| (note.id.clone(), bodies[&note.id].clone()))
        .collect::<HashMap<_, _>>();
    manifest.validate(&active_bodies)?;
    replace_manifest(storage, &Uuid::new_v4().to_string(), &manifest)?;
    for note in trashed {
        storage.remove_file(&format!("notes/{}.md", note.id))?;
    }
    storage.sync_dir("notes")?;
    cleanup_all_backups(storage)?;
    Ok(!manifest.notes.is_empty() || storage.exists(LEGACY_ARCHIVE)?)
}

fn read_legacy_bodies(
    storage: &dyn WorkspaceStorage,
    legacy: &LegacyV1Manifest,
) -> Result<HashMap<String, String>, WorkspaceError> {
    legacy
        .notes
        .iter()
        .map(|note| {
            let bytes = storage.read(&format!("notes/{}.md", note.id))?;
            if bytes.len() > MAX_NOTE_BYTES {
                return Err(WorkspaceError::InvalidManifest);
            }
            let body = String::from_utf8(bytes).map_err(|_| WorkspaceError::InvalidManifest)?;
            Ok((note.id.clone(), body))
        })
        .collect()
}

fn stage_original(
    storage: &dyn WorkspaceStorage,
    manifest: &[u8],
    bodies: &HashMap<String, String>,
) -> Result<(), WorkspaceError> {
    storage.create_dir_all("backups")?;
    storage.create_dir_all(MIGRATION_DIR)?;
    storage.create_dir_all(&format!("{MIGRATION_DIR}/notes"))?;
    storage.write_synced(&format!("{MIGRATION_DIR}/charon.workspace.json"), manifest)?;
    for (id, body) in bodies {
        storage.write_synced(&format!("{MIGRATION_DIR}/notes/{id}.md"), body.as_bytes())?;
    }
    storage.write_synced(
        &format!("{MIGRATION_DIR}/migration.json"),
        b"{\"from\":1,\"to\":2}\n",
    )?;
    storage.sync_dir(MIGRATION_DIR)
}

fn rollback_staged_migration(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    let manifest = storage.read(&format!("{MIGRATION_DIR}/charon.workspace.json"))?;
    let legacy: LegacyV1Manifest =
        serde_json::from_slice(&manifest).map_err(|_| WorkspaceError::InvalidManifest)?;
    storage.create_dir_all("notes")?;
    for note in &legacy.notes {
        let bytes = storage.read(&format!("{MIGRATION_DIR}/notes/{}.md", note.id))?;
        let temporary = format!("notes/.charon-migration-{}.tmp", note.id);
        storage.write_synced(&temporary, &bytes)?;
        storage.rename(&temporary, &format!("notes/{}.md", note.id))?;
    }
    storage.write_synced(".charon-migration-rollback.tmp", &manifest)?;
    storage.rename(".charon-migration-rollback.tmp", "charon.workspace.json")?;
    if storage.exists(LEGACY_ARCHIVE)? {
        storage.remove_dir_all(LEGACY_ARCHIVE)?;
    }
    storage.remove_dir_all(MIGRATION_DIR)?;
    storage.sync_dir("")?;
    Ok(())
}

fn finish_committed_migration(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    let manifest: PersistedManifest =
        serde_json::from_slice(&storage.read("charon.workspace.json")?)
            .map_err(|_| WorkspaceError::InvalidManifest)?;
    let active = manifest
        .notes
        .iter()
        .map(|note| note.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let original: LegacyV1Manifest =
        serde_json::from_slice(&storage.read(&format!("{MIGRATION_DIR}/charon.workspace.json"))?)
            .map_err(|_| WorkspaceError::InvalidManifest)?;
    for note in original.notes {
        if !active.contains(note.id.as_str()) {
            storage.remove_file(&format!("notes/{}.md", note.id))?;
        }
    }
    cleanup_all_backups(storage)
}

fn cleanup_all_backups(storage: &dyn WorkspaceStorage) -> Result<(), WorkspaceError> {
    if storage.exists("backups")? {
        for entry in storage.list("backups")? {
            storage.remove_dir_all(&format!("backups/{entry}"))?;
        }
        storage.sync_dir("backups")?;
    }
    Ok(())
}
