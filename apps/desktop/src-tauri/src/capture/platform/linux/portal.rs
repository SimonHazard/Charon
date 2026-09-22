//! Wayland uses the user-mediated portal, never an XWayland keyboard listener.
use crate::capture::{CapabilityState, CaptureError};
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
    zvariant::{OwnedObjectPath, OwnedValue, Value},
    Connection, MatchRule, MessageStream, Proxy,
};

type Properties = HashMap<String, OwnedValue>;
const DESTINATION: &str = "org.freedesktop.portal.Desktop";
const PATH: &str = "/org/freedesktop/portal/desktop";

pub struct PortalShortcut {
    stop: Arc<AtomicBool>,
    state: Arc<Mutex<(CapabilityState, String)>>,
}
impl PortalShortcut {
    pub fn start(callback: Arc<dyn Fn() + Send + Sync>) -> Result<Self, CaptureError> {
        let stop = Arc::new(AtomicBool::new(false));
        let state = Arc::new(Mutex::new((CapabilityState::Unsupported, String::new())));
        let (worker_stop, worker_state) = (stop.clone(), state.clone());
        std::thread::Builder::new()
            .name("charon-shortcut-portal".into())
            .spawn(move || {
                let result = async_io::block_on(run(&worker_stop, &worker_state, callback));
                if let Ok(mut state) = worker_state.lock() {
                    state.0 = result.err().unwrap_or(CapabilityState::Unsupported);
                }
            })
            .map_err(|_| CaptureError::ShortcutRegistration)?;
        Ok(Self { stop, state })
    }
    pub fn state(&self) -> (CapabilityState, String) {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or((CapabilityState::Error, String::new()))
    }
}
impl Drop for PortalShortcut {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}

async fn response(
    events: &mut MessageStream,
    path: &OwnedObjectPath,
    stop: &AtomicBool,
) -> Result<Properties, CapabilityState> {
    let deadline = std::time::Instant::now() + Duration::from_secs(120);
    while !stop.load(Ordering::Acquire) && std::time::Instant::now() < deadline {
        let event = future::race(async { Some(events.next().await) }, async {
            async_io::Timer::after(Duration::from_millis(100)).await;
            None
        })
        .await;
        let event = match event {
            None => continue,
            Some(Some(Ok(event))) => event,
            _ => return Err(CapabilityState::Error),
        };
        if event.header().path().map(|value| value.as_str()) != Some(path.as_str()) {
            continue;
        }
        let (code, data): (u32, Properties) = event
            .body()
            .deserialize()
            .map_err(|_| CapabilityState::Error)?;
        return if code == 0 {
            Ok(data)
        } else if code == 1 {
            Err(CapabilityState::Denied)
        } else {
            Err(CapabilityState::Error)
        };
    }
    Err(CapabilityState::Unsupported)
}
async fn run(
    stop: &AtomicBool,
    state: &Mutex<(CapabilityState, String)>,
    callback: Arc<dyn Fn() + Send + Sync>,
) -> Result<(), CapabilityState> {
    if !super::local_session_bus() {
        return Err(CapabilityState::Unsupported);
    }
    let connection = future::race(
        async {
            zbus::connection::Builder::session()
                .ok()?
                .method_timeout(Duration::from_secs(2))
                .build()
                .await
                .ok()
        },
        async {
            async_io::Timer::after(Duration::from_secs(2)).await;
            None
        },
    )
    .await
    .ok_or(CapabilityState::Unsupported)?;
    let portal = Proxy::new(
        &connection,
        DESTINATION,
        PATH,
        "org.freedesktop.portal.GlobalShortcuts",
    )
    .await
    .map_err(|_| CapabilityState::Unsupported)?;
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .sender(DESTINATION)
        .map_err(|_| CapabilityState::Error)?
        .interface("org.freedesktop.portal.Request")
        .map_err(|_| CapabilityState::Error)?
        .member("Response")
        .map_err(|_| CapabilityState::Error)?
        .build();
    let mut responses = MessageStream::for_match_rule(rule, &connection, Some(8))
        .await
        .map_err(|_| CapabilityState::Unsupported)?;
    let options = HashMap::from([
        ("handle_token", Value::from("charon_create")),
        ("session_handle_token", Value::from("charon_shortcuts")),
    ]);
    let request: OwnedObjectPath = portal
        .call("CreateSession", &(options,))
        .await
        .map_err(|_| CapabilityState::Unsupported)?;
    let mut created = response(&mut responses, &request, stop).await?;
    // The portal specification deliberately retains the historical string wire type.
    let handle = String::try_from(
        created
            .remove("session_handle")
            .ok_or(CapabilityState::Error)?,
    )
    .map_err(|_| CapabilityState::Error)?;
    let session = OwnedObjectPath::try_from(handle).map_err(|_| CapabilityState::Error)?;
    let result = bind_and_listen(
        &connection,
        &portal,
        &mut responses,
        &session,
        stop,
        state,
        callback,
    )
    .await;
    if let Ok(session_proxy) = Proxy::new(
        &connection,
        DESTINATION,
        session.as_str(),
        "org.freedesktop.portal.Session",
    )
    .await
    {
        let _ = session_proxy.call::<_, _, ()>("Close", &()).await;
    }
    result
}
async fn bind_and_listen(
    connection: &Connection,
    portal: &Proxy<'_>,
    responses: &mut MessageStream,
    session: &OwnedObjectPath,
    stop: &AtomicBool,
    state: &Mutex<(CapabilityState, String)>,
    callback: Arc<dyn Fn() + Send + Sync>,
) -> Result<(), CapabilityState> {
    let mut activated = portal
        .receive_signal("Activated")
        .await
        .map_err(|_| CapabilityState::Error)?;
    let mut changed = portal
        .receive_signal("ShortcutsChanged")
        .await
        .map_err(|_| CapabilityState::Error)?;
    let session_proxy = Proxy::new(
        connection,
        DESTINATION,
        session.as_str(),
        "org.freedesktop.portal.Session",
    )
    .await
    .map_err(|_| CapabilityState::Error)?;
    let mut closed = session_proxy
        .receive_signal("Closed")
        .await
        .map_err(|_| CapabilityState::Error)?;
    let shortcuts = vec![(
        "composer",
        HashMap::from([
            ("description", Value::from("Charon")),
            ("preferred_trigger", Value::from("ALT+SHIFT+space")),
        ]),
    )];
    let request: OwnedObjectPath = portal
        .call(
            "BindShortcuts",
            &(
                session,
                shortcuts,
                "",
                HashMap::from([("handle_token", Value::from("charon_bind"))]),
            ),
        )
        .await
        .map_err(|_| CapabilityState::Error)?;
    let mut bound = response(responses, &request, stop).await?;
    let shortcuts: Vec<(String, Properties)> = bound
        .remove("shortcuts")
        .ok_or(CapabilityState::Error)?
        .try_into()
        .map_err(|_| CapabilityState::Error)?;
    update_shortcut(state, shortcuts)?;
    while !stop.load(Ordering::Acquire) {
        let event = future::race(
            async { Some((false, activated.next().await)) },
            future::race(
                async { Some((true, changed.next().await)) },
                future::race(
                    async {
                        let _ = closed.next().await;
                        Some((false, None))
                    },
                    async {
                        async_io::Timer::after(Duration::from_millis(100)).await;
                        None
                    },
                ),
            ),
        )
        .await;
        let (is_change, event) = match event {
            None => continue,
            Some((is_change, Some(message))) => (is_change, message),
            _ => return Err(CapabilityState::Unsupported),
        };
        if is_change {
            let (handle, shortcuts): (OwnedObjectPath, Vec<(String, Properties)>) = event
                .body()
                .deserialize()
                .map_err(|_| CapabilityState::Error)?;
            if &handle == session {
                update_shortcut(state, shortcuts)?;
            }
            continue;
        }
        let (handle, id, _, _): (OwnedObjectPath, String, u64, Properties) = event
            .body()
            .deserialize()
            .map_err(|_| CapabilityState::Error)?;
        if &handle == session && id == "composer" {
            callback();
        }
    }
    Ok(())
}

fn update_shortcut(
    state: &Mutex<(CapabilityState, String)>,
    shortcuts: Vec<(String, Properties)>,
) -> Result<(), CapabilityState> {
    let description = shortcuts
        .into_iter()
        .find(|(id, _)| id == "composer")
        .and_then(|(_, mut properties)| properties.remove("trigger_description"))
        .and_then(|value| String::try_from(value).ok())
        .filter(|value| !value.trim().is_empty());
    let mut state = state.lock().map_err(|_| CapabilityState::Error)?;
    *state = match description {
        Some(value) => (CapabilityState::Available, value),
        None => (CapabilityState::Unsupported, String::new()),
    };
    Ok(())
}

#[cfg(test)]
#[path = "portal_tests.rs"]
mod tests;
