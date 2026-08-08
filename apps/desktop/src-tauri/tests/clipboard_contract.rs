use std::fs;
use std::path::Path;

use charon_desktop_lib::clipboard::{
    compose, ClipboardIpcError, ComposeAttachment, ComposeNote, ComposeRequest, ComposedClipboard,
};
use ts_rs::{Config, TS};

fn note(id: &str, body: &str) -> ComposeNote {
    ComposeNote {
        id: id.to_owned(),
        body: body.to_owned(),
        tags: Vec::new(),
        attachments: Vec::new(),
    }
}

#[test]
fn request_serialization_contains_only_revision_and_ordered_ids() {
    let value = serde_json::to_value(ComposeRequest {
        expected_revision: 4,
        note_ids: vec!["b".to_owned(), "a".to_owned()],
    })
    .expect("serialize");
    assert_eq!(
        value,
        serde_json::json!({"expectedRevision":4,"noteIds":["b","a"]})
    );
}

#[test]
fn one_and_many_notes_have_the_canonical_shape() {
    assert_eq!(compose(&[note("one", "Body\n")]).expect("single"), "Body\n");
    assert_eq!(
        compose(&[note("two", "\nSecond\n\n"), note("one", "First")]).expect("many"),
        "## Note 1\n\nSecond\n\n---\n\n## Note 2\n\nFirst"
    );
}

#[test]
fn tags_and_attachments_are_deterministic_and_markdown_safe() {
    let value = ComposeNote {
        id: "note".to_owned(),
        body: "Body".to_owned(),
        tags: vec!["Research".to_owned(), "a``b".to_owned()],
        attachments: vec![
            ComposeAttachment {
                id: "b".to_owned(),
                file_name: "later.txt".to_owned(),
                absolute_path: "/workspace/later.txt".to_owned(),
                created_at: "2026-01-02T00:00:00Z".to_owned(),
            },
            ComposeAttachment {
                id: "a".to_owned(),
                file_name: "first`file.txt".to_owned(),
                absolute_path: "/workspace/first``file.txt".to_owned(),
                created_at: "2026-01-01T00:00:00Z".to_owned(),
            },
        ],
    };
    assert_eq!(compose(&[value]).expect("compose"), "Body\n\n**Tags:** ` Research ` ``` a``b ```\n\n**Attachments:**\n- `` first`file.txt ``: ``` /workspace/first``file.txt ```\n- ` later.txt `: ` /workspace/later.txt `");
}

#[test]
fn invalid_selections_fail_atomically() {
    assert!(compose(&[]).is_err());
    assert!(compose(&[note("same", "one"), note("same", "two")]).is_err());
    assert!(compose(&[note("blank", " \n")]).is_err());
}

#[test]
#[ignore = "invoked by scripts/check-bindings.ts"]
fn export_clipboard_bindings() {
    let output =
        std::env::var_os("CHARON_CLIPBOARD_BINDINGS_OUT").expect("CHARON_CLIPBOARD_BINDINGS_OUT");
    let config = Config::default().with_large_int("number");
    let declarations = [
        ComposeRequest::decl(&config),
        ComposedClipboard::decl(&config),
        ClipboardIpcError::decl(&config),
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
