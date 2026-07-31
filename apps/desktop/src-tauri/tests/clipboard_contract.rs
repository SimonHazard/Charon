use std::fs;
use std::path::Path;

use charon_desktop_lib::clipboard::{
    compose, ClipboardIpcError, ComposeNote, ComposeOptions, ComposeRequest, ComposedClipboard,
    CopyPreset,
};
use ts_rs::{Config, TS};

fn request(preset: CopyPreset) -> ComposeRequest {
    ComposeRequest {
        notes: vec![
            ComposeNote {
                id: "first".to_owned(),
                section_name: "Inbox".to_owned(),
                body: "First\r\nline".to_owned(),
                selection_order: 0,
            },
            ComposeNote {
                id: "second".to_owned(),
                section_name: "Later".to_owned(),
                body: "Deuxième 🍎".to_owned(),
                selection_order: 1,
            },
        ],
        preset,
        options: ComposeOptions::default(),
    }
}

#[test]
fn clipboard_contract_serialization_uses_stable_preset_names() {
    assert_eq!(
        serde_json::to_value(CopyPreset::TaskList).expect("serialize preset"),
        serde_json::json!("task-list")
    );
    assert_eq!(
        serde_json::to_value(request(CopyPreset::Sectioned)).expect("serialize request")["notes"]
            [0]["selectionOrder"],
        0
    );
}

#[test]
fn clipboard_contract_all_presets_are_deterministic() {
    let fixtures = [
        (CopyPreset::Plain, "First\nline\n\nDeuxième 🍎"),
        (CopyPreset::Bulleted, "- First\n  line\n- Deuxième 🍎"),
        (CopyPreset::Numbered, "1. First\n   line\n2. Deuxième 🍎"),
        (
            CopyPreset::TaskList,
            "- [ ] First\n      line\n- [ ] Deuxième 🍎",
        ),
        (
            CopyPreset::Sectioned,
            "## Inbox\n\nFirst\nline\n\n## Later\n\nDeuxième 🍎",
        ),
    ];

    for (preset, expected) in fixtures {
        assert_eq!(
            compose(&request(preset)).expect("compose").markdown,
            expected
        );
    }
}

#[test]
#[ignore = "invoked by scripts/check-bindings.ts"]
fn export_clipboard_bindings() {
    let output =
        std::env::var_os("CHARON_CLIPBOARD_BINDINGS_OUT").expect("CHARON_CLIPBOARD_BINDINGS_OUT");
    let config = Config::default().with_large_int("number");
    let declarations = [
        CopyPreset::decl(&config),
        ComposeNote::decl(&config),
        ComposeOptions::decl(&config),
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
