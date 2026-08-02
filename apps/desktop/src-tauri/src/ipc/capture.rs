use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::capture::gesture::CaptureGestureIntent;
use crate::capture::platform;
use crate::capture::{
    CaptureAction, CaptureCapabilities, CaptureCoordinator, CaptureEditorRequest, CaptureError,
    CaptureIpcError, CapturePermissionKind, CaptureStatusEvent, CaptureTrigger, ShortcutPort,
};

use super::workspace::{self, WorkspaceRuntime};

pub struct CaptureRuntime {
    coordinator: Mutex<Option<CaptureCoordinator>>,
    active_section_id: Mutex<Option<String>>,
    editor_listener_ready: Mutex<bool>,
    pending_editor_request: Mutex<Option<CaptureEditorRequest>>,
    pending_status: Mutex<Option<CaptureStatusEvent>>,
    started_at: Instant,
}

impl Default for CaptureRuntime {
    fn default() -> Self {
        Self {
            coordinator: Mutex::new(None),
            active_section_id: Mutex::new(None),
            editor_listener_ready: Mutex::new(false),
            pending_editor_request: Mutex::new(None),
            pending_status: Mutex::new(None),
            started_at: Instant::now(),
        }
    }
}

struct TauriShortcutPort {
    app: AppHandle,
}

impl ShortcutPort for TauriShortcutPort {
    fn register(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        self.app
            .global_shortcut()
            .register(shortcut)
            .map_err(|_| CaptureError::ShortcutRegistration)
    }

    fn unregister(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        self.app
            .global_shortcut()
            .unregister(shortcut)
            .map_err(|_| CaptureError::ShortcutUnregistration)
    }
}

pub fn initialize(app: &AppHandle) -> Result<(), CaptureError> {
    let runtime = app.state::<CaptureRuntime>();
    let mut current = runtime
        .coordinator
        .lock()
        .map_err(|_| CaptureError::RuntimeLock)?;
    let trigger_app = app.clone();
    let callback = Arc::new(move |intent| {
        let intent_app = trigger_app.clone();
        // Return from the CGEventTap callback before querying Accessibility or
        // writing the Workspace. Chromium may need its main thread to receive
        // the modifier event before it can answer a cross-process AX request.
        let _ = trigger_app.run_on_main_thread(move || {
            handle_double_shift(&intent_app, intent);
        });
    });
    let platform = platform::create(callback);
    let mut coordinator =
        CaptureCoordinator::new(Box::new(TauriShortcutPort { app: app.clone() }), platform);
    coordinator.initialize();
    *current = Some(coordinator);
    Ok(())
}

pub fn handle_global_shortcut(app: &AppHandle) {
    let _ = trigger(app, CaptureTrigger::StandardShortcut);
}

pub fn handle_double_shift(app: &AppHandle, intent: CaptureGestureIntent) {
    let source = match intent {
        CaptureGestureIntent::CaptureSelection => CaptureTrigger::DoubleShiftCapture,
        CaptureGestureIntent::OpenEditor => CaptureTrigger::CommandDoubleShift,
    };
    let _ = trigger(app, source);
}

pub fn shutdown(app: &AppHandle) {
    let runtime = app.state::<CaptureRuntime>();
    let coordinator = runtime
        .coordinator
        .lock()
        .ok()
        .and_then(|mut current| current.take());
    if let Some(mut coordinator) = coordinator {
        coordinator.shutdown();
    }
}

pub fn handle_main_focus(app: &AppHandle) {
    let _ = emit_pending_status(app);
}

#[tauri::command]
pub fn capture_capabilities(
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, CaptureCoordinator::refresh_capabilities)
}

#[tauri::command]
pub fn capture_open(app: AppHandle) -> Result<CaptureCapabilities, CaptureIpcError> {
    trigger(&app, CaptureTrigger::InApp)?;
    let runtime = app.state::<CaptureRuntime>();
    with_coordinator(&runtime, |coordinator| Ok(coordinator.capabilities()))
}

#[tauri::command]
pub fn capture_request_permission(
    permission: CapturePermissionKind,
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, |coordinator| {
        coordinator.request_permission(permission)
    })
}

#[tauri::command]
pub fn capture_set_shortcut(
    shortcut: String,
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, |coordinator| coordinator.set_shortcut(&shortcut))
}

#[tauri::command]
pub fn capture_set_active_section(
    section_id: Option<String>,
    runtime: State<'_, CaptureRuntime>,
) -> Result<(), CaptureIpcError> {
    let mut active = runtime
        .active_section_id
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    *active = section_id;
    Ok(())
}

#[tauri::command]
pub fn capture_editor_ready(app: AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    *runtime
        .editor_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? = true;
    emit_pending_status(&app)?;
    emit_pending_editor_request(&app)
}

fn trigger(app: &AppHandle, source: CaptureTrigger) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    let timestamp = elapsed_ms(&runtime);
    let action = with_coordinator(&runtime, |coordinator| {
        coordinator.trigger(source, timestamp)
    })?;
    if let Some(action) = action {
        consume_action(app, action)?;
    }
    Ok(())
}

fn consume_action(app: &AppHandle, action: CaptureAction) -> Result<(), CaptureIpcError> {
    dispatch_action(
        action,
        |body| {
            let runtime = app.state::<CaptureRuntime>();
            let section_id = runtime
                .active_section_id
                .lock()
                .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
                .clone();
            let workspace_runtime = app.state::<WorkspaceRuntime>();
            let result = match workspace::create_capture_note(
                app,
                &workspace_runtime,
                section_id.as_deref(),
                body,
            ) {
                Ok(true) => Ok(()),
                Ok(false) => Err(CaptureIpcError {
                    code: "workspace_unavailable".to_owned(),
                    message_key: "workspace_error_not_open".to_owned(),
                }),
                Err(error) => Err(CaptureIpcError {
                    code: format!("workspace_{}", error.code),
                    message_key: error.message_key,
                }),
            };
            if let Err(error) = result {
                remember_status(app, error.message_key)?;
            }
            Ok(())
        },
        |request_id| {
            let main = app
                .get_webview_window("main")
                .ok_or_else(|| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
            main.show()
                .map_err(|_| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
            main.set_focus()
                .map_err(|_| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
            let runtime = app.state::<CaptureRuntime>();
            *runtime
                .pending_editor_request
                .lock()
                .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? =
                Some(CaptureEditorRequest { request_id });
            emit_pending_editor_request(app)
        },
    )
}

fn emit_pending_editor_request(app: &AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    if !*runtime
        .editor_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
    {
        return Ok(());
    }
    let request = runtime
        .pending_editor_request
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
        .take();
    let Some(request) = request else {
        return Ok(());
    };
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
    if main.emit("capture://editor-requested", request).is_err() {
        *runtime
            .pending_editor_request
            .lock()
            .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? = Some(request);
        return Err(CaptureIpcError::from(CaptureError::MainEditorUnavailable));
    }
    Ok(())
}

fn remember_status(app: &AppHandle, message_key: String) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    *runtime
        .pending_status
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? =
        Some(CaptureStatusEvent { message_key });
    Ok(())
}

fn emit_pending_status(app: &AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    if !*runtime
        .editor_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
    {
        return Ok(());
    }
    let status = runtime
        .pending_status
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
        .take();
    let Some(status) = status else {
        return Ok(());
    };
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
    if main.emit("capture://status", status.clone()).is_err() {
        *runtime
            .pending_status
            .lock()
            .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? = Some(status);
        return Err(CaptureIpcError::from(CaptureError::MainEditorUnavailable));
    }
    Ok(())
}

fn dispatch_action(
    action: CaptureAction,
    mut create_note: impl FnMut(String) -> Result<(), CaptureIpcError>,
    mut open_editor: impl FnMut(u32) -> Result<(), CaptureIpcError>,
) -> Result<(), CaptureIpcError> {
    match action {
        CaptureAction::CreateNote { body } => create_note(body),
        CaptureAction::OpenEditor { request_id } => open_editor(request_id),
    }
}

fn with_coordinator<T>(
    runtime: &State<'_, CaptureRuntime>,
    operation: impl FnOnce(&mut CaptureCoordinator) -> Result<T, CaptureError>,
) -> Result<T, CaptureIpcError> {
    let mut current = runtime
        .coordinator
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    let coordinator = current
        .as_mut()
        .ok_or_else(|| CaptureIpcError::from(CaptureError::Shutdown))?;
    operation(coordinator).map_err(CaptureIpcError::from)
}

fn elapsed_ms(runtime: &State<'_, CaptureRuntime>) -> u64 {
    u64::try_from(runtime.started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::dispatch_action;
    use crate::capture::CaptureAction;

    #[test]
    fn note_action_dispatches_exactly_one_workspace_write() {
        let mut bodies = Vec::new();
        let mut editor_requests = Vec::new();
        dispatch_action(
            CaptureAction::CreateNote {
                body: "exact body".to_owned(),
            },
            |body| {
                bodies.push(body);
                Ok(())
            },
            |request_id| {
                editor_requests.push(request_id);
                Ok(())
            },
        )
        .expect("dispatch");
        assert_eq!(bodies, ["exact body"]);
        assert!(editor_requests.is_empty());
    }

    #[test]
    fn editor_action_dispatches_exactly_one_main_request() {
        let mut note_writes = 0;
        let mut editor_requests = Vec::new();
        dispatch_action(
            CaptureAction::OpenEditor { request_id: 9 },
            |_| {
                note_writes += 1;
                Ok(())
            },
            |request_id| {
                editor_requests.push(request_id);
                Ok(())
            },
        )
        .expect("dispatch");
        assert_eq!(note_writes, 0);
        assert_eq!(editor_requests, [9]);
    }
}
