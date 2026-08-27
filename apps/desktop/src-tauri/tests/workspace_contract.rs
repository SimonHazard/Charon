use std::fs;
use std::path::Path;

use charon_desktop_lib::workspace::{
    AttachmentDto, MigrationFailure, NoteDto, NoteStatus, StorageFailure, Workspace,
    WorkspaceChangedEvent, WorkspaceCommand, WorkspaceCommandResult, WorkspaceError,
    WorkspaceEventOrigin, WorkspaceHealth, WorkspaceHealthIssue, WorkspaceHealthIssueKind,
    WorkspaceIpcError, WorkspaceSnapshot,
};
use serde_json::json;
use tempfile::tempdir;
use ts_rs::{Config, TS};

fn exercise_flat_contract(mut workspace: Workspace) {
    let initial = workspace.snapshot().expect("initial snapshot");
    assert_eq!(initial.schema_version, 2);
    assert!(initial.notes.is_empty());
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: initial.revision,
            body: "  exact body\n".to_owned(),
        })
        .expect("create");
    let id = created.snapshot.notes[0].id.clone();
    assert_eq!(created.snapshot.notes[0].body, "  exact body\n");
    let tagged = workspace
        .execute(WorkspaceCommand::SetNoteTags {
            expected_revision: created.snapshot.revision,
            note_id: id.clone(),
            tags: vec![" Research ".to_owned(), "Agent".to_owned()],
        })
        .expect("tags");
    assert_eq!(tagged.snapshot.notes[0].tags, ["Research", "Agent"]);
    let done = workspace
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: tagged.snapshot.revision,
            note_id: id.clone(),
            status: NoteStatus::Done,
        })
        .expect("done");
    assert!(done.snapshot.notes[0].completed_at.is_some());
    let reopened = workspace
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: done.snapshot.revision,
            note_id: id.clone(),
            status: NoteStatus::Open,
        })
        .expect("reopen");
    assert!(reopened.snapshot.notes[0].completed_at.is_none());
    let deleted = workspace
        .execute(WorkspaceCommand::DeleteNote {
            expected_revision: reopened.snapshot.revision,
            note_id: id,
        })
        .expect("delete");
    assert!(deleted.snapshot.notes.is_empty());
}

#[test]
fn memory_and_real_filesystem_share_the_flat_contract() {
    exercise_flat_contract(Workspace::in_memory().expect("memory"));
    let root = tempdir().expect("temp Workspace");
    exercise_flat_contract(Workspace::create(root.path()).expect("real"));
    assert!(fs::read_dir(root.path().join("backups"))
        .expect("backups")
        .next()
        .is_none());
}

#[test]
fn real_workspace_reopens_and_round_trips_a_note_body() {
    let root = tempdir().expect("temp Workspace");
    let mut workspace = Workspace::create(root.path()).expect("create Workspace");
    workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "  portable body\n".to_owned(),
        })
        .expect("create Note");
    drop(workspace);

    let mut reopened = Workspace::open(root.path()).expect("reopen Workspace");
    let snapshot = reopened.snapshot().expect("snapshot");
    assert_eq!(snapshot.notes.len(), 1);
    assert_eq!(snapshot.notes[0].body, "  portable body\n");
}

#[test]
fn managed_attachments_have_memory_and_real_parity() {
    let mut memory = Workspace::in_memory_with_attachment_sources(vec![(
        "source-a".to_owned(),
        "brief.PDF".to_owned(),
        b"attachment sentinel".to_vec(),
    )])
    .expect("memory");
    exercise_attachment_contract(&mut memory, "source-a".to_owned());

    let workspace_root = tempdir().expect("Workspace");
    let source_root = tempdir().expect("source");
    let source = source_root.path().join("brief.PDF");
    fs::write(&source, b"attachment sentinel").expect("source bytes");
    let mut real = Workspace::create(workspace_root.path()).expect("real");
    exercise_attachment_contract(&mut real, source.to_string_lossy().into_owned());
    let all = read_tree(workspace_root.path());
    assert!(!all
        .windows(b"attachment sentinel".len())
        .any(|window| window == b"attachment sentinel"));
    assert!(fs::read_dir(workspace_root.path().join("backups"))
        .expect("backups")
        .next()
        .is_none());
}

#[test]
fn attachment_import_rejects_unsafe_sources_atomically() {
    let workspace_root = tempdir().expect("Workspace");
    let source_root = tempdir().expect("source");
    let source = source_root.path().join("safe.txt");
    fs::write(&source, "safe").expect("source");
    let mut workspace = Workspace::create(workspace_root.path()).expect("Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "note".to_owned(),
        })
        .expect("create");
    let note_id = created.snapshot.notes[0].id.clone();
    let duplicate = workspace.execute(WorkspaceCommand::ImportNoteAttachments {
        expected_revision: 1,
        note_id: note_id.clone(),
        source_tokens: vec![
            source.to_string_lossy().into_owned(),
            source.to_string_lossy().into_owned(),
        ],
    });
    assert!(duplicate.is_err());
    assert_eq!(workspace.snapshot().expect("unchanged").revision, 1);
    let inside = workspace_root.path().join("inside.txt");
    fs::write(&inside, "inside").expect("inside");
    assert!(workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id: note_id.clone(),
            source_tokens: vec![inside.to_string_lossy().into_owned()]
        })
        .is_err());
    assert!(workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id,
            source_tokens: vec![source_root.path().to_string_lossy().into_owned()]
        })
        .is_err());
    assert_eq!(workspace.snapshot().expect("still unchanged").revision, 1);

    let missing = source_root.path().join("missing.txt");
    let note_id = workspace.snapshot().expect("snapshot").notes[0].id.clone();
    assert!(workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id,
            source_tokens: vec![
                source.to_string_lossy().into_owned(),
                missing.to_string_lossy().into_owned(),
            ],
        })
        .is_err());
    assert_eq!(
        workspace
            .snapshot()
            .expect("partial import rolled back")
            .revision,
        1
    );
    assert!(fs::read_dir(workspace_root.path().join("attachments"))
        .expect("attachments")
        .next()
        .is_none());
}

#[test]
fn same_name_attachments_are_distinct_and_external_deletion_is_a_health_issue() {
    let workspace_root = tempdir().expect("Workspace");
    let source_a = tempdir().expect("source a");
    let source_b = tempdir().expect("source b");
    let first = source_a.path().join("brief.txt");
    let second = source_b.path().join("brief.txt");
    fs::write(&first, b"first").expect("first");
    fs::write(&second, b"second").expect("second");
    let mut workspace = Workspace::create(workspace_root.path()).expect("Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "note".to_owned(),
        })
        .expect("create");
    let imported = workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id: created.snapshot.notes[0].id.clone(),
            source_tokens: vec![
                first.to_string_lossy().into_owned(),
                second.to_string_lossy().into_owned(),
            ],
        })
        .expect("import same names");
    let attachments = &imported.snapshot.notes[0].attachments;
    assert_eq!(attachments.len(), 2);
    assert_eq!(attachments[0].file_name, "brief.txt");
    assert_eq!(attachments[1].file_name, "brief.txt");
    assert_ne!(attachments[0].id, attachments[1].id);
    assert_ne!(attachments[0].relative_path, attachments[1].relative_path);

    fs::remove_file(workspace_root.path().join(&attachments[0].relative_path))
        .expect("simulate external deletion");
    drop(workspace);
    let mut reopened = Workspace::open(workspace_root.path()).expect("reopen");
    let health = reopened.health().expect("health");
    assert!(!health.is_healthy);
    assert!(health.issues.iter().any(|issue| {
        issue.kind == WorkspaceHealthIssueKind::MissingAttachment
            && issue.resource_id.as_deref() == Some(attachments[0].id.as_str())
    }));
}

#[test]
fn permanent_note_delete_removes_body_attachment_and_transaction_sentinels() {
    let workspace_root = tempdir().expect("Workspace");
    let source_root = tempdir().expect("source");
    let source = source_root.path().join("private.bin");
    fs::write(&source, b"private attachment sentinel").expect("source");
    let mut workspace = Workspace::create(workspace_root.path()).expect("Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "private note sentinel".to_owned(),
        })
        .expect("create");
    let note_id = created.snapshot.notes[0].id.clone();
    let imported = workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id: note_id.clone(),
            source_tokens: vec![source.to_string_lossy().into_owned()],
        })
        .expect("import");
    let managed = imported.snapshot.notes[0].attachments[0]
        .relative_path
        .clone();
    let deleted = workspace
        .execute(WorkspaceCommand::DeleteNote {
            expected_revision: 2,
            note_id: note_id.clone(),
        })
        .expect("permanent delete");
    assert!(deleted.snapshot.notes.is_empty());
    assert!(!workspace_root
        .path()
        .join(format!("notes/{note_id}.md"))
        .exists());
    assert!(!workspace_root.path().join(managed).exists());
    assert!(fs::read_dir(workspace_root.path().join("backups"))
        .expect("backups")
        .next()
        .is_none());
    let bytes = read_tree(workspace_root.path());
    assert!(!bytes
        .windows(b"private note sentinel".len())
        .any(|window| window == b"private note sentinel"));
    assert!(!bytes
        .windows(b"private attachment sentinel".len())
        .any(|window| window == b"private attachment sentinel"));
}

#[test]
fn every_real_filesystem_attachment_failure_is_atomic_and_recoverable() {
    for failure in [
        StorageFailure::AttachmentOpen,
        StorageFailure::AttachmentRead,
        StorageFailure::AttachmentWrite,
        StorageFailure::ShortCopy,
        StorageFailure::Sync,
        StorageFailure::Rename,
        StorageFailure::Manifest,
        StorageFailure::Cleanup,
    ] {
        let workspace_root = tempdir().expect("Workspace");
        let source_root = tempdir().expect("source");
        let source = source_root.path().join("failure-sentinel.bin");
        fs::write(&source, b"attachment failure sentinel").expect("source");
        let mut workspace = Workspace::create(workspace_root.path()).expect("create Workspace");
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: 0,
                body: "stable note".to_owned(),
            })
            .expect("create note");
        let note_id = created.snapshot.notes[0].id.clone();
        drop(workspace);

        let mut failing = Workspace::open_with_storage_failure(workspace_root.path(), failure)
            .expect("open failing Workspace");
        assert!(failing
            .execute(WorkspaceCommand::ImportNoteAttachments {
                expected_revision: 1,
                note_id: note_id.clone(),
                source_tokens: vec![source.to_string_lossy().into_owned()],
            })
            .is_err());
        drop(failing);

        let mut recovered = Workspace::open(workspace_root.path()).expect("recover Workspace");
        let snapshot = recovered.snapshot().expect("recovered snapshot");
        assert!(snapshot.revision == 1 || snapshot.revision == 2);
        assert_eq!(snapshot.notes.len(), 1);
        assert_eq!(snapshot.notes[0].body, "stable note");
        assert!(snapshot.notes[0].attachments.len() <= 1);
        if let Some(attachment) = snapshot.notes[0].attachments.first() {
            assert_eq!(
                fs::read(workspace_root.path().join(&attachment.relative_path))
                    .expect("managed attachment"),
                b"attachment failure sentinel"
            );
        }
        assert!(fs::read_dir(workspace_root.path().join("backups"))
            .expect("backups")
            .next()
            .is_none());
        let paths = tree_paths(workspace_root.path());
        assert!(
            !paths
                .iter()
                .any(|path| path.contains(".charon-") || path.ends_with(".tmp")),
            "phase {failure:?} left temporary paths: {paths:?}"
        );
    }
}

#[test]
fn blocked_delete_cleanup_reports_its_transaction_and_retries_before_execute() {
    let root = tempdir().expect("Workspace");
    let mut workspace = Workspace::create(root.path()).expect("create Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "delete me".to_owned(),
        })
        .expect("create Note");
    let note_id = created.snapshot.notes[0].id.clone();
    drop(workspace);

    let mut failing = Workspace::open_with_storage_failure(root.path(), StorageFailure::Cleanup)
        .expect("open failing Workspace");
    let transaction_id = match failing.execute(WorkspaceCommand::DeleteNote {
        expected_revision: created.snapshot.revision,
        note_id,
    }) {
        Err(WorkspaceError::DeletionCleanupRequired { transaction_id }) => transaction_id,
        result => panic!("expected cleanup error, got {result:?}"),
    };
    assert_ne!(transaction_id, "pending");
    assert!(uuid::Uuid::parse_str(&transaction_id).is_ok());

    let retried = failing
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 2,
            body: "after cleanup".to_owned(),
        })
        .expect("retry cleanup before command");
    assert_eq!(retried.snapshot.notes.len(), 1);
    assert_eq!(retried.snapshot.notes[0].body, "after cleanup");
}

#[cfg(unix)]
#[test]
fn attachment_import_never_follows_symlinks() {
    use std::os::unix::fs::symlink;
    let workspace_root = tempdir().expect("Workspace");
    let source_root = tempdir().expect("source");
    let target = source_root.path().join("target.txt");
    let link = source_root.path().join("link.txt");
    fs::write(&target, "secret").expect("target");
    symlink(&target, &link).expect("link");
    let mut workspace = Workspace::create(workspace_root.path()).expect("Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "note".to_owned(),
        })
        .expect("create");
    assert!(workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id: created.snapshot.notes[0].id.clone(),
            source_tokens: vec![link.to_string_lossy().into_owned()]
        })
        .is_err());
    assert!(workspace.snapshot().expect("unchanged").notes[0]
        .attachments
        .is_empty());
}

fn exercise_attachment_contract(workspace: &mut Workspace, source: String) {
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "note sentinel".to_owned(),
        })
        .expect("create");
    let note_id = created.snapshot.notes[0].id.clone();
    let imported = workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: created.snapshot.revision,
            note_id: note_id.clone(),
            source_tokens: vec![source],
        })
        .expect("import");
    let attachment = imported.snapshot.notes[0].attachments[0].clone();
    assert_eq!(attachment.file_name, "brief.PDF");
    assert!(attachment
        .relative_path
        .starts_with(&format!("attachments/{note_id}/")));
    let removed = workspace
        .execute(WorkspaceCommand::DeleteNoteAttachments {
            expected_revision: imported.snapshot.revision,
            note_id,
            attachment_ids: vec![attachment.id],
        })
        .expect("remove");
    assert!(removed.snapshot.notes[0].attachments.is_empty());
}

#[test]
fn v1_migration_preserves_active_bytes_and_archives_legacy_trash() {
    let root = tempdir().expect("Workspace");
    fs::create_dir(root.path().join("notes")).expect("notes");
    fs::create_dir(root.path().join("backups")).expect("backups");
    let workspace_id = "b7cb56b9-748e-48c8-a23d-0bf5f2d61248";
    let section_id = "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9";
    let active_id = "fef8abcc-7047-4a35-a070-b6d9f0eca026";
    let trash_id = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
    let manifest = json!({"schemaVersion":1,"workspaceId":workspace_id,"revision":7,"sections":[{"id":section_id,"name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":active_id,"sectionId":section_id,"status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":null},{"id":trash_id,"sectionId":section_id,"status":"open","sortKey":1,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":"2026-07-31T12:00:00Z"}]});
    fs::write(
        root.path().join("charon.workspace.json"),
        serde_json::to_vec_pretty(&manifest).expect("manifest"),
    )
    .expect("write manifest");
    let active = b"\xEF\xBB\xBF  active\r\nbody  \n";
    let trashed = b"legacy trash\n";
    fs::write(root.path().join(format!("notes/{active_id}.md")), active).expect("active");
    fs::write(root.path().join(format!("notes/{trash_id}.md")), trashed).expect("trash");
    let mut workspace = Workspace::open(root.path()).expect("migrate");
    let snapshot = workspace.snapshot().expect("snapshot");
    assert_eq!(snapshot.schema_version, 2);
    assert_eq!(snapshot.revision, 7);
    assert_eq!(snapshot.notes.len(), 1);
    assert_eq!(snapshot.notes[0].id, active_id);
    assert_eq!(snapshot.notes[0].body.as_bytes(), active);
    assert!(snapshot.legacy_archive_created);
    assert_eq!(
        fs::read(
            root.path()
                .join(format!("legacy-trash-v1/notes/{trash_id}.md"))
        )
        .expect("archived"),
        trashed
    );
    let archive_manifest = fs::read_to_string(root.path().join("legacy-trash-v1/manifest.json"))
        .expect("archive manifest");
    assert!(!archive_manifest.contains("legacy trash"));
    let before = fs::read(root.path().join("charon.workspace.json")).expect("before");
    drop(workspace);
    let _ = Workspace::open(root.path()).expect("idempotent reopen");
    assert_eq!(
        fs::read(root.path().join("charon.workspace.json")).expect("after"),
        before
    );
}

#[test]
fn v1_migration_removes_verified_completed_legacy_transactions() {
    let root = tempdir().expect("Workspace");
    let workspace_id = "b7cb56b9-748e-48c8-a23d-0bf5f2d61248";
    let section_id = "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9";
    let note_id = "fef8abcc-7047-4a35-a070-b6d9f0eca026";
    let transaction_id = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
    let manifest = json!({"schemaVersion":1,"workspaceId":workspace_id,"revision":41,"sections":[{"id":section_id,"name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":note_id,"sectionId":section_id,"status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":null}]});
    let backup_manifest = json!({"schemaVersion":1,"workspaceId":workspace_id,"revision":37,"sections":[{"id":section_id,"name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":note_id,"sectionId":section_id,"status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":null}]});
    fs::create_dir_all(root.path().join(format!("backups/{transaction_id}/next")))
        .expect("legacy transaction");
    fs::create_dir_all(root.path().join("notes")).expect("notes");
    fs::write(
        root.path().join("charon.workspace.json"),
        serde_json::to_vec_pretty(&manifest).expect("manifest"),
    )
    .expect("write manifest");
    fs::write(
        root.path().join(format!("notes/{note_id}.md")),
        b"byte-exact legacy body\r\n",
    )
    .expect("body");
    fs::write(
        root.path()
            .join(format!("backups/{transaction_id}/next/manifest.json")),
        serde_json::to_vec_pretty(&backup_manifest).expect("backup manifest"),
    )
    .expect("write backup manifest");
    fs::write(
        root.path()
            .join(format!("backups/{transaction_id}/transaction.json")),
        serde_json::to_vec_pretty(&json!({
            "transactionId": transaction_id,
            "createdUnixSeconds": 1,
            "previousRevision": 36,
            "nextRevision": 37,
            "state": "committed"
        }))
        .expect("transaction"),
    )
    .expect("write transaction");

    let mut workspace = Workspace::open(root.path()).expect("recover and migrate");
    let snapshot = workspace.snapshot().expect("snapshot");
    assert_eq!(snapshot.schema_version, 2);
    assert_eq!(snapshot.revision, 41);
    assert_eq!(
        snapshot.notes[0].body.as_bytes(),
        b"byte-exact legacy body\r\n"
    );
    assert!(fs::read_dir(root.path().join("backups"))
        .expect("backups")
        .next()
        .is_none());
}

#[test]
fn every_v1_migration_interruption_converges_on_real_filesystem() {
    for failure in [
        MigrationFailure::BeforeArchiveCreation,
        MigrationFailure::AfterArchiveStaging,
        MigrationFailure::AfterNoteMoves,
        MigrationFailure::AfterManifestCommit,
        MigrationFailure::BeforeCleanup,
    ] {
        let root = tempdir().expect("Workspace");
        let active_id = "fef8abcc-7047-4a35-a070-b6d9f0eca026";
        let trash_id = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
        fs::create_dir(root.path().join("notes")).expect("notes");
        fs::create_dir(root.path().join("backups")).expect("backups");
        let manifest = json!({
            "schemaVersion": 1,
            "workspaceId": "b7cb56b9-748e-48c8-a23d-0bf5f2d61248",
            "revision": 7,
            "sections": [{
                "id": "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9",
                "name": "Inbox",
                "sortKey": 0,
                "createdAt": "2026-07-30T12:00:00Z",
                "updatedAt": "2026-07-30T12:00:00Z"
            }],
            "notes": [
                {
                    "id": active_id,
                    "sectionId": "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9",
                    "status": "open",
                    "sortKey": 0,
                    "createdAt": "2026-07-30T12:00:00Z",
                    "updatedAt": "2026-07-30T12:00:00Z",
                    "completedAt": null,
                    "trashedAt": null
                },
                {
                    "id": trash_id,
                    "sectionId": "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9",
                    "status": "open",
                    "sortKey": 1,
                    "createdAt": "2026-07-30T12:00:00Z",
                    "updatedAt": "2026-07-30T12:00:00Z",
                    "completedAt": null,
                    "trashedAt": "2026-07-31T12:00:00Z"
                }
            ]
        });
        fs::write(
            root.path().join("charon.workspace.json"),
            serde_json::to_vec_pretty(&manifest).expect("manifest"),
        )
        .expect("write manifest");
        fs::write(
            root.path().join(format!("notes/{active_id}.md")),
            b"active\r\n",
        )
        .expect("active");
        fs::write(
            root.path().join(format!("notes/{trash_id}.md")),
            b"trashed\n",
        )
        .expect("trashed");

        assert!(Workspace::open_with_migration_failure(root.path(), failure).is_err());
        let mut recovered = Workspace::open(root.path()).expect("recover and converge");
        let snapshot = recovered.snapshot().expect("snapshot");
        assert_eq!(snapshot.schema_version, 2, "phase {failure:?}");
        assert_eq!(snapshot.notes.len(), 1, "phase {failure:?}");
        assert_eq!(snapshot.notes[0].body.as_bytes(), b"active\r\n");
        assert_eq!(
            fs::read(
                root.path()
                    .join(format!("legacy-trash-v1/notes/{trash_id}.md"))
            )
            .expect("archived trash"),
            b"trashed\n",
            "phase {failure:?}"
        );
        assert!(fs::read_dir(root.path().join("backups"))
            .expect("backups")
            .next()
            .is_none());
    }
}

#[test]
fn migration_collision_stops_before_mutation() {
    let root = tempdir().expect("Workspace");
    fs::create_dir(root.path().join("notes")).expect("notes");
    fs::create_dir(root.path().join("legacy-trash-v1")).expect("collision");
    let manifest = json!({"schemaVersion":1,"workspaceId":"b7cb56b9-748e-48c8-a23d-0bf5f2d61248","revision":0,"sections":[{"id":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":"54ab01eb-ee1c-4c62-999e-147d9c0c8dab","sectionId":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":"2026-07-31T12:00:00Z"}]});
    let original = serde_json::to_vec_pretty(&manifest).expect("manifest");
    fs::write(root.path().join("charon.workspace.json"), &original).expect("write");
    fs::write(
        root.path()
            .join("notes/54ab01eb-ee1c-4c62-999e-147d9c0c8dab.md"),
        "keep",
    )
    .expect("body");
    assert!(matches!(
        Workspace::open(root.path()),
        Err(WorkspaceError::LegacyArchiveCollision)
    ));
    assert_eq!(
        fs::read(root.path().join("charon.workspace.json")).expect("unchanged"),
        original
    );
}

#[test]
fn migration_collision_without_trashed_notes_preserves_the_archive() {
    let root = tempdir().expect("Workspace");
    let note_id = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
    fs::create_dir(root.path().join("notes")).expect("notes");
    fs::create_dir(root.path().join("legacy-trash-v1")).expect("archive");
    fs::write(
        root.path().join("legacy-trash-v1/README.md"),
        "user-owned archive",
    )
    .expect("archive marker");
    let manifest = json!({"schemaVersion":1,"workspaceId":"b7cb56b9-748e-48c8-a23d-0bf5f2d61248","revision":0,"sections":[{"id":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":note_id,"sectionId":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":null}]});
    fs::write(
        root.path().join("charon.workspace.json"),
        serde_json::to_vec_pretty(&manifest).expect("manifest"),
    )
    .expect("write manifest");
    fs::write(root.path().join(format!("notes/{note_id}.md")), "active").expect("body");

    assert!(matches!(
        Workspace::open(root.path()),
        Err(WorkspaceError::LegacyArchiveCollision)
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("legacy-trash-v1/README.md"))
            .expect("preserved archive"),
        "user-owned archive"
    );
}

#[test]
fn migration_rollback_preserves_an_archive_it_did_not_create() {
    let root = tempdir().expect("Workspace");
    let note_id = "54ab01eb-ee1c-4c62-999e-147d9c0c8dab";
    fs::create_dir(root.path().join("notes")).expect("notes");
    fs::create_dir(root.path().join("backups")).expect("backups");
    let manifest = json!({"schemaVersion":1,"workspaceId":"b7cb56b9-748e-48c8-a23d-0bf5f2d61248","revision":0,"sections":[{"id":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","name":"Inbox","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z"}],"notes":[{"id":note_id,"sectionId":"a4ad6d74-ea60-45df-a0ad-2c6f82c271f9","status":"open","sortKey":0,"createdAt":"2026-07-30T12:00:00Z","updatedAt":"2026-07-30T12:00:00Z","completedAt":null,"trashedAt":null}]});
    fs::write(
        root.path().join("charon.workspace.json"),
        serde_json::to_vec_pretty(&manifest).expect("manifest"),
    )
    .expect("write manifest");
    fs::write(root.path().join(format!("notes/{note_id}.md")), "active").expect("body");

    assert!(Workspace::open_with_migration_failure(
        root.path(),
        MigrationFailure::BeforeArchiveCreation
    )
    .is_err());
    fs::write(
        root.path().join("backups/migration-v1-v2/migration.json"),
        "unreadable migration record",
    )
    .expect("corrupt migration record");
    fs::create_dir(root.path().join("legacy-trash-v1")).expect("user archive");
    fs::write(
        root.path().join("legacy-trash-v1/README.md"),
        "created after staging",
    )
    .expect("archive marker");

    assert!(matches!(
        Workspace::open(root.path()),
        Err(WorkspaceError::LegacyArchiveCollision)
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("legacy-trash-v1/README.md"))
            .expect("preserved archive"),
        "created after staging"
    );
}

fn read_tree(root: &std::path::Path) -> Vec<u8> {
    fn visit(path: &std::path::Path, output: &mut Vec<u8>) {
        for entry in fs::read_dir(path).expect("read tree") {
            let path = entry.expect("entry").path();
            if path.is_dir() {
                visit(&path, output);
            } else {
                output.extend(fs::read(path).expect("read file"));
            }
        }
    }
    let mut output = Vec::new();
    visit(root, &mut output);
    output
}

fn tree_paths(root: &std::path::Path) -> Vec<String> {
    fn visit(root: &std::path::Path, path: &std::path::Path, output: &mut Vec<String>) {
        for entry in fs::read_dir(path).expect("read tree") {
            let path = entry.expect("entry").path();
            output.push(
                path.strip_prefix(root)
                    .expect("relative path")
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
            if path.is_dir() {
                visit(root, &path, output);
            }
        }
    }
    let mut output = Vec::new();
    visit(root, root, &mut output);
    output
}

#[test]
#[ignore = "invoked by scripts/check-bindings.ts"]
fn export_bindings() {
    let output = std::env::var_os("CHARON_BINDINGS_OUT").expect("CHARON_BINDINGS_OUT");
    let config = Config::default().with_large_int("number");
    let declarations = [
        NoteStatus::decl(&config),
        AttachmentDto::decl(&config),
        NoteDto::decl(&config),
        WorkspaceSnapshot::decl(&config),
        WorkspaceHealthIssueKind::decl(&config),
        WorkspaceHealthIssue::decl(&config),
        WorkspaceHealth::decl(&config),
        WorkspaceEventOrigin::decl(&config),
        WorkspaceChangedEvent::decl(&config),
        WorkspaceCommand::decl(&config),
        WorkspaceCommandResult::decl(&config),
        WorkspaceIpcError::decl(&config),
    ];
    let mut bindings =
        String::from("// Generated from Rust by `bun run bindings:generate`. Do not edit.\n\n");
    for declaration in declarations {
        bindings.push_str("export ");
        bindings.push_str(&declaration);
        bindings.push_str("\n\n");
    }
    fs::write(Path::new(&output), bindings).expect("write TypeScript bindings");
}
