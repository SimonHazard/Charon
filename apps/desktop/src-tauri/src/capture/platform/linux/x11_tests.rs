use super::*;
use x11rb::wrapper::ConnectionExt as _;

fn fixture() -> (RustConnection, Window) {
    let (conn, screen) = connect().expect("isolated Xvfb DISPLAY");
    let window = conn.generate_id().unwrap();
    conn.create_window(
        COPY_DEPTH_FROM_PARENT,
        window,
        conn.setup().roots[screen].root,
        0,
        0,
        100,
        100,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &CreateWindowAux::new(),
    )
    .unwrap()
    .check()
    .unwrap();
    conn.map_window(window).unwrap().check().unwrap();
    conn.set_input_focus(InputFocus::PARENT, window, CURRENT_TIME)
        .unwrap()
        .check()
        .unwrap();
    let pid = atom(&conn, b"_NET_WM_PID").unwrap();
    conn.change_property32(
        PropMode::REPLACE,
        window,
        pid,
        AtomEnum::CARDINAL,
        &[std::process::id()],
    )
    .unwrap()
    .check()
    .unwrap();
    conn.set_selection_owner(window, AtomEnum::PRIMARY.into(), CURRENT_TIME)
        .unwrap()
        .check()
        .unwrap();
    (conn, window)
}

#[test]
#[ignore = "requires an isolated Xvfb server"]
fn primary_roundtrip_preserves_focus_and_clipboard_owner() {
    let (conn, window) = fixture();
    let clipboard = atom(&conn, b"CLIPBOARD").unwrap();
    conn.set_selection_owner(window, clipboard, CURRENT_TIME)
        .unwrap()
        .check()
        .unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let done = stop.clone();
    let server = thread::spawn(move || {
        while !done.load(Ordering::Acquire) {
            if let Some(Event::SelectionRequest(request)) = conn.poll_for_event().unwrap() {
                assert_eq!(request.selection, u32::from(AtomEnum::PRIMARY));
                conn.change_property8(
                    PropMode::REPLACE,
                    request.requestor,
                    request.property,
                    request.target,
                    "  sélection\n".as_bytes(),
                )
                .unwrap()
                .check()
                .unwrap();
                conn.send_event(
                    false,
                    request.requestor,
                    EventMask::NO_EVENT,
                    SelectionNotifyEvent {
                        response_type: SELECTION_NOTIFY_EVENT,
                        sequence: 0,
                        time: request.time,
                        requestor: request.requestor,
                        selection: request.selection,
                        target: request.target,
                        property: request.property,
                    },
                )
                .unwrap();
                conn.flush().unwrap();
            }
            thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(focus(&conn), Some(window));
        assert_eq!(
            conn.get_selection_owner(clipboard)
                .unwrap()
                .reply()
                .unwrap()
                .owner,
            window
        );
    });
    let result = selection(window, None);
    stop.store(true, Ordering::Release);
    server.join().unwrap();
    assert_eq!(result.as_deref(), Some("  sélection\n"));
}

#[test]
#[ignore = "requires an isolated Xvfb server"]
fn primary_missing_reply_times_out_without_focus_change() {
    let (conn, window) = fixture();
    let started = Instant::now();
    assert!(selection(window, None).is_none());
    assert!(started.elapsed() < Duration::from_secs(1));
    assert_eq!(focus(&conn), Some(window));
}

#[test]
#[ignore = "requires an isolated Xvfb server"]
fn primary_from_another_process_is_not_requested() {
    let (conn, window) = fixture();
    let other = conn.generate_id().unwrap();
    conn.create_window(
        COPY_DEPTH_FROM_PARENT,
        other,
        conn.setup().roots[0].root,
        0,
        0,
        1,
        1,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &CreateWindowAux::new(),
    )
    .unwrap()
    .check()
    .unwrap();
    conn.change_property32(
        PropMode::REPLACE,
        other,
        atom(&conn, b"_NET_WM_PID").unwrap(),
        AtomEnum::CARDINAL,
        &[std::process::id() + 1],
    )
    .unwrap()
    .check()
    .unwrap();
    conn.set_selection_owner(other, AtomEnum::PRIMARY.into(), CURRENT_TIME)
        .unwrap()
        .check()
        .unwrap();
    assert!(selection(window, None).is_none());
    while let Some(event) = conn.poll_for_event().unwrap() {
        assert!(!matches!(event, Event::SelectionRequest(_)));
    }
}

#[test]
#[ignore = "requires an isolated Xvfb server"]
fn x11_listener_starts_once_and_stops_without_grabbing_keys() {
    let (_conn, _) = fixture();
    let live = listen(
        Arc::default(),
        Arc::default(),
        Arc::new(|_| panic!("no user gesture")),
    )
    .unwrap();
    assert!(live.load(Ordering::Acquire));
    live.store(false, Ordering::Release);
}
