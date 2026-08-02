use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use charon_desktop_lib::capture::{
    CapabilityState, CaptureAction, CaptureCapabilities, CaptureCoordinator, CaptureEditorRequest,
    CaptureError, CaptureIpcError, CapturePermissionKind, CaptureStatusEvent, CaptureTrigger,
    PlatformCapturePort, PlatformKind, ShortcutPort, DEFAULT_CAPTURE_SHORTCUT,
};
use ts_rs::{Config, TS};

#[derive(Default)]
struct ShortcutState {
    active: HashSet<String>,
    fail_for: HashSet<String>,
    operations: Vec<String>,
}

struct FakeShortcut(Arc<Mutex<ShortcutState>>);

impl ShortcutPort for FakeShortcut {
    fn register(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        let mut state = self.0.lock().expect("shortcut state");
        state.operations.push(format!("register:{shortcut}"));
        if state.fail_for.contains(shortcut) {
            return Err(CaptureError::ShortcutRegistration);
        }
        state.active.insert(shortcut.to_owned());
        Ok(())
    }

    fn unregister(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        let mut state = self.0.lock().expect("shortcut state");
        state.operations.push(format!("unregister:{shortcut}"));
        state.active.remove(shortcut);
        Ok(())
    }
}

struct FakePlatformState {
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Result<Option<String>, CaptureError>,
    grant_input_on_request: bool,
    grant_accessibility_on_request: bool,
    starts: usize,
    reads: usize,
    resets: usize,
    shutdowns: usize,
}

struct FakePlatform(Arc<Mutex<FakePlatformState>>);

impl PlatformCapturePort for FakePlatform {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn input_monitoring_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").double_shift
    }

    fn accessibility_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").selected_text
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        self.0.lock().expect("platform state").starts += 1;
        Ok(())
    }

    fn request_permission(
        &mut self,
        permission: CapturePermissionKind,
    ) -> Result<(), CaptureError> {
        let mut state = self.0.lock().expect("platform state");
        match permission {
            CapturePermissionKind::InputMonitoring if state.grant_input_on_request => {
                state.double_shift = CapabilityState::Available;
            }
            CapturePermissionKind::Accessibility if state.grant_accessibility_on_request => {
                state.selected_text = CapabilityState::Available;
            }
            _ => {}
        }
        Ok(())
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        let mut state = self.0.lock().expect("platform state");
        state.reads += 1;
        match &state.selected {
            Ok(value) => Ok(value.clone()),
            Err(CaptureError::PermissionDenied) => Err(CaptureError::PermissionDenied),
            Err(_) => Err(CaptureError::SelectionFailed),
        }
    }

    fn reset_gesture(&mut self) {
        self.0.lock().expect("platform state").resets += 1;
    }

    fn shutdown(&mut self) {
        self.0.lock().expect("platform state").shutdowns += 1;
    }
}

type CoordinatorFixture = (
    CaptureCoordinator,
    Arc<Mutex<ShortcutState>>,
    Arc<Mutex<FakePlatformState>>,
);

fn coordinator(
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Result<Option<&str>, CaptureError>,
) -> CoordinatorFixture {
    let shortcuts = Arc::new(Mutex::new(ShortcutState::default()));
    let selected = selected.map(|value| value.map(str::to_owned));
    let platform = Arc::new(Mutex::new(FakePlatformState {
        double_shift,
        selected_text,
        selected,
        grant_input_on_request: false,
        grant_accessibility_on_request: false,
        starts: 0,
        reads: 0,
        resets: 0,
        shutdowns: 0,
    }));
    let mut coordinator = CaptureCoordinator::new(
        Box::new(FakeShortcut(Arc::clone(&shortcuts))),
        Box::new(FakePlatform(Arc::clone(&platform))),
    );
    coordinator.initialize();
    (coordinator, shortcuts, platform)
}

#[test]
fn capture_selection_returns_exact_non_empty_body() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(Some("  private draft\n")),
    );
    let action = coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .expect("available capture");
    match action {
        Some(CaptureAction::CreateNote { body }) => assert_eq!(body, "  private draft\n"),
        _ => panic!("expected one note action"),
    }
    assert_eq!(platform.lock().expect("platform").reads, 1);
}

#[test]
fn empty_denied_and_unsupported_selection_are_no_ops() {
    for selected in [Ok(None), Ok(Some("")), Ok(Some(" \n\t "))] {
        let (mut coordinator, _, _) = coordinator(
            CapabilityState::Available,
            CapabilityState::Available,
            selected,
        );
        assert!(coordinator
            .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
            .expect("capture")
            .is_none());
    }

    for status in [CapabilityState::Denied, CapabilityState::Unsupported] {
        let (mut coordinator, _, platform) = coordinator(status, status, Ok(Some("ignored")));
        assert!(coordinator
            .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
            .expect("capture")
            .is_none());
        assert_eq!(platform.lock().expect("platform").reads, 0);
    }

    let (mut coordinator, _, _) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Err(CaptureError::PermissionDenied),
    );
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .expect("denied capture")
        .is_none());
    assert_eq!(
        coordinator.capabilities().selected_text,
        CapabilityState::Denied
    );
}

#[test]
fn editor_sources_never_read_selected_text() {
    for (index, source) in [
        CaptureTrigger::StandardShortcut,
        CaptureTrigger::CommandDoubleShift,
        CaptureTrigger::InApp,
    ]
    .into_iter()
    .enumerate()
    {
        let (mut coordinator, _, platform) = coordinator(
            CapabilityState::Available,
            CapabilityState::Available,
            Ok(Some("must not be read")),
        );
        let action = coordinator
            .trigger(source, 1_000 + index as u64 * 200)
            .expect("editor action");
        assert!(matches!(action, Some(CaptureAction::OpenEditor { .. })));
        assert_eq!(platform.lock().expect("platform").reads, 0);
    }
}

#[test]
fn enhanced_triggers_fail_closed_without_input_monitoring() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Denied,
        CapabilityState::Available,
        Ok(Some("must not be read")),
    );
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .expect("denied selection gesture")
        .is_none());
    assert!(coordinator
        .trigger(CaptureTrigger::CommandDoubleShift, 1_010)
        .expect("denied editor gesture")
        .is_none());
    assert!(matches!(
        coordinator
            .trigger(CaptureTrigger::StandardShortcut, 1_020)
            .expect("portable fallback"),
        Some(CaptureAction::OpenEditor { .. })
    ));
    assert_eq!(platform.lock().expect("platform").reads, 0);
}

#[test]
fn registration_conflict_restores_one_previous_shortcut() {
    let (mut coordinator, shortcuts, _) = coordinator(
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        Ok(None),
    );
    shortcuts
        .lock()
        .expect("shortcut state")
        .fail_for
        .insert("CmdOrCtrl+Alt+Space".to_owned());

    assert!(matches!(
        coordinator.set_shortcut("CmdOrCtrl+Alt+Space"),
        Err(CaptureError::ShortcutRegistration)
    ));
    let state = shortcuts.lock().expect("shortcut state");
    assert_eq!(state.active.len(), 1);
    assert!(state.active.contains(DEFAULT_CAPTURE_SHORTCUT));
    assert_eq!(
        state.operations,
        [
            format!("register:{DEFAULT_CAPTURE_SHORTCUT}"),
            format!("unregister:{DEFAULT_CAPTURE_SHORTCUT}"),
            "register:CmdOrCtrl+Alt+Space".to_owned(),
            format!("register:{DEFAULT_CAPTURE_SHORTCUT}"),
        ]
    );
}

#[test]
fn overlapping_sources_are_deduplicated_without_an_extra_action() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(Some("one")),
    );
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .expect("first")
        .is_some());
    assert!(coordinator
        .trigger(CaptureTrigger::StandardShortcut, 1_040)
        .expect("duplicate")
        .is_none());
    assert!(coordinator
        .trigger(CaptureTrigger::CommandDoubleShift, 1_200)
        .expect("later trigger")
        .is_some());
    assert_eq!(platform.lock().expect("platform").resets, 1);
}

#[test]
fn permission_retry_starts_listener_once() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Denied,
        CapabilityState::Denied,
        Ok(Some("selection")),
    );
    platform.lock().expect("platform").grant_input_on_request = true;
    let capabilities = coordinator
        .request_permission(CapturePermissionKind::InputMonitoring)
        .expect("input monitoring retry");
    assert_eq!(capabilities.double_shift, CapabilityState::Available);
    assert_eq!(capabilities.input_monitoring, CapabilityState::Available);
    assert_eq!(capabilities.selected_text, CapabilityState::Denied);
    assert_eq!(capabilities.accessibility, CapabilityState::Denied);
    assert_eq!(platform.lock().expect("platform").starts, 1);

    platform
        .lock()
        .expect("platform")
        .grant_accessibility_on_request = true;
    let capabilities = coordinator
        .request_permission(CapturePermissionKind::Accessibility)
        .expect("accessibility retry");
    assert_eq!(capabilities.selected_text, CapabilityState::Available);
    assert_eq!(capabilities.accessibility, CapabilityState::Available);
    assert_eq!(platform.lock().expect("platform").starts, 1);
}

#[test]
fn shutdown_is_idempotent_and_unregisters_everything() {
    let (mut coordinator, shortcuts, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(None),
    );
    coordinator.shutdown();
    coordinator.shutdown();
    assert!(matches!(
        coordinator.trigger(CaptureTrigger::InApp, 1),
        Err(CaptureError::Shutdown)
    ));
    assert!(shortcuts.lock().expect("shortcut").active.is_empty());
    assert_eq!(platform.lock().expect("platform").shutdowns, 1);
}

#[test]
fn capture_errors_never_contain_selected_content() {
    let content = "do not log this selected text";
    for error in [
        CaptureError::PermissionDenied,
        CaptureError::SelectionFailed,
        CaptureError::MainEditorUnavailable,
    ] {
        assert!(!error.to_string().contains(content));
    }
}

#[test]
fn capture_contract_serialization_has_stable_names() {
    let capabilities = CaptureCapabilities {
        platform: PlatformKind::LinuxWayland,
        standard_shortcut: CapabilityState::Available,
        input_monitoring: CapabilityState::Unsupported,
        accessibility: CapabilityState::Unsupported,
        double_shift: CapabilityState::Unsupported,
        selected_text: CapabilityState::Denied,
        active_shortcut: DEFAULT_CAPTURE_SHORTCUT.to_owned(),
    };
    assert_eq!(
        serde_json::to_value(capabilities).expect("serialize capabilities"),
        serde_json::json!({
            "platform": "linuxWayland",
            "standardShortcut": "available",
            "inputMonitoring": "unsupported",
            "accessibility": "unsupported",
            "doubleShift": "unsupported",
            "selectedText": "denied",
            "activeShortcut": DEFAULT_CAPTURE_SHORTCUT,
        })
    );
    assert_eq!(
        serde_json::to_value(CaptureEditorRequest { request_id: 7 })
            .expect("serialize editor request"),
        serde_json::json!({ "requestId": 7 })
    );
}

#[test]
#[ignore = "invoked by scripts/check-bindings.ts"]
fn export_capture_bindings() {
    let output =
        std::env::var_os("CHARON_CAPTURE_BINDINGS_OUT").expect("CHARON_CAPTURE_BINDINGS_OUT");
    let config = Config::default().with_large_int("number");
    let declarations = [
        CapabilityState::decl(&config),
        PlatformKind::decl(&config),
        CapturePermissionKind::decl(&config),
        CaptureCapabilities::decl(&config),
        CaptureEditorRequest::decl(&config),
        CaptureStatusEvent::decl(&config),
        CaptureIpcError::decl(&config),
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
