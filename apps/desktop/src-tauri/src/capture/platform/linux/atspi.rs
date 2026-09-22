use crate::capture::platform::bounded::MAX_SELECTION_BYTES;
use futures_lite::{future, StreamExt};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use zbus::{
    zvariant::{OwnedObjectPath, OwnedValue},
    Connection, MatchRule, MessageStream, Proxy,
};

#[derive(Clone)]
pub struct Focused {
    connection: Connection,
    bus: String,
    path: String,
}
pub enum Selection {
    Text(String),
    Protected,
    Unavailable,
}

#[derive(Default)]
pub struct FocusTracker {
    focused: Arc<Mutex<Option<Focused>>>,
    live: Arc<AtomicBool>,
    available: Arc<AtomicBool>,
}
impl FocusTracker {
    pub fn available(&self) -> bool {
        self.available.load(Ordering::Acquire)
    }
    pub fn snapshot(&self) -> Option<Focused> {
        self.focused.lock().ok()?.clone()
    }
    pub fn start(&self) {
        if self.live.swap(true, Ordering::AcqRel) {
            return;
        }
        let (focused, live, available) = (
            self.focused.clone(),
            self.live.clone(),
            self.available.clone(),
        );
        let _ = std::thread::Builder::new()
            .name("charon-atspi-focus".into())
            .spawn(move || {
                async_io::block_on(async {
                    let connection = future::race(connect(), async {
                        async_io::Timer::after(Duration::from_secs(2)).await;
                        None
                    })
                    .await;
                    if let Some(connection) = connection {
                        let _ = track(connection, &focused, &live, &available).await;
                    }
                });
                available.store(false, Ordering::Release);
                if let Ok(mut focused) = focused.lock() {
                    *focused = None;
                }
            });
    }
    pub fn stop(&self) {
        self.live.store(false, Ordering::Release);
        self.available.store(false, Ordering::Release);
    }
}
impl Drop for FocusTracker {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn connect() -> Option<Connection> {
    if !super::local_session_bus() {
        return None;
    }
    let session = zbus::connection::Builder::session()
        .ok()?
        .method_timeout(Duration::from_millis(150))
        .build()
        .await
        .ok()?;
    let bus = Proxy::new(&session, "org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus")
        .await
        .ok()?;
    let address: String = bus.call("GetAddress", &()).await.ok()?;
    if !address.starts_with("unix:") {
        return None;
    }
    zbus::connection::Builder::address(address.as_str())
        .ok()?
        .method_timeout(Duration::from_millis(150))
        .build()
        .await
        .ok()
}
async fn track(
    connection: Connection,
    focused: &Mutex<Option<Focused>>,
    live: &AtomicBool,
    available: &AtomicBool,
) -> Option<()> {
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .interface("org.a11y.atspi.Event.Object")
        .ok()?
        .member("StateChanged")
        .ok()?
        .add_arg("focused")
        .ok()?
        .build();
    let mut events = MessageStream::for_match_rule(rule, &connection, Some(16))
        .await
        .ok()?;
    let registry = Proxy::new(
        &connection,
        "org.a11y.atspi.Registry",
        "/org/a11y/atspi/registry",
        "org.a11y.atspi.Registry",
    )
    .await
    .ok()?;
    registry
        .call::<_, _, ()>(
            "RegisterEvent",
            &("object:state-changed:focused", Vec::<String>::new(), ""),
        )
        .await
        .ok()?;
    available.store(true, Ordering::Release);
    while live.load(Ordering::Acquire) {
        let event = future::race(async { Some(events.next().await) }, async {
            async_io::Timer::after(Duration::from_millis(100)).await;
            None
        })
        .await;
        let event = match event {
            None => continue,
            Some(Some(Ok(event))) => event,
            _ => return None,
        };
        let header = event.header();
        let bus = header.sender()?.to_string();
        let path = header.path()?.to_string();
        // Retain only an accessible-object reference, never background text or trees.
        let active = event
            .body()
            .deserialize::<(String, i32, i32, OwnedValue, HashMap<String, OwnedValue>)>()
            .map(|body| body.1)
            .or_else(|_| {
                event
                    .body()
                    .deserialize::<(String, i32, i32, OwnedValue, (String, OwnedObjectPath))>()
                    .map(|body| body.1)
            })
            .ok();
        if let Ok(mut current) = focused.lock() {
            match active {
                Some(1) => {
                    *current = Some(Focused {
                        connection: connection.clone(),
                        bus,
                        path,
                    })
                }
                Some(0)
                    if current
                        .as_ref()
                        .is_some_and(|item| item.bus == bus && item.path == path) =>
                {
                    *current = None
                }
                _ => {}
            }
        }
    }
    let _ = registry
        .call::<_, _, ()>("DeregisterEvent", &("object:state-changed:focused",))
        .await;
    Some(())
}
impl Focused {
    pub fn read(self, source_pid: u32) -> Selection {
        async_io::block_on(future::race(self.read_inner(source_pid), async {
            async_io::Timer::after(Duration::from_millis(200)).await;
            Selection::Unavailable
        }))
    }
    async fn read_inner(&self, source_pid: u32) -> Selection {
        self.try_read(source_pid)
            .await
            .unwrap_or(Selection::Unavailable)
    }
    async fn try_read(&self, source_pid: u32) -> Option<Selection> {
        let dbus = Proxy::new(
            &self.connection,
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
        )
        .await
        .ok()?;
        let pid: u32 = dbus
            .call("GetConnectionUnixProcessID", &(self.bus.as_str(),))
            .await
            .ok()?;
        if pid != source_pid {
            return None;
        }
        let accessible = Proxy::new(
            &self.connection,
            self.bus.as_str(),
            self.path.as_str(),
            "org.a11y.atspi.Accessible",
        )
        .await
        .ok()?;
        let state: Vec<u32> = accessible.call("GetState", &()).await.ok()?;
        if state.first().copied().unwrap_or_default() & (1 << 12) == 0 {
            return None;
        }
        let role: u32 = accessible.call("GetRole", &()).await.ok()?;
        if role == 40 {
            return Some(Selection::Protected);
        }
        let text = Proxy::new(
            &self.connection,
            self.bus.as_str(),
            self.path.as_str(),
            "org.a11y.atspi.Text",
        )
        .await
        .ok()?;
        let count: i32 = text.call("GetNSelections", &()).await.ok()?;
        if count != 1 {
            return None;
        }
        let (start, end): (i32, i32) = text.call("GetSelection", &(0i32,)).await.ok()?;
        if start < 0
            || end <= start
            || i64::from(end) - i64::from(start) > (MAX_SELECTION_BYTES / 4) as i64
        {
            return None;
        }
        let value: String = text.call("GetText", &(start, end)).await.ok()?;
        let state: Vec<u32> = accessible.call("GetState", &()).await.ok()?;
        if state.first().copied().unwrap_or_default() & (1 << 12) == 0
            || value.trim().is_empty()
            || value.len() > MAX_SELECTION_BYTES
        {
            return None;
        }
        Some(Selection::Text(value))
    }
}

#[cfg(test)]
#[path = "atspi_tests.rs"]
mod tests;
