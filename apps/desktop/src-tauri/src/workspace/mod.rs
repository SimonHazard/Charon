mod command;
mod error;
mod model;
mod recovery;
mod storage;
mod watch;

use std::collections::{HashMap, HashSet};
use std::path::Path;

use uuid::Uuid;

pub use command::{WorkspaceCommand, WorkspaceCommandResult};
pub use error::{WorkspaceError, WorkspaceIpcError};
pub use model::{
    NoteDto, NoteStatus, SectionDto, WorkspaceChangedEvent, WorkspaceHealth, WorkspaceHealthIssue,
    WorkspaceHealthIssueKind, WorkspaceSnapshot,
};

use command::apply_command;
use model::{
    now_utc, validate_body, PersistedManifest, WorkspaceHealthIssueKind::ImportCandidate,
    MAX_NOTE_BYTES,
};
use recovery::{commit, read_manifest, recover_incomplete, replace_manifest, undo};
use storage::MemoryWorkspaceStorage;
use storage::{RealWorkspaceStorage, WorkspaceStorage};
use watch::WorkspaceWatcher;

pub struct Workspace {
    storage: Box<dyn WorkspaceStorage>,
    manifest: PersistedManifest,
    bodies: HashMap<String, String>,
    health: WorkspaceHealth,
    watcher: Option<WorkspaceWatcher>,
    events: Vec<WorkspaceChangedEvent>,
}

impl Workspace {
    pub fn create(
        path: impl AsRef<Path>,
        initial_section_name: String,
    ) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::create(path.as_ref())?;
        Self::create_in(Box::new(storage), initial_section_name)
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let storage = RealWorkspaceStorage::open(path.as_ref())?;
        Self::open_in(Box::new(storage))
    }

    #[doc(hidden)]
    pub fn in_memory(initial_section_name: String) -> Result<Self, WorkspaceError> {
        Self::create_in(
            Box::new(MemoryWorkspaceStorage::new()),
            initial_section_name,
        )
    }

    pub fn snapshot(&mut self) -> Result<WorkspaceSnapshot, WorkspaceError> {
        self.reconcile_external_changes()?;
        self.manifest.snapshot(&self.bodies)
    }

    pub fn execute(
        &mut self,
        command: WorkspaceCommand,
    ) -> Result<WorkspaceCommandResult, WorkspaceError> {
        self.reconcile_external_changes()?;
        if let WorkspaceCommand::Undo {
            expected_revision,
            transaction_id,
        } = &command
        {
            if *expected_revision != self.manifest.revision {
                return Err(WorkspaceError::StaleRevision {
                    expected: *expected_revision,
                    actual: self.manifest.revision,
                });
            }
            let (manifest, bodies, undo_transaction_id) = undo(
                self.storage.as_ref(),
                &self.manifest,
                &self.bodies,
                transaction_id,
            )?;
            self.manifest = manifest;
            self.bodies = bodies;
            let snapshot = self.manifest.snapshot(&self.bodies)?;
            self.events.push(WorkspaceChangedEvent {
                revision: snapshot.revision,
                snapshot: snapshot.clone(),
            });
            return Ok(WorkspaceCommandResult {
                snapshot,
                transaction_id: undo_transaction_id.clone(),
                undo_token: Some(undo_transaction_id),
            });
        }

        let applied = apply_command(
            &self.manifest,
            &self.bodies,
            &command,
            || Uuid::new_v4().to_string(),
            now_utc,
        )?;
        let output = commit(
            self.storage.as_ref(),
            &self.manifest,
            &self.bodies,
            &applied.manifest,
            &applied.bodies,
        )?;
        self.manifest = applied.manifest;
        self.bodies = applied.bodies;
        self.health = self.scan_health();
        let snapshot = self.manifest.snapshot(&self.bodies)?;
        self.events.push(WorkspaceChangedEvent {
            revision: snapshot.revision,
            snapshot: snapshot.clone(),
        });
        Ok(WorkspaceCommandResult {
            snapshot,
            transaction_id: output.transaction_id.clone(),
            undo_token: applied.undoable.then_some(output.transaction_id),
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
        self.reconcile_external_changes()?;
        Ok(self.health.clone())
    }

    pub fn take_events(&mut self) -> Vec<WorkspaceChangedEvent> {
        std::mem::take(&mut self.events)
    }

    fn create_in(
        storage: Box<dyn WorkspaceStorage>,
        initial_section_name: String,
    ) -> Result<Self, WorkspaceError> {
        if storage.exists("charon.workspace.json")? {
            return Err(WorkspaceError::Validation(
                "a Workspace already exists in this directory".to_owned(),
            ));
        }
        storage.create_dir_all("notes")?;
        storage.create_dir_all("backups")?;
        model::validate_name(&initial_section_name)?;
        let manifest = PersistedManifest::empty(
            Uuid::new_v4().to_string(),
            Uuid::new_v4().to_string(),
            initial_section_name.trim().to_owned(),
            now_utc(),
        );
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
        })
    }

    fn open_in(storage: Box<dyn WorkspaceStorage>) -> Result<Self, WorkspaceError> {
        recover_incomplete(storage.as_ref())?;
        let (manifest, bodies, health) = load_state(storage.as_ref())?;
        Ok(Self {
            storage,
            manifest,
            bodies,
            health,
            watcher: None,
            events: Vec::new(),
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
        let snapshot = self.manifest.snapshot(&self.bodies)?;
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
    let issues = if import_candidates == 0 {
        Vec::new()
    } else {
        vec![WorkspaceHealthIssue {
            kind: ImportCandidate,
            resource_id: None,
            message_key: "workspace_health_import_candidate".to_owned(),
        }]
    };
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
        let mut workspace = Workspace::in_memory("Inbox".to_owned()).expect("memory workspace");
        let initial = workspace.snapshot().expect("initial snapshot");
        let section_id = initial.sections[0].id.clone();
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: initial.revision,
                section_id,
                body: "hello".to_owned(),
                sort_key: 0,
            })
            .expect("create note");
        assert_eq!(created.snapshot.notes.len(), 1);
        assert!(created.undo_token.is_some());
        let restored = workspace
            .execute(WorkspaceCommand::Undo {
                expected_revision: created.snapshot.revision,
                transaction_id: created.undo_token.expect("undo token"),
            })
            .expect("undo");
        assert!(restored.snapshot.notes.is_empty());
        assert_eq!(restored.snapshot.revision, 2);
    }
}
