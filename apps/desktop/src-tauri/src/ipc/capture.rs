use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::capture::gesture::CaptureGestureIntent;
use crate::capture::platform;
use crate::capture::{
    CaptureAction, CaptureCapabilities, CaptureCoordinator, CaptureEditorRequest, CaptureError,
    CaptureIpcError, CapturePermissionKind, CaptureStatusEvent, CaptureTrigger, CaptureWarning,
    ShortcutPort,
};

use super::workspace::{self, WorkspaceRuntime};

pub struct CaptureRuntime {
    coordinator: Mutex<Option<CaptureCoordinator>>,
    worker: Mutex<Option<CaptureWorker>>,
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
            worker: Mutex::new(None),
            active_section_id: Mutex::new(None),
            editor_listener_ready: Mutex::new(false),
            pending_editor_request: Mutex::new(None),
            pending_status: Mutex::new(None),
            started_at: Instant::now(),
        }
    }
}

enum CaptureWorkerMessage {
    Capture,
    Stop,
}

struct CaptureWorker {
    sender: SyncSender<CaptureWorkerMessage>,
    pending: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl CaptureWorker {
    fn start(task: impl Fn() + Send + 'static) -> Result<Self, CaptureError> {
        let (sender, receiver) = mpsc::sync_channel(1);
        let pending = Arc::new(AtomicBool::new(false));
        let thread_pending = Arc::clone(&pending);
        let thread = thread::Builder::new()
            .name("charon-capture-worker".to_owned())
            .spawn(move || {
                while let Ok(message) = receiver.recv() {
                    match message {
                        CaptureWorkerMessage::Capture => {
                            task();
                            thread_pending.store(false, Ordering::Release);
                        }
                        CaptureWorkerMessage::Stop => break,
                    }
                }
                thread_pending.store(false, Ordering::Release);
            })
            .map_err(|_| CaptureError::WorkerUnavailable)?;
        Ok(Self {
            sender,
            pending,
            thread: Some(thread),
        })
    }

    fn enqueue(&self) -> bool {
        if self.pending.swap(true, Ordering::AcqRel) {
            return false;
        }
        match self.sender.try_send(CaptureWorkerMessage::Capture) {
            Ok(()) => true,
            Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) => {
                self.pending.store(false, Ordering::Release);
                false
            }
        }
    }

    fn stop(&mut self) {
        let Some(thread) = self.thread.take() else {
            return;
        };
        let _ = self.sender.send(CaptureWorkerMessage::Stop);
        let _ = thread.join();
        self.pending.store(false, Ordering::Release);
    }
}

impl Drop for CaptureWorker {
    fn drop(&mut self) {
        self.stop();
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
    if current.is_some() {
        return Ok(());
    }
    let trigger_app = app.clone();
    let callback = Arc::new(move |intent| {
        handle_double_shift(&trigger_app, intent);
    });
    let platform = platform::create(callback);
    *current = Some(CaptureCoordinator::new(
        Box::new(TauriShortcutPort { app: app.clone() }),
        platform,
    ));

    let worker_app = app.clone();
    let worker = match CaptureWorker::start(move || {
        let _ = trigger(&worker_app, CaptureTrigger::DoubleShiftCapture);
    }) {
        Ok(worker) => worker,
        Err(error) => {
            if let Some(mut coordinator) = current.take() {
                coordinator.shutdown();
            }
            return Err(error);
        }
    };
    *runtime
        .worker
        .lock()
        .map_err(|_| CaptureError::RuntimeLock)? = Some(worker);
    current
        .as_mut()
        .ok_or(CaptureError::RuntimeLock)?
        .initialize();
    Ok(())
}

pub fn handle_global_shortcut(app: &AppHandle) {
    let _ = trigger(app, CaptureTrigger::StandardShortcut);
}

pub fn handle_double_shift(app: &AppHandle, intent: CaptureGestureIntent) {
    match intent {
        CaptureGestureIntent::CaptureSelection => {
            let _ = enqueue_capture(app);
        }
        CaptureGestureIntent::OpenEditor => {
            let intent_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = trigger(&intent_app, CaptureTrigger::CommandDoubleShift);
            });
        }
    }
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
    let worker = runtime
        .worker
        .lock()
        .ok()
        .and_then(|mut current| current.take());
    if let Some(mut worker) = worker {
        worker.stop();
    }
}

fn enqueue_capture(app: &AppHandle) -> Result<bool, CaptureError> {
    let runtime = app.state::<CaptureRuntime>();
    let worker = runtime
        .worker
        .lock()
        .map_err(|_| CaptureError::RuntimeLock)?;
    Ok(worker.as_ref().is_some_and(CaptureWorker::enqueue))
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
        |body, warning| {
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
            match result {
                Err(error) => remember_status(app, error.message_key)?,
                Ok(()) => {
                    if let Some(warning) = warning {
                        remember_status(app, warning.message_key().to_owned())?;
                    }
                }
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
        |warning| remember_status(app, warning.message_key().to_owned()),
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
    mut create_note: impl FnMut(String, Option<CaptureWarning>) -> Result<(), CaptureIpcError>,
    mut open_editor: impl FnMut(u32) -> Result<(), CaptureIpcError>,
    mut show_warning: impl FnMut(CaptureWarning) -> Result<(), CaptureIpcError>,
) -> Result<(), CaptureIpcError> {
    match action {
        CaptureAction::CreateNote { body, warning } => create_note(body, warning),
        CaptureAction::OpenEditor { request_id } => open_editor(request_id),
        CaptureAction::ShowWarning { warning } => show_warning(warning),
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
    use super::{dispatch_action, CaptureWorker};
    use crate::capture::{CaptureAction, CaptureWarning};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc};

    #[test]
    fn note_action_dispatches_exactly_one_workspace_write() {
        let mut bodies = Vec::new();
        let mut editor_requests = Vec::new();
        dispatch_action(
            CaptureAction::CreateNote {
                body: "exact body".to_owned(),
                warning: None,
            },
            |body, warning| {
                bodies.push(body);
                assert!(warning.is_none());
                Ok(())
            },
            |request_id| {
                editor_requests.push(request_id);
                Ok(())
            },
            |_| Ok(()),
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
            |_, _| {
                note_writes += 1;
                Ok(())
            },
            |request_id| {
                editor_requests.push(request_id);
                Ok(())
            },
            |_| Ok(()),
        )
        .expect("dispatch");
        assert_eq!(note_writes, 0);
        assert_eq!(editor_requests, [9]);
    }

    #[test]
    fn warning_action_is_content_free_and_dispatches_once() {
        let mut warnings = Vec::new();
        dispatch_action(
            CaptureAction::ShowWarning {
                warning: CaptureWarning::ClipboardNotRestored,
            },
            |_, _| Ok(()),
            |_| Ok(()),
            |warning| {
                warnings.push(warning);
                Ok(())
            },
        )
        .expect("dispatch warning");
        assert_eq!(warnings, [CaptureWarning::ClipboardNotRestored]);
    }

    #[test]
    fn capture_worker_is_capacity_one_and_shutdown_is_idempotent() {
        let (started_tx, started_rx) = mpsc::sync_channel(1);
        let (release_tx, release_rx) = mpsc::sync_channel(1);
        let runs = Arc::new(AtomicUsize::new(0));
        let task_runs = Arc::clone(&runs);
        let mut worker = CaptureWorker::start(move || {
            task_runs.fetch_add(1, Ordering::SeqCst);
            let _ = started_tx.send(());
            let _ = release_rx.recv();
        })
        .expect("worker");

        assert!(worker.enqueue());
        started_rx.recv().expect("worker started");
        assert!(!worker.enqueue());
        release_tx.send(()).expect("release worker");
        worker.stop();
        worker.stop();
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }
}
