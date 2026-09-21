use super::*;
use std::sync::atomic::{AtomicU32, AtomicUsize};
struct Accessible {
    role: Arc<AtomicU32>,
    focused: Arc<AtomicBool>,
}
#[zbus::interface(name = "org.a11y.atspi.Accessible")]
impl Accessible {
    fn get_role(&self) -> u32 {
        self.role.load(Ordering::Acquire)
    }
    fn get_state(&self) -> Vec<u32> {
        vec![
            if self.focused.load(Ordering::Acquire) {
                1 << 12
            } else {
                0
            },
            0,
        ]
    }
}
struct Text {
    length: Arc<AtomicU32>,
    reads: Arc<AtomicUsize>,
}
#[zbus::interface(name = "org.a11y.atspi.Text")]
impl Text {
    fn get_n_selections(&self) -> i32 {
        1
    }
    fn get_selection(&self, selection: i32) -> (i32, i32) {
        assert_eq!(selection, 0);
        (0, self.length.load(Ordering::Acquire) as i32)
    }
    fn get_text(&self, start: i32, end: i32) -> String {
        assert_eq!((start, end), (0, 6));
        self.reads.fetch_add(1, Ordering::AcqRel);
        "exact\n".into()
    }
}
#[test]
#[ignore = "requires an isolated dbus-run-session"]
fn atspi_reads_only_focused_unprotected_bounded_selection_from_source_process() {
    let role = Arc::new(AtomicU32::new(61));
    let focused = Arc::new(AtomicBool::new(true));
    let length = Arc::new(AtomicU32::new(6));
    let reads = Arc::new(AtomicUsize::new(0));
    let path = "/org/a11y/atspi/accessible/focused";
    let service = async_io::block_on(
        zbus::connection::Builder::session()
            .unwrap()
            .serve_at(
                path,
                Accessible {
                    role: role.clone(),
                    focused: focused.clone(),
                },
            )
            .unwrap()
            .serve_at(
                path,
                Text {
                    length: length.clone(),
                    reads: reads.clone(),
                },
            )
            .unwrap()
            .build(),
    )
    .unwrap();
    let connection = async_io::block_on(Connection::session()).unwrap();
    let target = Focused {
        connection,
        bus: service.unique_name().unwrap().to_string(),
        path: path.into(),
    };
    assert!(
        matches!(target.clone().read(std::process::id()), Selection::Text(text) if text == "exact\n")
    );
    role.store(40, Ordering::Release);
    assert!(matches!(
        target.clone().read(std::process::id()),
        Selection::Protected
    ));
    role.store(61, Ordering::Release);
    focused.store(false, Ordering::Release);
    assert!(matches!(
        target.clone().read(std::process::id()),
        Selection::Unavailable
    ));
    focused.store(true, Ordering::Release);
    length.store(MAX_SELECTION_BYTES as u32, Ordering::Release);
    assert!(matches!(
        target.clone().read(std::process::id()),
        Selection::Unavailable
    ));
    assert!(matches!(
        target.read(std::process::id() + 1),
        Selection::Unavailable
    ));
    assert_eq!(reads.load(Ordering::Acquire), 1);
}
