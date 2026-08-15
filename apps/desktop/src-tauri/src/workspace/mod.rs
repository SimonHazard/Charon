mod command;
mod error;
mod migration;
mod model;
mod recovery;
mod storage;
mod watch;

use std::collections::{HashMap, HashSet};
use std::path::Path;

use uuid::Uuid;

pub use command::{WorkspaceCommand, WorkspaceCommandResult};
pub use error::{WorkspaceError, WorkspaceIpcError};
#[doc(hidden)]
pub use migration::MigrationFailure;
pub use model::{
    AttachmentDto, NoteDto, NoteStatus, WorkspaceChangedEvent, WorkspaceHealth,
    WorkspaceHealthIssue, WorkspaceHealthIssueKind, WorkspaceSnapshot,
};

use command::{apply_command, find_note, find_note_mut, validate_ids, AppliedCommand};
use model::{
    now_utc, validate_body, PersistedAttachment, PersistedManifest,
    WorkspaceHealthIssueKind::ImportCandidate, MAX_ATTACHMENTS_PER_NOTE, MAX_NOTE_BYTES,
};
use recovery::{
    commit, commit_with_new_attachments, read_manifest, recover_incomplete, replace_manifest,
};
use storage::MemoryWorkspaceStorage;
#[doc(hidden)]
pub use storage::StorageFailure;
use storage::{FailingWorkspaceStorage, RealWorkspaceStorage, WorkspaceStorage};
use watch::WorkspaceWatcher;

pub struct Workspace {
    storage: Box<dyn WorkspaceStorage>,
    manifest: PersistedManifest,
    bodies: HashMap<String, String>,
    health: WorkspaceHealth,
    watcher: Option<WorkspaceWatcher>,
    events: Vec<WorkspaceChangedEvent>,
    cleanup_blocked: bool,
}

impl Workspace {
    pub fn create(path: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::create(path.as_ref())?;
        Self::create_in(Box::new(storage))
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::open(path.as_ref())?;
        Self::open_in(Box::new(storage))
    }

    #[doc(hidden)]
    pub fn open_with_storage_failure(
        path: impl AsRef<Path>,
        failure: StorageFailure,
    ) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::open(path.as_ref())?;
        Self::open_in(Box::new(FailingWorkspaceStorage::new(storage, failure)))
    }

    #[doc(hidden)]
    pub fn open_with_migration_failure(
        path: impl AsRef<Path>,
        failure: MigrationFailure,
    ) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::open(path.as_ref())?;
        Self::open_in_with_migration_failure(Box::new(storage), failure)
    }

    #[doc(hidden)]
    pub fn in_memory() -> Result<Self, WorkspaceError> {
        Self::create_in(Box::new(MemoryWorkspaceStorage::new()))
    }

    #[doc(hidden)]
    pub fn in_memory_with_attachment_sources(
        sources: Vec<(String, String, Vec<u8>)>,
    ) -> Result<Self, WorkspaceError> {
        Self::create_in(Box::new(MemoryWorkspaceStorage::with_external_files(
            sources,
        )))
    }

    pub fn snapshot(&mut self) -> Result<WorkspaceSnapshot, WorkspaceError> {
        self.retry_cleanup_if_needed()?;
        self.reconcile_external_changes()?;
        self.manifest
            .snapshot(&self.bodies, self.storage.exists("legacy-trash-v1")?)
    }

    pub fn execute(
        &mut self,
        command: WorkspaceCommand,
    ) -> Result<WorkspaceCommandResult, WorkspaceError> {
        self.reconcile_external_changes()?;
        if self.cleanup_blocked {
            return Err(WorkspaceError::DeletionCleanupRequired {
                transaction_id: "pending".to_owned(),
            });
        }
        let (applied, new_attachments) = match &command {
            WorkspaceCommand::ImportNoteAttachments {
                expected_revision,
                note_id,
                source_paths,
            } => self.prepare_attachment_import(*expected_revision, note_id, source_paths)?,
            WorkspaceCommand::DeleteNoteAttachments {
                expected_revision,
                note_id,
                attachment_ids,
            } => (
                self.prepare_attachment_delete(*expected_revision, note_id, attachment_ids)?,
                HashMap::new(),
            ),
            _ => (
                apply_command(
                    &self.manifest,
                    &self.bodies,
                    &command,
                    || Uuid::new_v4().to_string(),
                    now_utc,
                )?,
                HashMap::new(),
            ),
        };
        let output = commit_with_new_attachments(
            self.storage.as_ref(),
            &self.manifest,
            &self.bodies,
            &applied.manifest,
            &applied.bodies,
            &new_attachments,
        );
        let output = match output {
            Ok(output) => output,
            Err(error @ WorkspaceError::DeletionCleanupRequired { .. }) => {
                self.manifest = applied.manifest;
                self.bodies = applied.bodies;
                self.cleanup_blocked = true;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        self.manifest = applied.manifest;
        self.bodies = applied.bodies;
        self.health = self.scan_health();
        let snapshot = self
            .manifest
            .snapshot(&self.bodies, self.storage.exists("legacy-trash-v1")?)?;
        self.events.push(WorkspaceChangedEvent {
            revision: snapshot.revision,
            snapshot: snapshot.clone(),
        });
        Ok(WorkspaceCommandResult {
            snapshot,
            transaction_id: output.transaction_id,
        })
    }

    pub fn start_watching(&mut self) -> Result<(), WorkspaceError> {
        if self.watcher.is_some() {
            return Ok(());
        }
        let root = self.storage.root().ok_or_else(|| {
            WorkspaceError::Validation("the memory Workspace cannot be watched".to_owned())
        })?;
        self.watcher = Some(WorkspaceWatcher::start(root)?);
        Ok(())
    }

    pub fn stop_watching(&mut self) {
        if let Some(mut watcher) = self.watcher.take() {
            watcher.stop();
        }
    }

    pub fn health(&mut self) -> Result<WorkspaceHealth, WorkspaceError> {
        self.retry_cleanup_if_needed()?;
        self.reconcile_external_changes()?;
        Ok(self.health.clone())
    }

    pub fn take_events(&mut self) -> Vec<WorkspaceChangedEvent> {
        std::mem::take(&mut self.events)
    }

    pub(crate) fn canonical_managed_path(&self, relative: &str) -> Result<String, WorkspaceError> {
        self.storage.canonical_managed_path(relative)
    }

    fn create_in(storage: Box<dyn WorkspaceStorage>) -> Result<Self, WorkspaceError> {
        if storage.exists("charon.workspace.json")? {
            return Err(WorkspaceError::Validation(
                "a Workspace already exists in this directory".to_owned(),
            ));
        }
        storage.create_dir_all("notes")?;
        storage.create_dir_all("attachments")?;
        storage.create_dir_all("backups")?;
        let manifest = PersistedManifest::empty(Uuid::new_v4().to_string());
        let bodies = HashMap::new();
        manifest.validate(&bodies)?;
        replace_manifest(storage.as_ref(), &Uuid::new_v4().to_string(), &manifest)?;
        Ok(Self {
            storage,
            manifest,
            bodies,
            health: WorkspaceHealth {
                is_healthy: true,
                issues: Vec::new(),
            },
            watcher: None,
            events: Vec::new(),
            cleanup_blocked: false,
        })
    }

    fn open_in(storage: Box<dyn WorkspaceStorage>) -> Result<Self, WorkspaceError> {
        migration::recover_incomplete_migration(storage.as_ref())?;
        match migration::schema_version(storage.as_ref())? {
            1 => {
                migration::remove_completed_v1_transactions(storage.as_ref())?;
                migration::migrate_v1(storage.as_ref())?;
            }
            2 => recover_incomplete(storage.as_ref())?,
            version => return Err(WorkspaceError::UnsupportedSchema(version)),
        }
        let (manifest, bodies, health) = load_state(storage.as_ref())?;
        Ok(Self {
            storage,
            manifest,
            bodies,
            health,
            watcher: None,
            events: Vec::new(),
            cleanup_blocked: false,
        })
    }

    fn open_in_with_migration_failure(
        storage: Box<dyn WorkspaceStorage>,
        failure: MigrationFailure,
    ) -> Result<Self, WorkspaceError> {
        migration::recover_incomplete_migration(storage.as_ref())?;
        match migration::schema_version(storage.as_ref())? {
            1 => {
                migration::remove_completed_v1_transactions(storage.as_ref())?;
                migration::migrate_v1_with_failure(storage.as_ref(), failure)?;
            }
            2 => recover_incomplete(storage.as_ref())?,
            version => return Err(WorkspaceError::UnsupportedSchema(version)),
        }
        let (manifest, bodies, health) = load_state(storage.as_ref())?;
        Ok(Self {
            storage,
            manifest,
            bodies,
            health,
            watcher: None,
            events: Vec::new(),
            cleanup_blocked: false,
        })
    }

    fn reconcile_external_changes(&mut self) -> Result<(), WorkspaceError> {
        let Some(watcher) = &self.watcher else {
            return Ok(());
        };
        let paths = watcher.drain();
        if paths.is_empty() {
            return Ok(());
        }
        let root = self.storage.root().ok_or(WorkspaceError::InvalidPath)?;
        let relative_paths = paths
            .iter()
            .filter_map(|path| path.strip_prefix(root).ok())
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .collect::<HashSet<_>>();

        if relative_paths.contains("charon.workspace.json") {
            match load_state(self.storage.as_ref()) {
                Ok((mut manifest, bodies, health)) => {
                    if manifest == self.manifest && bodies == self.bodies {
                        self.health = health;
                        return Ok(());
                    }
                    manifest.revision = self.manifest.revision.checked_add(1).ok_or_else(|| {
                        WorkspaceError::Validation("revision overflow".to_owned())
                    })?;
                    manifest.validate(&bodies)?;
                    commit(
                        self.storage.as_ref(),
                        &self.manifest,
                        &self.bodies,
                        &manifest,
                        &bodies,
                    )?;
                    self.manifest = manifest;
                    self.bodies = bodies;
                    self.health = health;
                    self.push_external_event()?;
                }
                Err(_) => self.set_health_issue(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::InvalidManifest,
                    resource_id: None,
                    message_key: "workspace_health_invalid_manifest".to_owned(),
                }),
            }
            return Ok(());
        }

        let known_ids = self
            .manifest
            .notes
            .iter()
            .map(|note| note.id.clone())
            .collect::<HashSet<_>>();
        let mut next_bodies = self.bodies.clone();
        let mut changed_ids = HashSet::new();
        let mut issue = None;
        for relative in relative_paths {
            let Some(file_name) = relative.strip_prefix("notes/") else {
                continue;
            };
            let Some(id) = file_name.strip_suffix(".md") else {
                continue;
            };
            if !known_ids.contains(id) {
                self.set_health_issue(WorkspaceHealthIssue {
                    kind: ImportCandidate,
                    resource_id: None,
                    message_key: "workspace_health_import_candidate".to_owned(),
                });
                continue;
            }
            if !self.storage.exists(&relative)? {
                issue = Some(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::MissingNote,
                    resource_id: Some(id.to_owned()),
                    message_key: "workspace_health_missing_note".to_owned(),
                });
                break;
            }
            let bytes = self.storage.read(&relative)?;
            if bytes.len() > MAX_NOTE_BYTES {
                issue = Some(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::InvalidNote,
                    resource_id: Some(id.to_owned()),
                    message_key: "workspace_health_invalid_note".to_owned(),
                });
                break;
            }
            let Ok(body) = String::from_utf8(bytes) else {
                issue = Some(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::InvalidNote,
                    resource_id: Some(id.to_owned()),
                    message_key: "workspace_health_invalid_note".to_owned(),
                });
                break;
            };
            if validate_body(&body).is_err() {
                issue = Some(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::InvalidNote,
                    resource_id: Some(id.to_owned()),
                    message_key: "workspace_health_invalid_note".to_owned(),
                });
                break;
            }
            if self.bodies.get(id) != Some(&body) {
                next_bodies.insert(id.to_owned(), body);
                changed_ids.insert(id.to_owned());
            }
        }
        if let Some(issue) = issue {
            self.set_health_issue(issue);
            return Ok(());
        }
        if changed_ids.is_empty() {
            return Ok(());
        }

        let mut next_manifest = self.manifest.clone();
        let updated_at = now_utc();
        for note in &mut next_manifest.notes {
            if changed_ids.contains(&note.id) {
                note.updated_at.clone_from(&updated_at);
            }
        }
        next_manifest.revision = next_manifest
            .revision
            .checked_add(1)
            .ok_or_else(|| WorkspaceError::Validation("revision overflow".to_owned()))?;
        next_manifest.validate(&next_bodies)?;
        commit(
            self.storage.as_ref(),
            &self.manifest,
            &self.bodies,
            &next_manifest,
            &next_bodies,
        )?;
        self.manifest = next_manifest;
        self.bodies = next_bodies;
        self.health = self.scan_health();
        self.push_external_event()?;
        Ok(())
    }

    fn push_external_event(&mut self) -> Result<(), WorkspaceError> {
        let snapshot = self
            .manifest
            .snapshot(&self.bodies, self.storage.exists("legacy-trash-v1")?)?;
        self.events.push(WorkspaceChangedEvent {
            revision: snapshot.revision,
            snapshot,
        });
        Ok(())
    }

    fn scan_health(&self) -> WorkspaceHealth {
        load_state(self.storage.as_ref())
            .map(|(_, _, health)| health)
            .unwrap_or_else(|_| WorkspaceHealth {
                is_healthy: false,
                issues: vec![WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::InvalidManifest,
                    resource_id: None,
                    message_key: "workspace_health_invalid_manifest".to_owned(),
                }],
            })
    }

    fn set_health_issue(&mut self, issue: WorkspaceHealthIssue) {
        self.health.is_healthy = false;
        self.health.issues.retain(|current| {
            current.kind != issue.kind || current.resource_id != issue.resource_id
        });
        self.health.issues.push(issue);
    }

    fn retry_cleanup_if_needed(&mut self) -> Result<(), WorkspaceError> {
        if !self.cleanup_blocked {
            return Ok(());
        }
        recover_incomplete(self.storage.as_ref())?;
        let (manifest, bodies, health) = load_state(self.storage.as_ref())?;
        self.manifest = manifest;
        self.bodies = bodies;
        self.health = health;
        self.cleanup_blocked = false;
        Ok(())
    }

    fn prepare_attachment_import(
        &self,
        expected_revision: u64,
        note_id: &str,
        source_paths: &[String],
    ) -> Result<(AppliedCommand, HashMap<String, Vec<u8>>), WorkspaceError> {
        if expected_revision != self.manifest.revision {
            return Err(WorkspaceError::StaleRevision {
                expected: expected_revision,
                actual: self.manifest.revision,
            });
        }
        validate_ids(&[note_id.to_owned()], "note")?;
        if source_paths.is_empty() {
            return Err(WorkspaceError::Validation(
                "attachment source list cannot be empty".to_owned(),
            ));
        }
        let note = find_note(&self.manifest, note_id)?;
        if note.attachments.len().saturating_add(source_paths.len()) > MAX_ATTACHMENTS_PER_NOTE {
            return Err(WorkspaceError::Validation(
                "too many attachments".to_owned(),
            ));
        }
        let mut sources = Vec::with_capacity(source_paths.len());
        let mut identities = HashSet::new();
        for path in source_paths {
            let source = self.storage.read_external_regular(path)?;
            if !identities.insert(source.identity.clone()) {
                return Err(WorkspaceError::Validation(
                    "duplicate attachment source".to_owned(),
                ));
            }
            sources.push(source);
        }
        let timestamp = now_utc();
        let mut next = self.manifest.clone();
        let target = find_note_mut(&mut next, note_id)?;
        let mut bytes = HashMap::new();
        for source in sources {
            let id = Uuid::new_v4().to_string();
            let suffix = source
                .extension
                .as_deref()
                .map(|value| format!(".{value}"))
                .unwrap_or_default();
            let relative_path = format!("attachments/{note_id}/{id}{suffix}");
            bytes.insert(relative_path.clone(), source.bytes);
            target.attachments.push(PersistedAttachment {
                id,
                file_name: source.file_name,
                relative_path,
                created_at: timestamp.clone(),
            });
        }
        target.attachments.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then(left.id.cmp(&right.id))
        });
        target.updated_at = timestamp;
        next.revision += 1;
        next.validate(&self.bodies)?;
        Ok((
            AppliedCommand {
                manifest: next,
                bodies: self.bodies.clone(),
            },
            bytes,
        ))
    }

    fn prepare_attachment_delete(
        &self,
        expected_revision: u64,
        note_id: &str,
        attachment_ids: &[String],
    ) -> Result<AppliedCommand, WorkspaceError> {
        if expected_revision != self.manifest.revision {
            return Err(WorkspaceError::StaleRevision {
                expected: expected_revision,
                actual: self.manifest.revision,
            });
        }
        validate_ids(&[note_id.to_owned()], "note")?;
        validate_ids(attachment_ids, "attachment")?;
        let mut next = self.manifest.clone();
        let note = find_note_mut(&mut next, note_id)?;
        for id in attachment_ids {
            if !note
                .attachments
                .iter()
                .any(|attachment| attachment.id == *id)
            {
                return Err(WorkspaceError::NotFound("attachment".to_owned()));
            }
        }
        let ids = attachment_ids.iter().collect::<HashSet<_>>();
        note.attachments
            .retain(|attachment| !ids.contains(&attachment.id));
        note.updated_at = now_utc();
        next.revision += 1;
        next.validate(&self.bodies)?;
        Ok(AppliedCommand {
            manifest: next,
            bodies: self.bodies.clone(),
        })
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        self.stop_watching();
    }
}

fn load_state(
    storage: &dyn WorkspaceStorage,
) -> Result<(PersistedManifest, HashMap<String, String>, WorkspaceHealth), WorkspaceError> {
    let manifest = read_manifest(storage)?;
    let mut bodies = HashMap::with_capacity(manifest.notes.len());
    for note in &manifest.notes {
        let path = format!("notes/{}.md", note.id);
        let bytes = storage.read(&path)?;
        if bytes.len() > MAX_NOTE_BYTES {
            return Err(WorkspaceError::Validation(
                "note body exceeds the v1 limit".to_owned(),
            ));
        }
        let body = String::from_utf8(bytes)
            .map_err(|_| WorkspaceError::Validation("note body must be UTF-8".to_owned()))?;
        bodies.insert(note.id.clone(), body);
    }
    manifest.validate(&bodies)?;

    let known = manifest
        .notes
        .iter()
        .map(|note| format!("{}.md", note.id))
        .collect::<HashSet<_>>();
    let import_candidates = storage
        .list("notes")?
        .into_iter()
        .filter(|name| name.ends_with(".md") && !known.contains(name))
        .count();
    let mut issues = if import_candidates == 0 {
        Vec::new()
    } else {
        vec![WorkspaceHealthIssue {
            kind: ImportCandidate,
            resource_id: None,
            message_key: "workspace_health_import_candidate".to_owned(),
        }]
    };
    for note in &manifest.notes {
        for attachment in &note.attachments {
            if !storage.exists(&attachment.relative_path)?
                || storage.read(&attachment.relative_path).is_err()
            {
                issues.push(WorkspaceHealthIssue {
                    kind: WorkspaceHealthIssueKind::MissingAttachment,
                    resource_id: Some(attachment.id.clone()),
                    message_key: "workspace_health_missing_attachment".to_owned(),
                });
            }
        }
    }
    Ok((
        manifest,
        bodies,
        WorkspaceHealth {
            is_healthy: issues.is_empty(),
            issues,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_workspace_runs_complete_command_contract() {
        let mut workspace = Workspace::in_memory().expect("memory workspace");
        let initial = workspace.snapshot().expect("initial snapshot");
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: initial.revision,
                body: "hello".to_owned(),
            })
            .expect("create note");
        assert_eq!(created.snapshot.notes.len(), 1);
        let deleted = workspace
            .execute(WorkspaceCommand::DeleteNote {
                expected_revision: created.snapshot.revision,
                note_id: created.snapshot.notes[0].id.clone(),
            })
            .expect("delete");
        assert!(deleted.snapshot.notes.is_empty());
    }
}
