use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use charon_desktop_lib::workspace::{
    NoteDto, NoteStatus, SectionDto, Workspace, WorkspaceChangedEvent, WorkspaceCommand,
    WorkspaceCommandResult, WorkspaceHealth, WorkspaceHealthIssue, WorkspaceHealthIssueKind,
    WorkspaceIpcError, WorkspaceSnapshot,
};
use ts_rs::{Config, TS};

fn exercise_contract(mut workspace: Workspace) {
    let initial = workspace.snapshot().expect("initial snapshot");
    assert_eq!(initial.schema_version, 1);
    assert_eq!(initial.sections.len(), 1);
    let section_id = initial.sections[0].id.clone();

    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: initial.revision,
            section_id: section_id.clone(),
            body: "portable **Markdown**".to_owned(),
            sort_key: 10,
        })
        .expect("create note");
    let note_id = created.snapshot.notes[0].id.clone();
    assert_eq!(created.snapshot.notes[0].body, "portable **Markdown**");

    let completed = workspace
        .execute(WorkspaceCommand::BatchSetStatus {
            expected_revision: created.snapshot.revision,
            note_ids: vec![note_id.clone()],
            status: NoteStatus::Done,
        })
        .expect("complete note");
    assert_eq!(completed.snapshot.notes[0].status, NoteStatus::Done);
    assert!(completed.snapshot.notes[0].completed_at.is_some());

    let trashed = workspace
        .execute(WorkspaceCommand::BatchTrash {
            expected_revision: completed.snapshot.revision,
            note_ids: vec![note_id],
        })
        .expect("trash note");
    assert!(trashed.snapshot.notes[0].trashed_at.is_some());

    let restored = workspace
        .execute(WorkspaceCommand::Undo {
            expected_revision: trashed.snapshot.revision,
            transaction_id: trashed.undo_token.expect("undo token"),
        })
        .expect("undo trash");
    assert!(restored.snapshot.notes[0].trashed_at.is_none());
    assert_eq!(restored.snapshot.revision, 4);

    let stale = workspace.execute(WorkspaceCommand::RenameSection {
        expected_revision: 0,
        section_id,
        name: "Stale".to_owned(),
    });
    assert!(matches!(
        stale,
        Err(charon_desktop_lib::workspace::WorkspaceError::StaleRevision { .. })
    ));
}

#[test]
fn workspace_same_command_contract_runs_against_memory_and_real_storage() {
    exercise_contract(Workspace::in_memory("Inbox".to_owned()).expect("memory Workspace"));
    let root = tempfile::tempdir().expect("real Workspace directory");
    exercise_contract(Workspace::create(root.path(), "Inbox".to_owned()).expect("real Workspace"));
}

#[test]
fn workspace_all_command_variants_preserve_domain_invariants() {
    let mut workspace = Workspace::in_memory("Inbox".to_owned()).expect("memory Workspace");
    let initial = workspace.snapshot().expect("initial snapshot");
    let first_section = initial.sections[0].id.clone();

    let created_section = workspace
        .execute(WorkspaceCommand::CreateSection {
            expected_revision: initial.revision,
            name: "Second".to_owned(),
            sort_key: 10,
        })
        .expect("create section");
    let second_section = created_section
        .snapshot
        .sections
        .iter()
        .find(|section| section.id != first_section)
        .expect("second section")
        .id
        .clone();
    let renamed = workspace
        .execute(WorkspaceCommand::RenameSection {
            expected_revision: created_section.snapshot.revision,
            section_id: second_section.clone(),
            name: "Renamed".to_owned(),
        })
        .expect("rename section");
    let reordered_section = workspace
        .execute(WorkspaceCommand::ReorderSection {
            expected_revision: renamed.snapshot.revision,
            section_id: second_section.clone(),
            sort_key: -10,
        })
        .expect("reorder section");

    let created_first = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: reordered_section.snapshot.revision,
            section_id: first_section.clone(),
            body: "first".to_owned(),
            sort_key: 0,
        })
        .expect("create first note");
    let first_note = created_first.snapshot.notes[0].id.clone();
    let updated = workspace
        .execute(WorkspaceCommand::UpdateNote {
            expected_revision: created_first.snapshot.revision,
            note_id: first_note.clone(),
            body: "first updated".to_owned(),
        })
        .expect("update note");
    let moved = workspace
        .execute(WorkspaceCommand::MoveNote {
            expected_revision: updated.snapshot.revision,
            note_id: first_note.clone(),
            section_id: second_section.clone(),
            sort_key: 5,
        })
        .expect("move note");
    let reordered_note = workspace
        .execute(WorkspaceCommand::ReorderNote {
            expected_revision: moved.snapshot.revision,
            note_id: first_note.clone(),
            sort_key: -5,
        })
        .expect("reorder note");
    let completed = workspace
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: reordered_note.snapshot.revision,
            note_id: first_note.clone(),
            status: NoteStatus::Done,
        })
        .expect("set note status");
    let trashed = workspace
        .execute(WorkspaceCommand::TrashNote {
            expected_revision: completed.snapshot.revision,
            note_id: first_note.clone(),
        })
        .expect("trash note");
    let restored = workspace
        .execute(WorkspaceCommand::RestoreNote {
            expected_revision: trashed.snapshot.revision,
            note_id: first_note.clone(),
        })
        .expect("restore note");

    let created_second = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: restored.snapshot.revision,
            section_id: first_section.clone(),
            body: "second".to_owned(),
            sort_key: 1,
        })
        .expect("create second note");
    let second_note = created_second
        .snapshot
        .notes
        .iter()
        .find(|note| note.id != first_note)
        .expect("second note")
        .id
        .clone();
    let batch_moved = workspace
        .execute(WorkspaceCommand::BatchMove {
            expected_revision: created_second.snapshot.revision,
            note_ids: vec![first_note.clone(), second_note.clone()],
            destination_section_id: first_section.clone(),
        })
        .expect("batch move");
    let batch_completed = workspace
        .execute(WorkspaceCommand::BatchSetStatus {
            expected_revision: batch_moved.snapshot.revision,
            note_ids: vec![first_note.clone(), second_note.clone()],
            status: NoteStatus::Done,
        })
        .expect("batch complete");
    let batch_trashed = workspace
        .execute(WorkspaceCommand::BatchTrash {
            expected_revision: batch_completed.snapshot.revision,
            note_ids: vec![first_note.clone(), second_note.clone()],
        })
        .expect("batch trash");
    let batch_restored = workspace
        .execute(WorkspaceCommand::BatchRestore {
            expected_revision: batch_trashed.snapshot.revision,
            note_ids: vec![first_note.clone(), second_note.clone()],
        })
        .expect("batch restore");
    let merged = workspace
        .execute(WorkspaceCommand::MergeNotes {
            expected_revision: batch_restored.snapshot.revision,
            note_ids: vec![first_note.clone(), second_note.clone()],
            destination_section_id: first_section,
            sort_key: 0,
        })
        .expect("merge notes");
    let composite = merged
        .snapshot
        .notes
        .iter()
        .find(|note| note.id != first_note && note.id != second_note)
        .expect("composite note");
    assert_eq!(composite.body, "first updated\n\n---\n\nsecond");
    assert_eq!(composite.status, NoteStatus::Open);

    let deleted_first = workspace
        .execute(WorkspaceCommand::PermanentlyDeleteNote {
            expected_revision: merged.snapshot.revision,
            note_id: first_note,
        })
        .expect("permanently delete first source");
    assert!(deleted_first.undo_token.is_none());
    let deleted_second = workspace
        .execute(WorkspaceCommand::PermanentlyDeleteNote {
            expected_revision: deleted_first.snapshot.revision,
            note_id: second_note,
        })
        .expect("permanently delete second source");
    let deleted_section = workspace
        .execute(WorkspaceCommand::DeleteSection {
            expected_revision: deleted_second.snapshot.revision,
            section_id: second_section,
        })
        .expect("delete empty section");
    assert_eq!(deleted_section.snapshot.sections.len(), 1);
    assert_eq!(deleted_section.snapshot.notes.len(), 1);
}

#[test]
fn workspace_real_storage_is_human_readable_and_reopens() {
    let root = tempfile::tempdir().expect("Workspace directory");
    let mut workspace =
        Workspace::create(root.path(), "Inbox".to_owned()).expect("create Workspace");
    let initial = workspace.snapshot().expect("snapshot");
    workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: initial.revision,
            section_id: initial.sections[0].id.clone(),
            body: "# Ordinary Markdown\n".to_owned(),
            sort_key: 0,
        })
        .expect("create note");
    drop(workspace);

    let manifest =
        fs::read_to_string(root.path().join("charon.workspace.json")).expect("readable manifest");
    assert!(manifest.contains("\"schemaVersion\": 1"));
    assert!(!manifest.contains("Ordinary Markdown"));
    let note_files = fs::read_dir(root.path().join("notes"))
        .expect("notes directory")
        .collect::<Result<Vec<_>, _>>()
        .expect("note entries");
    assert_eq!(note_files.len(), 1);
    assert_eq!(
        fs::read_to_string(note_files[0].path()).expect("Markdown body"),
        "# Ordinary Markdown\n"
    );
    assert_eq!(
        Workspace::open(root.path())
            .expect("reopen Workspace")
            .snapshot()
            .expect("reopened snapshot")
            .notes
            .len(),
        1
    );
}

#[test]
fn workspace_rejects_an_unsupported_schema_without_mutating_files() {
    let root = tempfile::tempdir().expect("Workspace directory");
    drop(Workspace::create(root.path(), "Inbox".to_owned()).expect("create Workspace"));
    let path = root.path().join("charon.workspace.json");
    let original = fs::read_to_string(&path).expect("manifest");
    let unsupported = original.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
    fs::write(&path, &unsupported).expect("external schema edit");
    let result = Workspace::open(root.path());
    assert!(matches!(
        result,
        Err(charon_desktop_lib::workspace::WorkspaceError::UnsupportedSchema(2))
    ));
    assert_eq!(
        fs::read_to_string(path).expect("preserved manifest"),
        unsupported
    );
}

#[test]
fn workspace_reports_unknown_markdown_as_an_import_candidate() {
    let root = tempfile::tempdir().expect("Workspace directory");
    drop(Workspace::create(root.path(), "Inbox".to_owned()).expect("create Workspace"));
    fs::write(root.path().join("notes/external.md"), "external").expect("unknown Markdown file");
    let mut workspace = Workspace::open(root.path()).expect("open Workspace");
    let health = workspace.health().expect("Workspace health");
    assert!(!health.is_healthy);
    assert!(health
        .issues
        .iter()
        .any(|issue| issue.kind == WorkspaceHealthIssueKind::ImportCandidate));
    assert!(workspace
        .snapshot()
        .expect("valid snapshot")
        .notes
        .is_empty());
}

#[test]
fn workspace_watcher_reconciles_one_external_body_burst_and_ignores_self_writes() {
    let root = tempfile::tempdir().expect("Workspace directory");
    let mut workspace =
        Workspace::create(root.path(), "Inbox".to_owned()).expect("create Workspace");
    workspace.start_watching().expect("start watcher");
    let initial = workspace.snapshot().expect("initial snapshot");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: initial.revision,
            section_id: initial.sections[0].id.clone(),
            body: "initial".to_owned(),
            sort_key: 0,
        })
        .expect("create note");
    workspace.take_events();

    // Polling sees the module's own final paths, but identical content must not
    // produce another domain revision.
    let settle_deadline = Instant::now() + Duration::from_millis(300);
    while Instant::now() < settle_deadline {
        assert_eq!(
            workspace.snapshot().expect("self-write snapshot").revision,
            created.snapshot.revision
        );
        thread::sleep(Duration::from_millis(20));
    }
    assert!(workspace.take_events().is_empty());

    let note_path = root
        .path()
        .join(format!("notes/{}.md", created.snapshot.notes[0].id));
    fs::write(&note_path, "external one").expect("first external edit");
    fs::write(&note_path, "external final").expect("second external edit");
    wait_until(Duration::from_secs(2), || {
        workspace
            .snapshot()
            .map(|snapshot| snapshot.notes[0].body == "external final")
            .unwrap_or(false)
    });
    let snapshot = workspace.snapshot().expect("reconciled snapshot");
    assert_eq!(snapshot.revision, created.snapshot.revision + 1);
    assert_eq!(workspace.take_events().len(), 1);

    fs::remove_file(note_path).expect("external deletion");
    wait_until(Duration::from_secs(2), || {
        workspace
            .health()
            .map(|health| !health.is_healthy)
            .unwrap_or(false)
    });
    assert_eq!(
        workspace.snapshot().expect("last valid snapshot").notes[0].body,
        "external final"
    );
    workspace.stop_watching();
}

#[test]
fn workspace_watcher_preserves_last_valid_state_for_an_invalid_manifest() {
    let root = tempfile::tempdir().expect("Workspace directory");
    let mut workspace =
        Workspace::create(root.path(), "Inbox".to_owned()).expect("create Workspace");
    workspace.start_watching().expect("start watcher");
    let valid = workspace.snapshot().expect("valid snapshot");
    fs::write(root.path().join("charon.workspace.json"), b"{")
        .expect("corrupt manifest externally");
    wait_until(Duration::from_secs(2), || {
        workspace
            .health()
            .map(|health| {
                health
                    .issues
                    .iter()
                    .any(|issue| issue.kind == WorkspaceHealthIssueKind::InvalidManifest)
            })
            .unwrap_or(false)
    });
    assert_eq!(workspace.snapshot().expect("last valid snapshot"), valid);
    assert_eq!(
        fs::read_to_string(root.path().join("charon.workspace.json"))
            .expect("corrupt manifest remains available for recovery"),
        "{"
    );
    workspace.stop_watching();
}

fn wait_until(timeout: Duration, mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + timeout;
    while !condition() {
        assert!(Instant::now() < deadline, "bounded watcher poll timed out");
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn workspace_ipc_tagged_union_serialization_is_stable() {
    let command = WorkspaceCommand::BatchTrash {
        expected_revision: 7,
        note_ids: vec!["fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned()],
    };
    assert_eq!(
        serde_json::to_value(command).expect("serialize command"),
        serde_json::json!({
            "type": "batchTrash",
            "expectedRevision": 7,
            "noteIds": ["fef8abcc-7047-4a35-a070-b6d9f0eca026"]
        })
    );
}

#[test]
#[ignore = "invoked by scripts/check-bindings.ts"]
fn export_bindings() {
    let output = std::env::var_os("CHARON_BINDINGS_OUT").expect("CHARON_BINDINGS_OUT");
    let config = Config::default().with_large_int("number");
    let declarations = [
        NoteStatus::decl(&config),
        SectionDto::decl(&config),
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
