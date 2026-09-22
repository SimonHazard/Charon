use super::*;
use std::sync::atomic::AtomicUsize;
const SESSION: &str = "/org/freedesktop/portal/desktop/session/test/charon";

struct MockPortal {
    deny: Arc<AtomicBool>,
}
#[zbus::interface(name = "org.freedesktop.portal.GlobalShortcuts")]
impl MockPortal {
    async fn create_session(
        &self,
        _options: Properties,
        #[zbus(connection)] connection: &Connection,
    ) -> OwnedObjectPath {
        let path = "/org/freedesktop/portal/desktop/request/test/create";
        let values = HashMap::from([("session_handle", Value::from(SESSION))]);
        connection
            .emit_signal(
                None::<&str>,
                path,
                "org.freedesktop.portal.Request",
                "Response",
                &(0u32, values),
            )
            .await
            .unwrap();
        path.try_into().unwrap()
    }
    async fn bind_shortcuts(
        &self,
        _session: OwnedObjectPath,
        shortcuts: Vec<(String, Properties)>,
        _parent: String,
        _options: Properties,
        #[zbus(connection)] connection: &Connection,
    ) -> OwnedObjectPath {
        assert_eq!(shortcuts[0].0, "composer");
        assert_eq!(
            <&str>::try_from(shortcuts[0].1.get("preferred_trigger").unwrap()).unwrap(),
            "ALT+SHIFT+space"
        );
        let path = "/org/freedesktop/portal/desktop/request/test/bind";
        let shortcuts = vec![(
            "composer",
            HashMap::from([("trigger_description", Value::from("Super+Space"))]),
        )];
        let values = HashMap::from([("shortcuts", Value::from(shortcuts))]);
        let code = if self.deny.load(Ordering::Acquire) {
            1u32
        } else {
            0u32
        };
        connection
            .emit_signal(
                None::<&str>,
                path,
                "org.freedesktop.portal.Request",
                "Response",
                &(code, values),
            )
            .await
            .unwrap();
        path.try_into().unwrap()
    }
}
struct MockSession(Arc<AtomicUsize>);
#[zbus::interface(name = "org.freedesktop.portal.Session")]
impl MockSession {
    fn close(&self) {
        self.0.fetch_add(1, Ordering::AcqRel);
    }
}
fn wait_until(condition: impl Fn() -> bool) {
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while !condition() {
        assert!(
            std::time::Instant::now() < deadline,
            "portal state did not converge"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
#[test]
#[ignore = "requires an isolated dbus-run-session"]
fn portal_accepts_string_handle_reports_assigned_key_handles_activation_and_denial() {
    let deny = Arc::new(AtomicBool::new(false));
    let closed = Arc::new(AtomicUsize::new(0));
    let service = async_io::block_on(
        zbus::connection::Builder::session()
            .unwrap()
            .name(DESTINATION)
            .unwrap()
            .serve_at(PATH, MockPortal { deny: deny.clone() })
            .unwrap()
            .serve_at(SESSION, MockSession(closed.clone()))
            .unwrap()
            .build(),
    )
    .unwrap();
    let activations = Arc::new(AtomicUsize::new(0));
    let counter = activations.clone();
    let shortcut = PortalShortcut::start(Arc::new(move || {
        counter.fetch_add(1, Ordering::AcqRel);
    }))
    .unwrap();
    wait_until(|| shortcut.state().0 == CapabilityState::Available);
    assert_eq!(shortcut.state().1, "Super+Space");
    let session = OwnedObjectPath::try_from(SESSION).unwrap();
    async_io::block_on(service.emit_signal(
        None::<&str>,
        PATH,
        "org.freedesktop.portal.GlobalShortcuts",
        "Activated",
        &(session.clone(), "composer", 100u64, Properties::new()),
    ))
    .unwrap();
    wait_until(|| activations.load(Ordering::Acquire) == 1);
    let updated = vec![(
        "composer",
        HashMap::from([("trigger_description", Value::from("Alt+Shift+Space"))]),
    )];
    async_io::block_on(service.emit_signal(
        None::<&str>,
        PATH,
        "org.freedesktop.portal.GlobalShortcuts",
        "ShortcutsChanged",
        &(session, updated),
    ))
    .unwrap();
    wait_until(|| shortcut.state().1 == "Alt+Shift+Space");
    drop(shortcut);
    wait_until(|| closed.load(Ordering::Acquire) == 1);
    deny.store(true, Ordering::Release);
    let shortcut = PortalShortcut::start(Arc::new(|| panic!("denied shortcut"))).unwrap();
    wait_until(|| shortcut.state().0 == CapabilityState::Denied);
    assert!(shortcut.state().1.is_empty());
    wait_until(|| closed.load(Ordering::Acquire) == 2);
}
