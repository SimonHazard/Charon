use std::fs;
use std::thread;
use std::time::{Duration, Instant};

use charon_desktop_lib::workspace::{
    NoteStatus, StorageFailure, Workspace, WorkspaceCommand, WorkspaceError, WorkspaceEventOrigin,
    WorkspaceHealthIssueKind,
};
use tempfile::tempdir;

fn wait_until(mut condition: impl FnMut() -> bool, label: &str) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if condition() {
            return;
        }
        thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {label}");
}

fn watched_workspace() -> (tempfile::TempDir, Workspace, String) {
    let root = tempdir().expect("Workspace root");
    let mut workspace = Workspace::create(root.path()).expect("create Workspace");
    let created = workspace
        .execute(WorkspaceCommand::CreateNote {
            expected_revision: 0,
            body: "initial".to_owned(),
        })
        .expect("create note");
    let id = created.snapshot.notes[0].id.clone();
    workspace.take_events();
    workspace.start_watching().expect("start watcher");
    (root, workspace, id)
}

#[test]
fn command_writes_are_not_reconciled_as_external_changes() {
    let (_root, mut workspace, note_id) = watched_workspace();
    let changed = workspace
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: 1,
            note_id,
            status: NoteStatus::Done,
        })
        .expect("status command");
    thread::sleep(Duration::from_millis(250));
    assert_eq!(
        workspace.snapshot().expect("snapshot").revision,
        changed.snapshot.revision
    );
}

#[test]
fn external_body_edit_advances_once_and_queues_one_event() {
    let (root, mut workspace, note_id) = watched_workspace();
    fs::write(root.path().join(format!("notes/{note_id}.md")), "external").expect("edit");
    wait_until(
        || {
            workspace
                .snapshot()
                .is_ok_and(|snapshot| snapshot.revision == 2)
        },
        "external body reconciliation",
    );
    assert_eq!(workspace.snapshot().expect("stable snapshot").revision, 2);
    let events = workspace.take_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].revision, 2);
}

#[test]
fn stray_note_is_reported_without_adoption() {
    let (root, mut workspace, _note_id) = watched_workspace();
    fs::write(root.path().join("notes/x.md"), "stray").expect("stray");
    wait_until(
        || {
            workspace.health().is_ok_and(|health| {
                health
                    .issues
                    .iter()
                    .any(|issue| issue.kind == WorkspaceHealthIssueKind::ImportCandidate)
            })
        },
        "import candidate health issue",
    );
    assert_eq!(workspace.snapshot().expect("snapshot").notes.len(), 1);
}

#[test]
fn missing_known_body_is_reported_and_last_snapshot_survives() {
    let (root, mut workspace, note_id) = watched_workspace();
    fs::remove_file(root.path().join(format!("notes/{note_id}.md"))).expect("remove body");
    wait_until(
        || {
            workspace.health().is_ok_and(|health| {
                health
                    .issues
                    .iter()
                    .any(|issue| issue.kind == WorkspaceHealthIssueKind::MissingNote)
            })
        },
        "missing note health issue",
    );
    let snapshot = workspace.snapshot().expect("last valid snapshot");
    assert_eq!(snapshot.revision, 1);
    assert_eq!(snapshot.notes[0].body, "initial");
}

#[test]
fn external_edit_makes_an_in_flight_revision_stale() {
    let (root, mut workspace, note_id) = watched_workspace();
    fs::write(root.path().join(format!("notes/{note_id}.md")), "external").expect("edit");
    thread::sleep(Duration::from_millis(250));
    assert!(matches!(
        workspace.execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: 1,
            note_id,
            status: NoteStatus::Done,
        }),
        Err(WorkspaceError::StaleRevision {
            expected: 1,
            actual: 2
        })
    ));
    let events = workspace.take_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].origin, WorkspaceEventOrigin::External);
}

#[test]
fn status_toggle_stages_only_two_manifests_and_the_record() {
    let root = tempdir().expect("Workspace root");
    let sources = tempdir().expect("sources");
    let mut workspace = Workspace::create(root.path()).expect("create Workspace");
    let mut revision = 0;
    let mut note_ids = Vec::new();
    for index in 0..3 {
        let created = workspace
            .execute(WorkspaceCommand::CreateNote {
                expected_revision: revision,
                body: format!("note {index}"),
            })
            .expect("create note");
        revision = created.snapshot.revision;
        note_ids.push(created.snapshot.notes[index].id.clone());
    }
    for (index, note_id) in note_ids.iter().take(2).enumerate() {
        let source = sources.path().join(format!("source-{index}.txt"));
        fs::write(&source, format!("attachment {index}")).expect("source");
        let imported = workspace
            .execute(WorkspaceCommand::ImportNoteAttachments {
                expected_revision: revision,
                note_id: note_id.clone(),
                source_tokens: vec![source.to_string_lossy().into_owned()],
            })
            .expect("import");
        revision = imported.snapshot.revision;
    }
    drop(workspace);

    let mut failing = Workspace::open_with_storage_failure(root.path(), StorageFailure::Manifest)
        .expect("open failing Workspace");
    assert!(failing
        .execute(WorkspaceCommand::SetNoteStatus {
            expected_revision: revision,
            note_id: note_ids[0].clone(),
            status: NoteStatus::Done,
        })
        .is_err());
    let transaction = fs::read_dir(root.path().join("backups"))
        .expect("backups")
        .next()
        .expect("staged transaction")
        .expect("entry")
        .path();
    assert_eq!(count_files(&transaction), 3);
}

fn count_files(path: &std::path::Path) -> usize {
    fs::read_dir(path)
        .expect("read tree")
        .map(|entry| entry.expect("entry").path())
        .map(|path| if path.is_dir() { count_files(&path) } else { 1 })
        .sum()
}
