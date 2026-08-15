use std::fs;
use std::path::Path;

use charon_desktop_lib::clipboard::{
    compose, ClipboardIpcError, ComposeAttachment, ComposeNote, ComposeRequest, ComposedClipboard,
};
use ts_rs::{Config, TS};

fn note(body: &str) -> ComposeNote {
    ComposeNote {
        body: body.to_owned(),
        tags: Vec::new(),
        attachments: Vec::new(),
    }
}

#[test]
fn request_serialization_contains_only_revision_and_note_id() {
    let value = serde_json::to_value(ComposeRequest {
        expected_revision: 4,
        note_id: "a".to_owned(),
    })
    .expect("serialize");
    assert_eq!(
        value,
        serde_json::json!({"expectedRevision":4,"noteId":"a"})
    );
}

#[test]
fn one_note_preserves_the_canonical_body_shape() {
    assert_eq!(compose(&note("Body\n")).expect("single"), "Body\n");
}

#[test]
fn tags_and_attachments_are_deterministic_and_markdown_safe() {
    let value = ComposeNote {
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
    assert_eq!(compose(&value).expect("compose"), "Body\n\n**Tags:** ` Research ` ``` a``b ```\n\n**Attachments:**\n- `` first`file.txt ``: ``` /workspace/first``file.txt ```\n- ` later.txt `: ` /workspace/later.txt `");
}

#[test]
fn an_empty_note_fails_before_clipboard_write() {
    assert!(compose(&note(" \n")).is_err());
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
