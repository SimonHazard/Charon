use std::path::Path;

use charon_desktop_lib::preferences::{
    PreferencesIpcError, PreferencesSnapshot, PreferencesUpdate,
};
use ts_rs::{Config, TS};

#[test]
fn preferences_errors_are_content_free() {
    let error = PreferencesIpcError {
        code: "io".to_owned(),
        message_key: "preferences_error_io".to_owned(),
    };
    let json = serde_json::to_string(&error).expect("serialize");
    assert!(!json.contains("/Users/"));
    assert!(!json.contains("selected text"));
}

#[test]
#[ignore = "binding exporter"]
fn export_preferences_bindings() {
    let output = std::env::var_os("CHARON_PREFERENCES_BINDINGS_OUT")
        .expect("CHARON_PREFERENCES_BINDINGS_OUT");
    let config = Config::default();
    let declarations = [
        PreferencesSnapshot::decl(&config),
        PreferencesUpdate::decl(&config),
        PreferencesIpcError::decl(&config),
    ]
    .map(|declaration| format!("export {declaration}"))
    .join("\n\n");
    std::fs::write(Path::new(&output), format!("// Generated from Rust by `bun run bindings:generate`. Do not edit.\n\n{declarations}\n"))
        .expect("write bindings");
}
