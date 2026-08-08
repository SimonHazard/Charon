use std::fs;
use std::path::Path;

use charon_desktop_lib::workspace::{
    AttachmentDto, NoteDto, NoteStatus, Workspace, WorkspaceChangedEvent, WorkspaceCommand,
    WorkspaceCommandResult, WorkspaceError, WorkspaceHealth, WorkspaceHealthIssue,
    WorkspaceHealthIssueKind, WorkspaceIpcError, WorkspaceSnapshot,
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
            note_ids: vec![id.clone()],
            status: NoteStatus::Done,
        })
        .expect("done");
    assert!(done.snapshot.notes[0].completed_at.is_some());
    let reopened = workspace
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: done.snapshot.revision,
            note_ids: vec![id.clone()],
            status: NoteStatus::Open,
        })
        .expect("reopen");
    assert!(reopened.snapshot.notes[0].completed_at.is_none());
    let deleted = workspace
        .execute(WorkspaceCommand::DeleteNotes {
            expected_revision: reopened.snapshot.revision,
            note_ids: vec![id],
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
        source_paths: vec![
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
            source_paths: vec![inside.to_string_lossy().into_owned()]
        })
        .is_err());
    assert!(workspace
        .execute(WorkspaceCommand::ImportNoteAttachments {
            expected_revision: 1,
            note_id,
            source_paths: vec![source_root.path().to_string_lossy().into_owned()]
        })
        .is_err());
    assert_eq!(workspace.snapshot().expect("still unchanged").revision, 1);
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
            source_paths: vec![link.to_string_lossy().into_owned()]
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
            source_paths: vec![source],
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
