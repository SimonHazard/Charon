use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use charon_desktop_lib::capture::{
    CapabilityState, CaptureCapabilities, CaptureCoordinator, CaptureError, CaptureIpcError,
    CaptureRequest, CaptureTrigger, CaptureWindowPort, PlatformCapturePort, PlatformKind,
    ShortcutPort, DEFAULT_CAPTURE_SHORTCUT,
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
    selected: Option<String>,
    grant_on_request: bool,
    starts: usize,
    remembers: usize,
    restores: usize,
    resets: usize,
    shutdowns: usize,
}

struct FakePlatform(Arc<Mutex<FakePlatformState>>);

impl PlatformCapturePort for FakePlatform {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn double_shift_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").double_shift
    }

    fn selected_text_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").selected_text
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        self.0.lock().expect("platform state").starts += 1;
        Ok(())
    }

    fn request_permission(&mut self) -> Result<bool, CaptureError> {
        let mut state = self.0.lock().expect("platform state");
        if state.grant_on_request {
            state.double_shift = CapabilityState::Available;
            state.selected_text = CapabilityState::Available;
        }
        Ok(state.grant_on_request)
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        Ok(self.0.lock().expect("platform state").selected.clone())
    }

    fn remember_focus_owner(&mut self) {
        self.0.lock().expect("platform state").remembers += 1;
    }

    fn restore_focus_owner(&mut self) {
        self.0.lock().expect("platform state").restores += 1;
    }

    fn reset_gesture(&mut self) {
        self.0.lock().expect("platform state").resets += 1;
    }

    fn shutdown(&mut self) {
        self.0.lock().expect("platform state").shutdowns += 1;
    }
}

#[derive(Default)]
struct WindowState {
    requests: Vec<CaptureRequest>,
    focuses: usize,
    hides: usize,
    shutdowns: usize,
}

struct FakeWindow(Arc<Mutex<WindowState>>);

type CoordinatorFixture = (
    CaptureCoordinator,
    Arc<Mutex<ShortcutState>>,
    Arc<Mutex<FakePlatformState>>,
    Arc<Mutex<WindowState>>,
);

impl CaptureWindowPort for FakeWindow {
    fn open(&mut self, request: &CaptureRequest) -> Result<(), CaptureError> {
        self.0
            .lock()
            .expect("window state")
            .requests
            .push(request.clone());
        Ok(())
    }

    fn focus(&mut self) -> Result<(), CaptureError> {
        self.0.lock().expect("window state").focuses += 1;
        Ok(())
    }

    fn hide(&mut self) -> Result<(), CaptureError> {
        self.0.lock().expect("window state").hides += 1;
        Ok(())
    }

    fn shutdown(&mut self) {
        self.0.lock().expect("window state").shutdowns += 1;
    }
}

fn coordinator(
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Option<&str>,
) -> CoordinatorFixture {
    let shortcuts = Arc::new(Mutex::new(ShortcutState::default()));
    let platform = Arc::new(Mutex::new(FakePlatformState {
        double_shift,
        selected_text,
        selected: selected.map(str::to_owned),
        grant_on_request: false,
        starts: 0,
        remembers: 0,
        restores: 0,
        resets: 0,
        shutdowns: 0,
    }));
    let window = Arc::new(Mutex::new(WindowState::default()));
    let mut coordinator = CaptureCoordinator::new(
        Box::new(FakeShortcut(Arc::clone(&shortcuts))),
        Box::new(FakePlatform(Arc::clone(&platform))),
        Box::new(FakeWindow(Arc::clone(&window))),
    );
    coordinator.initialize();
    (coordinator, shortcuts, platform, window)
}

#[test]
fn capture_coordinator_prefills_only_when_authorized() {
    let (mut available, _, _, available_window) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Some("private draft"),
    );
    let request = available
        .trigger(CaptureTrigger::DoubleShift, 1_000)
        .expect("available capture")
        .expect("new request");
    assert_eq!(request.prefill, "private draft");
    assert_eq!(available_window.lock().expect("window").requests.len(), 1);

    for status in [CapabilityState::Denied, CapabilityState::Unsupported] {
        let (mut fallback, _, _, fallback_window) = coordinator(status, status, None);
        let request = fallback
            .trigger(CaptureTrigger::InApp, 2_000)
            .expect("fallback capture")
            .expect("new request");
        assert!(request.prefill.is_empty());
        assert_eq!(request.capabilities.selected_text, status);
        assert_eq!(fallback_window.lock().expect("window").requests.len(), 1);
    }
}

#[test]
fn capture_coordinator_registration_conflict_restores_one_previous_shortcut() {
    let (mut coordinator, shortcuts, _, _) = coordinator(
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        None,
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
fn capture_coordinator_deduplicates_overlapping_global_sources_and_keeps_focus() {
    let (mut coordinator, _, platform, window) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Some("one"),
    );
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShift, 1_000)
        .expect("first")
        .is_some());
    assert!(coordinator
        .trigger(CaptureTrigger::StandardShortcut, 1_040)
        .expect("duplicate")
        .is_none());
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShift, 1_200)
        .expect("later trigger")
        .is_some());

    let window = window.lock().expect("window");
    assert_eq!(window.requests.len(), 2);
    assert_eq!(window.focuses, 1);
    assert_eq!(platform.lock().expect("platform").resets, 1);
}

#[test]
fn capture_coordinator_restores_the_previous_focus_owner_after_hiding() {
    let (mut coordinator, _, platform, window) = coordinator(
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        None,
    );

    coordinator
        .trigger(CaptureTrigger::StandardShortcut, 1_000)
        .expect("trigger capture");
    coordinator.hide().expect("hide capture");

    let platform = platform.lock().expect("platform state");
    assert_eq!(platform.remembers, 1);
    assert_eq!(platform.restores, 1);
    assert_eq!(window.lock().expect("window state").hides, 1);
}

#[test]
fn capture_coordinator_permission_retry_starts_listener_once() {
    let (mut coordinator, _, platform, _) = coordinator(
        CapabilityState::Denied,
        CapabilityState::Denied,
        Some("selection"),
    );
    platform.lock().expect("platform").grant_on_request = true;
    let capabilities = coordinator.request_permission().expect("permission retry");
    assert_eq!(capabilities.double_shift, CapabilityState::Available);
    assert_eq!(capabilities.selected_text, CapabilityState::Available);
    assert_eq!(platform.lock().expect("platform").starts, 1);
}

#[test]
fn capture_coordinator_shutdown_is_idempotent_and_unregisters_everything() {
    let (mut coordinator, shortcuts, platform, window) =
        coordinator(CapabilityState::Available, CapabilityState::Available, None);
    coordinator.shutdown();
    coordinator.shutdown();
    assert!(matches!(
        coordinator.trigger(CaptureTrigger::InApp, 1),
        Err(CaptureError::Shutdown)
    ));
    assert!(shortcuts.lock().expect("shortcut").active.is_empty());
    assert_eq!(platform.lock().expect("platform").shutdowns, 1);
    assert_eq!(window.lock().expect("window").shutdowns, 1);
}

#[test]
fn capture_errors_never_contain_selected_content() {
    let content = "do not log this selected text";
    for error in [
        CaptureError::PermissionDenied,
        CaptureError::SelectionFailed,
        CaptureError::WindowUnavailable,
    ] {
        assert!(!error.to_string().contains(content));
    }
}

#[test]
fn capture_contract_serialization_has_stable_capability_names() {
    let capabilities = CaptureCapabilities {
        platform: PlatformKind::LinuxWayland,
        standard_shortcut: CapabilityState::Available,
        double_shift: CapabilityState::Unsupported,
        selected_text: CapabilityState::Denied,
        active_shortcut: DEFAULT_CAPTURE_SHORTCUT.to_owned(),
    };
    assert_eq!(
        serde_json::to_value(capabilities).expect("serialize capabilities"),
        serde_json::json!({
            "platform": "linuxWayland",
            "standardShortcut": "available",
            "doubleShift": "unsupported",
            "selectedText": "denied",
            "activeShortcut": DEFAULT_CAPTURE_SHORTCUT,
        })
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
        CaptureCapabilities::decl(&config),
        CaptureTrigger::decl(&config),
        CaptureRequest::decl(&config),
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
