use std::path::Path;

use charon_desktop_lib::preferences::{
    PreferencesIpcError, PreferencesSnapshot, PreferencesUpdate,
};
use ts_rs::{Config, TS};

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
