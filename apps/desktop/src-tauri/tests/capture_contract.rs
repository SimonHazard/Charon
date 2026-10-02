use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use charon_desktop_lib::capture::{
    CapabilityState, CaptureAction, CaptureCapabilities, CaptureComposerRequest,
    CaptureCoordinator, CaptureError, CaptureIpcError, CapturePermissionKind, CaptureStatusEvent,
    CaptureTrigger, CaptureWarning, CapturedSelection, PlatformCapturePort, PlatformKind,
    ShortcutOrigin, ShortcutPort, DEFAULT_CAPTURE_SHORTCUT,
};
use ts_rs::{Config, TS};

#[derive(Default)]
struct ShortcutState {
    active: HashSet<String>,
    fail_for: HashSet<String>,
    fail_unregister: bool,
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
        if state.fail_unregister {
            return Err(CaptureError::ShortcutUnregistration);
        }
        state.active.remove(shortcut);
        Ok(())
    }
}

struct FakePlatformState {
    platform: PlatformKind,
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Result<Option<String>, CaptureError>,
    warning: Option<CaptureWarning>,
    grant_input_on_request: bool,
    grant_accessibility_on_request: bool,
    fail_settings_open: bool,
    starts: usize,
    fail_listener: bool,
    reads: usize,
    resets: usize,
    shutdowns: usize,
    rich_state: CapabilityState,
    rich: bool,
}

struct FakePlatform(Arc<Mutex<FakePlatformState>>);

impl PlatformCapturePort for FakePlatform {
    fn platform(&self) -> PlatformKind {
        self.0.lock().expect("platform state").platform
    }

    fn input_monitoring_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").double_shift
    }

    fn accessibility_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").selected_text
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        let mut state = self.0.lock().expect("platform state");
        state.starts += 1;
        if state.fail_listener {
            Err(CaptureError::ListenerUnavailable)
        } else {
            Ok(())
        }
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
        if state.fail_settings_open {
            Err(CaptureError::SettingsOpenFailed)
        } else {
            Ok(())
        }
    }

    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError> {
        let mut state = self.0.lock().expect("platform state");
        state.reads += 1;
        match &state.selected {
            Ok(value) => Ok(CapturedSelection {
                body: value.clone(),
                warning: state.warning,
            }),
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

    fn set_rich_capture(&mut self, enabled: bool) {
        self.0.lock().expect("platform state").rich = enabled;
    }

    fn rich_capture_state(&self) -> CapabilityState {
        self.0.lock().expect("platform state").rich_state
    }
}

/// An adapter that keeps every default method, as Windows and Linux do.
struct MinimalPlatform(PlatformKind);

impl PlatformCapturePort for MinimalPlatform {
    fn platform(&self) -> PlatformKind {
        self.0
    }
    fn input_monitoring_state(&self) -> CapabilityState {
        CapabilityState::Experimental
    }
    fn accessibility_state(&self) -> CapabilityState {
        CapabilityState::Experimental
    }
    fn start(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
    fn request_permission(&mut self, _: CapturePermissionKind) -> Result<(), CaptureError> {
        Ok(())
    }
    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError> {
        Ok(CapturedSelection::default())
    }
    fn reset_gesture(&mut self) {}
    fn shutdown(&mut self) {}
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
    coordinator_on(PlatformKind::Macos, double_shift, selected_text, selected)
}

fn coordinator_on(
    kind: PlatformKind,
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Result<Option<&str>, CaptureError>,
) -> CoordinatorFixture {
    let (mut coordinator, shortcuts, platform) =
        uninitialized_on(kind, double_shift, selected_text, selected);
    coordinator.initialize();
    (coordinator, shortcuts, platform)
}

fn uninitialized_on(
    kind: PlatformKind,
    double_shift: CapabilityState,
    selected_text: CapabilityState,
    selected: Result<Option<&str>, CaptureError>,
) -> CoordinatorFixture {
    let shortcuts = Arc::new(Mutex::new(ShortcutState::default()));
    let selected = selected.map(|value| value.map(str::to_owned));
    let platform = Arc::new(Mutex::new(FakePlatformState {
        platform: kind,
        double_shift,
        selected_text,
        selected,
        warning: None,
        grant_input_on_request: false,
        grant_accessibility_on_request: false,
        fail_settings_open: false,
        starts: 0,
        fail_listener: false,
        reads: 0,
        resets: 0,
        shutdowns: 0,
        rich_state: CapabilityState::Unsupported,
        rich: false,
    }));
    let coordinator = CaptureCoordinator::new(
        Box::new(FakeShortcut(Arc::clone(&shortcuts))),
        Box::new(FakePlatform(Arc::clone(&platform))),
    );
    (coordinator, shortcuts, platform)
}

#[test]
fn capture_selection_returns_exact_non_empty_body() {
    let (mut note_coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(Some("  private draft\n")),
    );
    let action = note_coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .expect("available capture");
    match action {
        Some(CaptureAction::CreateNote { body, .. }) => assert_eq!(body, "  private draft\n"),
        _ => panic!("expected one note action"),
    }
    assert_eq!(platform.lock().expect("platform").reads, 1);
}

#[test]
fn capture_warning_is_attached_to_one_note_or_returned_without_content() {
    let (mut note_coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(Some("exact body")),
    );
    platform.lock().expect("platform").warning = Some(CaptureWarning::ClipboardNotRestored);
    assert!(matches!(
        note_coordinator
            .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
            .expect("capture"),
        Some(CaptureAction::CreateNote {
            body,
            warning: Some(CaptureWarning::ClipboardNotRestored),
        }) if body == "exact body"
    ));

    let (mut warning_coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(None),
    );
    platform.lock().expect("platform").warning = Some(CaptureWarning::ClipboardNotRestored);
    assert!(matches!(
        warning_coordinator
            .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
            .expect("warning"),
        Some(CaptureAction::ShowWarning {
            warning: CaptureWarning::ClipboardNotRestored,
        })
    ));
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
    for (index, source) in [CaptureTrigger::StandardShortcut, CaptureTrigger::InApp]
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
        assert!(matches!(action, Some(CaptureAction::FocusComposer { .. })));
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
    assert!(matches!(
        coordinator
            .trigger(CaptureTrigger::StandardShortcut, 1_020)
            .expect("portable fallback"),
        Some(CaptureAction::FocusComposer { .. })
    ));
    assert_eq!(platform.lock().expect("platform").reads, 0);
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
        .trigger(CaptureTrigger::StandardShortcut, 1_200)
        .expect("later trigger")
        .is_some());
    assert_eq!(platform.lock().expect("platform").resets, 2);
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
fn settings_open_failure_preserves_the_fresh_permission_state_and_one_listener() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Denied,
        CapabilityState::Denied,
        Ok(Some("selection")),
    );
    {
        let mut state = platform.lock().expect("platform");
        state.grant_input_on_request = true;
        state.fail_settings_open = true;
    }

    assert!(matches!(
        coordinator.request_permission(CapturePermissionKind::InputMonitoring),
        Err(CaptureError::SettingsOpenFailed)
    ));
    assert_eq!(
        coordinator.capabilities().input_monitoring,
        CapabilityState::Available
    );
    assert_eq!(platform.lock().expect("platform").starts, 1);
    assert_eq!(
        coordinator
            .refresh_capabilities()
            .expect("refresh")
            .double_shift,
        CapabilityState::Available
    );
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
fn rich_capture_reaches_the_platform_and_never_reads_by_itself() {
    let (mut coordinator, _, platform) = coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(Some("selected")),
    );
    platform.lock().expect("platform").rich_state = CapabilityState::Experimental;
    assert_eq!(
        coordinator.capabilities().rich_capture,
        CapabilityState::Unsupported
    );
    assert_eq!(
        coordinator
            .refresh_capabilities()
            .expect("refresh")
            .rich_capture,
        CapabilityState::Experimental
    );

    coordinator.set_rich_capture(true);
    assert!(platform.lock().expect("platform").rich);
    assert_eq!(platform.lock().expect("platform").reads, 0);
    coordinator.set_rich_capture(false);
    assert!(!platform.lock().expect("platform").rich);
    assert_eq!(platform.lock().expect("platform").reads, 0);

    // The choice only changes what a later gesture reads.
    coordinator.set_rich_capture(true);
    assert!(matches!(
        coordinator.trigger(CaptureTrigger::DoubleShiftCapture, 1_000),
        Ok(Some(CaptureAction::CreateNote { body, .. })) if body == "selected"
    ));
    assert_eq!(platform.lock().expect("platform").reads, 1);
}

#[test]
fn adapters_without_formatted_capture_report_it_unsupported() {
    for kind in [
        PlatformKind::Windows,
        PlatformKind::LinuxX11,
        PlatformKind::LinuxWayland,
    ] {
        let mut platform = MinimalPlatform(kind);
        assert_eq!(platform.rich_capture_state(), CapabilityState::Unsupported);
        platform.set_rich_capture(true);
        let mut coordinator = CaptureCoordinator::new(
            Box::new(FakeShortcut(Arc::new(Mutex::new(ShortcutState::default())))),
            Box::new(platform),
        );
        coordinator.initialize();
        coordinator.set_rich_capture(true);
        assert_eq!(
            coordinator.capabilities().rich_capture,
            CapabilityState::Unsupported
        );
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
        default_shortcut: "Alt+Shift+Space".to_owned(),
        shortcut_origin: ShortcutOrigin::Desktop,
        shortcut_configurable: false,
        rich_capture: CapabilityState::Unsupported,
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
            "defaultShortcut": "Alt+Shift+Space",
            "shortcutOrigin": "desktop",
            "shortcutConfigurable": false,
            "richCapture": "unsupported",
        })
    );
    for (origin, name) in [
        (ShortcutOrigin::Default, "default"),
        (ShortcutOrigin::Custom, "custom"),
        (ShortcutOrigin::DefaultAfterFailure, "defaultAfterFailure"),
        (ShortcutOrigin::Desktop, "desktop"),
    ] {
        assert_eq!(serde_json::to_value(origin).expect("origin"), name);
    }
    assert_eq!(
        serde_json::to_value(CaptureComposerRequest { request_id: 7 })
            .expect("serialize editor request"),
        serde_json::json!({ "requestId": 7 })
    );
    assert_eq!(
        serde_json::to_value(CaptureStatusEvent {
            message_key: "capture_note_created".to_owned(),
            note_id: Some("00000000-0000-4000-8000-000000000007".to_owned()),
        })
        .expect("serialize capture status"),
        serde_json::json!({
            "messageKey": "capture_note_created",
            "noteId": "00000000-0000-4000-8000-000000000007",
        })
    );
    assert_eq!(
        serde_json::to_value(CaptureStatusEvent {
            message_key: "workspace_error_not_open".to_owned(),
            note_id: None,
        })
        .expect("serialize capture error status"),
        serde_json::json!({ "messageKey": "workspace_error_not_open", "noteId": null })
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
        ShortcutOrigin::decl(&config),
        CaptureCapabilities::decl(&config),
        CaptureComposerRequest::decl(&config),
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

#[test]
fn experimental_adapters_capture_and_register_alt_without_duplicate_listeners() {
    for platform in [PlatformKind::Windows, PlatformKind::LinuxX11] {
        let (mut coordinator, shortcuts, native) = coordinator_on(
            platform,
            CapabilityState::Experimental,
            CapabilityState::Experimental,
            Ok(Some("exact selection")),
        );
        assert!(shortcuts.lock().unwrap().active.contains("Alt+Shift+Space"));
        assert_eq!(
            coordinator.capabilities().double_shift,
            CapabilityState::Experimental
        );
        assert!(
            matches!(coordinator.trigger(CaptureTrigger::DoubleShiftCapture, 1_000).unwrap(), Some(CaptureAction::CreateNote { body, .. }) if body == "exact selection")
        );
        assert!(coordinator
            .trigger(CaptureTrigger::DoubleShiftCapture, 1_050)
            .unwrap()
            .is_none());
        coordinator.refresh_capabilities().unwrap();
        assert_eq!(native.lock().unwrap().starts, 1);
        assert!(matches!(
            coordinator
                .trigger(CaptureTrigger::StandardShortcut, 2_000)
                .unwrap(),
            Some(CaptureAction::FocusComposer { .. })
        ));
        coordinator.shutdown();
        assert!(shortcuts.lock().unwrap().active.is_empty());
    }
}

#[test]
fn wayland_never_starts_modifier_listener_or_reads_selection() {
    let (mut coordinator, shortcuts, native) = coordinator_on(
        PlatformKind::LinuxWayland,
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        Ok(Some("must not read")),
    );
    assert!(shortcuts.lock().unwrap().active.contains("Alt+Shift+Space"));
    assert!(coordinator
        .trigger(CaptureTrigger::DoubleShiftCapture, 1_000)
        .unwrap()
        .is_none());
    let native = native.lock().unwrap();
    assert_eq!(native.starts, 0);
    assert_eq!(native.reads, 0);
}

#[test]
fn failed_listener_is_not_retried_or_readvertised_on_ordinary_refresh() {
    let (mut coordinator, _, native) = coordinator(
        CapabilityState::Denied,
        CapabilityState::Experimental,
        Ok(None),
    );
    {
        let mut native = native.lock().unwrap();
        native.double_shift = CapabilityState::Experimental;
        native.fail_listener = true;
    }
    for _ in 0..3 {
        assert_eq!(
            coordinator.refresh_capabilities().unwrap().double_shift,
            CapabilityState::Error
        );
    }
    assert_eq!(native.lock().unwrap().starts, 1);
}

fn operations(shortcuts: &Arc<Mutex<ShortcutState>>) -> Vec<String> {
    std::mem::take(&mut shortcuts.lock().expect("shortcut state").operations)
}

fn macos_coordinator() -> CoordinatorFixture {
    coordinator(
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(None),
    )
}

#[test]
fn an_unchanged_shortcut_keeps_the_platform_default_and_reports_its_origin() {
    let (coordinator, shortcuts, _) = macos_coordinator();
    let capabilities = coordinator.capabilities();
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(capabilities.default_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
    assert!(capabilities.shortcut_configurable);
    assert_eq!(coordinator.custom_shortcut(), None);
    assert_eq!(
        operations(&shortcuts),
        [format!("register:{DEFAULT_CAPTURE_SHORTCUT}")]
    );

    for platform in [PlatformKind::Windows, PlatformKind::LinuxX11] {
        let (coordinator, _, _) = coordinator_on(
            platform,
            CapabilityState::Experimental,
            CapabilityState::Experimental,
            Ok(None),
        );
        let capabilities = coordinator.capabilities();
        assert_eq!(capabilities.active_shortcut, "Alt+Shift+Space");
        assert_eq!(capabilities.default_shortcut, "Alt+Shift+Space");
        assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
        assert!(capabilities.shortcut_configurable);
    }
}

#[test]
fn a_shortcut_change_registers_the_new_accelerator_before_releasing_the_old() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    operations(&shortcuts);

    let capabilities = coordinator
        .change_shortcut(Some("ctrl+command+n"))
        .expect("change");
    assert_eq!(capabilities.active_shortcut, "Cmd+Ctrl+N");
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Custom);
    assert_eq!(capabilities.standard_shortcut, CapabilityState::Available);
    assert_eq!(coordinator.custom_shortcut().as_deref(), Some("Cmd+Ctrl+N"));
    assert_eq!(
        operations(&shortcuts),
        [
            "register:Cmd+Ctrl+N".to_owned(),
            format!("unregister:{DEFAULT_CAPTURE_SHORTCUT}"),
        ]
    );
    assert_eq!(
        shortcuts.lock().unwrap().active,
        HashSet::from(["Cmd+Ctrl+N".to_owned()])
    );
}

#[test]
fn a_refused_shortcut_leaves_the_previous_one_active_and_untouched() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    operations(&shortcuts);
    shortcuts
        .lock()
        .unwrap()
        .fail_for
        .insert("Cmd+Alt+N".to_owned());

    assert!(matches!(
        coordinator.change_shortcut(Some("Cmd+Alt+N")),
        Err(CaptureError::ShortcutConflict)
    ));
    assert_eq!(operations(&shortcuts), ["register:Cmd+Alt+N"]);
    let capabilities = coordinator.capabilities();
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
    assert_eq!(capabilities.standard_shortcut, CapabilityState::Available);
    assert!(shortcuts
        .lock()
        .unwrap()
        .active
        .contains(DEFAULT_CAPTURE_SHORTCUT));
}

#[test]
fn invalid_and_reserved_shortcuts_never_reach_the_platform() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    operations(&shortcuts);
    assert!(matches!(
        coordinator.change_shortcut(Some("Cmd+F")),
        Err(CaptureError::InvalidShortcut)
    ));
    assert!(matches!(
        coordinator.change_shortcut(Some("Cmd+Shift+3")),
        Err(CaptureError::ShortcutReserved)
    ));
    assert!(operations(&shortcuts).is_empty());
    assert_eq!(
        coordinator.capabilities().active_shortcut,
        DEFAULT_CAPTURE_SHORTCUT
    );
}

#[test]
fn reset_returns_to_the_exact_default_string() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    coordinator
        .change_shortcut(Some("Cmd+Ctrl+N"))
        .expect("change");
    operations(&shortcuts);

    let capabilities = coordinator.change_shortcut(None).expect("reset");
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
    assert_eq!(coordinator.custom_shortcut(), None);
    assert_eq!(
        operations(&shortcuts),
        [
            format!("register:{DEFAULT_CAPTURE_SHORTCUT}"),
            "unregister:Cmd+Ctrl+N".to_owned(),
        ]
    );

    // Choosing the default by its keys is a reset too.
    coordinator
        .change_shortcut(Some("Cmd+Ctrl+N"))
        .expect("change again");
    operations(&shortcuts);
    let capabilities = coordinator
        .change_shortcut(Some("Shift+Cmd+Space"))
        .expect("default by keys");
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
}

#[test]
fn choosing_the_current_shortcut_is_a_no_op() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    operations(&shortcuts);
    let capabilities = coordinator
        .change_shortcut(Some("Cmd+Shift+Space"))
        .expect("same default");
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert!(operations(&shortcuts).is_empty());

    coordinator
        .change_shortcut(Some("Cmd+Ctrl+N"))
        .expect("change");
    operations(&shortcuts);
    let capabilities = coordinator
        .change_shortcut(Some("Ctrl+Cmd+KeyN"))
        .expect("same custom");
    assert_eq!(capabilities.active_shortcut, "Cmd+Ctrl+N");
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Custom);
    assert!(operations(&shortcuts).is_empty());
}

#[test]
fn a_failed_release_restores_the_previous_shortcut_alone() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    operations(&shortcuts);
    shortcuts.lock().unwrap().fail_unregister = true;

    assert!(matches!(
        coordinator.change_shortcut(Some("Cmd+Ctrl+N")),
        Err(CaptureError::ShortcutUnregistration)
    ));
    assert_eq!(
        operations(&shortcuts),
        [
            "register:Cmd+Ctrl+N".to_owned(),
            format!("unregister:{DEFAULT_CAPTURE_SHORTCUT}"),
            "unregister:Cmd+Ctrl+N".to_owned(),
        ]
    );
    assert_eq!(
        coordinator.capabilities().active_shortcut,
        DEFAULT_CAPTURE_SHORTCUT
    );
    assert_eq!(coordinator.custom_shortcut(), None);
}

#[test]
fn a_change_retries_registration_when_the_default_was_refused() {
    let (mut coordinator, shortcuts, _) = uninitialized_on(
        PlatformKind::Windows,
        CapabilityState::Experimental,
        CapabilityState::Experimental,
        Ok(None),
    );
    shortcuts
        .lock()
        .unwrap()
        .fail_for
        .insert("Alt+Shift+Space".to_owned());
    coordinator.initialize();
    assert_eq!(
        coordinator.capabilities().standard_shortcut,
        CapabilityState::Error
    );
    operations(&shortcuts);

    let capabilities = coordinator
        .change_shortcut(Some("Ctrl+Alt+N"))
        .expect("change");
    assert_eq!(capabilities.standard_shortcut, CapabilityState::Available);
    assert_eq!(capabilities.active_shortcut, "Ctrl+Alt+N");
    // The refused default was never registered, so nothing is released.
    assert_eq!(operations(&shortcuts), ["register:Ctrl+Alt+N"]);
}

#[test]
fn wayland_refuses_a_shortcut_change_without_touching_the_portal() {
    let (mut coordinator, shortcuts, _) = coordinator_on(
        PlatformKind::LinuxWayland,
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        Ok(None),
    );
    let capabilities = coordinator.capabilities();
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Desktop);
    assert!(!capabilities.shortcut_configurable);
    operations(&shortcuts);

    for requested in [Some("Ctrl+Alt+N"), None] {
        assert!(matches!(
            coordinator.change_shortcut(requested),
            Err(CaptureError::ShortcutNotConfigurable)
        ));
    }
    assert!(operations(&shortcuts).is_empty());
}

#[test]
fn launch_registers_a_valid_stored_shortcut_instead_of_the_default() {
    let (mut coordinator, shortcuts, _) = uninitialized_on(
        PlatformKind::Windows,
        CapabilityState::Experimental,
        CapabilityState::Experimental,
        Ok(None),
    );
    coordinator.set_preferred_shortcut(Some("Ctrl+Alt+N".to_owned()));
    coordinator.initialize();
    let capabilities = coordinator.capabilities();
    assert_eq!(capabilities.active_shortcut, "Ctrl+Alt+N");
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Custom);
    assert_eq!(capabilities.standard_shortcut, CapabilityState::Available);
    assert_eq!(coordinator.custom_shortcut().as_deref(), Some("Ctrl+Alt+N"));
    assert_eq!(operations(&shortcuts), ["register:Ctrl+Alt+N"]);

    // Too late: a started coordinator ignores a new preferred value.
    coordinator.set_preferred_shortcut(Some("Ctrl+Alt+M".to_owned()));
    assert_eq!(coordinator.capabilities().active_shortcut, "Ctrl+Alt+N");
}

#[test]
fn launch_falls_back_to_the_default_when_a_stored_shortcut_is_refused() {
    let (mut coordinator, shortcuts, _) = uninitialized_on(
        PlatformKind::Macos,
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(None),
    );
    shortcuts
        .lock()
        .unwrap()
        .fail_for
        .insert("Cmd+Ctrl+N".to_owned());
    coordinator.set_preferred_shortcut(Some("Cmd+Ctrl+N".to_owned()));
    coordinator.initialize();
    let capabilities = coordinator.capabilities();
    assert_eq!(capabilities.active_shortcut, DEFAULT_CAPTURE_SHORTCUT);
    assert_eq!(
        capabilities.shortcut_origin,
        ShortcutOrigin::DefaultAfterFailure
    );
    assert_eq!(capabilities.standard_shortcut, CapabilityState::Available);
    assert_eq!(coordinator.custom_shortcut(), None);
    assert_eq!(
        operations(&shortcuts),
        [
            "register:Cmd+Ctrl+N".to_owned(),
            format!("register:{DEFAULT_CAPTURE_SHORTCUT}"),
        ]
    );

    // Reset clears the warning without registering anything again.
    let capabilities = coordinator.change_shortcut(None).expect("reset");
    assert_eq!(capabilities.shortcut_origin, ShortcutOrigin::Default);
    assert!(operations(&shortcuts).is_empty());
}

#[test]
fn launch_never_registers_an_invalid_stored_shortcut() {
    for stored in ["Cmd+F", "Cmd+Shift+3", "Cmd+Ctrl+F21", "not a shortcut"] {
        let (mut coordinator, shortcuts, _) = uninitialized_on(
            PlatformKind::Macos,
            CapabilityState::Available,
            CapabilityState::Available,
            Ok(None),
        );
        coordinator.set_preferred_shortcut(Some(stored.to_owned()));
        coordinator.initialize();
        assert_eq!(
            operations(&shortcuts),
            [format!("register:{DEFAULT_CAPTURE_SHORTCUT}")],
            "{stored}"
        );
        assert_eq!(
            coordinator.capabilities().shortcut_origin,
            ShortcutOrigin::DefaultAfterFailure
        );
    }

    // A stored value that names the default is simply the default.
    let (mut coordinator, _, _) = uninitialized_on(
        PlatformKind::Macos,
        CapabilityState::Available,
        CapabilityState::Available,
        Ok(None),
    );
    coordinator.set_preferred_shortcut(Some("Cmd+Shift+Space".to_owned()));
    coordinator.initialize();
    assert_eq!(
        coordinator.capabilities().shortcut_origin,
        ShortcutOrigin::Default
    );
}

#[test]
fn wayland_keeps_a_stored_shortcut_but_uses_the_portal() {
    let (mut coordinator, shortcuts, _) = uninitialized_on(
        PlatformKind::LinuxWayland,
        CapabilityState::Unsupported,
        CapabilityState::Unsupported,
        Ok(None),
    );
    coordinator.set_preferred_shortcut(Some("Ctrl+Alt+N".to_owned()));
    coordinator.initialize();
    assert_eq!(operations(&shortcuts), ["register:Alt+Shift+Space"]);
    assert_eq!(
        coordinator.capabilities().shortcut_origin,
        ShortcutOrigin::Desktop
    );
}

#[test]
fn shutdown_releases_the_custom_shortcut() {
    let (mut coordinator, shortcuts, _) = macos_coordinator();
    coordinator
        .change_shortcut(Some("Cmd+Ctrl+N"))
        .expect("change");
    operations(&shortcuts);
    coordinator.shutdown();
    assert_eq!(operations(&shortcuts), ["unregister:Cmd+Ctrl+N"]);
    assert!(shortcuts.lock().unwrap().active.is_empty());
    assert!(matches!(
        coordinator.change_shortcut(None),
        Err(CaptureError::Shutdown)
    ));
}
