use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcut;

use crate::capture::platform;
use crate::capture::{
    CaptureAction, CaptureCapabilities, CaptureComposerRequest, CaptureCoordinator, CaptureError,
    CaptureIpcError, CapturePermissionKind, CaptureStatusEvent, CaptureTrigger, CaptureWarning,
    ShortcutPort,
};

use super::workspace::{self, CaptureNoteOutcome, WorkspaceRuntime};

/// Statuses wait here until the main window can receive them; the oldest is
/// dropped beyond this bound so a long-hidden window never accumulates more.
const PENDING_STATUS_LIMIT: usize = 4;

/// How long quitting waits on the main thread for a capture in progress. It
/// covers ADR 0010's bounded Copy transaction with its clipboard restoration
/// and the Note write; a capture still running after it is left behind, and
/// the process exits without it, so quitting never hangs.
const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);

pub struct CaptureRuntime {
    coordinator: Mutex<Option<CaptureCoordinator>>,
    worker: Mutex<Option<CaptureWorker>>,
    composer_listener_ready: Mutex<bool>,
    pending_composer_request: Mutex<Option<CaptureComposerRequest>>,
    pending_status: Mutex<VecDeque<CaptureStatusEvent>>,
    started_at: Instant,
}

impl Default for CaptureRuntime {
    fn default() -> Self {
        Self {
            coordinator: Mutex::new(None),
            worker: Mutex::new(None),
            composer_listener_ready: Mutex::new(false),
            pending_composer_request: Mutex::new(None),
            pending_status: Mutex::new(VecDeque::new()),
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
    stopping: Arc<AtomicBool>,
    /// Disconnects when the worker thread ends, even by a panic.
    finished: Receiver<()>,
    thread: Option<JoinHandle<()>>,
}

impl CaptureWorker {
    fn start(task: impl Fn() + Send + 'static) -> Result<Self, CaptureError> {
        let (sender, receiver) = mpsc::sync_channel(1);
        let (finished_sender, finished) = mpsc::channel::<()>();
        let pending = Arc::new(AtomicBool::new(false));
        let stopping = Arc::new(AtomicBool::new(false));
        let thread_pending = Arc::clone(&pending);
        let thread_stopping = Arc::clone(&stopping);
        let thread = thread::Builder::new()
            .name("charon-capture-worker".to_owned())
            .spawn(move || {
                let _finished = finished_sender;
                while let Ok(message) = receiver.recv() {
                    // A capture queued before quitting never starts.
                    if thread_stopping.load(Ordering::Acquire) {
                        break;
                    }
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
            stopping,
            finished,
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

    /// Lets a capture in progress finish for at most `wait`, then joins the
    /// thread, or leaves it running and returns false. Never blocks longer:
    /// quitting runs this on the main thread, which a capture may need.
    fn stop(&mut self, wait: Duration) -> bool {
        let Some(thread) = self.thread.take() else {
            return true;
        };
        self.stopping.store(true, Ordering::Release);
        // A full queue holds a capture that the stop flag already cancels.
        let _ = self.sender.try_send(CaptureWorkerMessage::Stop);
        let finished = matches!(
            self.finished.recv_timeout(wait),
            Ok(()) | Err(RecvTimeoutError::Disconnected)
        );
        if finished {
            let _ = thread.join();
        }
        self.pending.store(false, Ordering::Release);
        finished
    }
}

impl Drop for CaptureWorker {
    fn drop(&mut self) {
        self.stop(SHUTDOWN_WAIT);
    }
}

struct TauriShortcutPort {
    app: AppHandle,
    #[cfg(target_os = "linux")]
    portal: Option<platform::linux::portal::PortalShortcut>,
}

impl ShortcutPort for TauriShortcutPort {
    fn register(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        if platform::linux::is_wayland() {
            let app = self.app.clone();
            self.portal = Some(platform::linux::portal::PortalShortcut::start(Arc::new(
                move || handle_global_shortcut(&app),
            ))?);
            return Ok(());
        }
        self.app
            .try_state::<GlobalShortcut<tauri::Wry>>()
            .ok_or(CaptureError::ShortcutRegistration)?
            .register(shortcut)
            .map_err(|_| CaptureError::ShortcutRegistration)
    }

    fn unregister(&mut self, shortcut: &str) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        if platform::linux::is_wayland() {
            self.portal.take();
            return Ok(());
        }
        self.app
            .try_state::<GlobalShortcut<tauri::Wry>>()
            .ok_or(CaptureError::ShortcutUnregistration)?
            .unregister(shortcut)
            .map_err(|_| CaptureError::ShortcutUnregistration)
    }
    fn current_state(&self) -> Option<(crate::capture::CapabilityState, String)> {
        #[cfg(target_os = "linux")]
        if let Some(portal) = &self.portal {
            return Some(portal.state());
        }
        None
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
    let callback = Arc::new(move |_| {
        handle_double_shift(&trigger_app);
    });
    let platform = platform::create(callback);
    *current = Some(CaptureCoordinator::new(
        Box::new(TauriShortcutPort {
            app: app.clone(),
            #[cfg(target_os = "linux")]
            portal: None,
        }),
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
    let coordinator = current.as_mut().ok_or(CaptureError::RuntimeLock)?;
    // An unreadable preferences file leaves the platform default active and
    // formatted capture off.
    let persisted = super::preferences::read_persisted(app).ok();
    coordinator.set_preferred_shortcut(
        persisted
            .as_ref()
            .and_then(|preferences| preferences.composer_shortcut.clone()),
    );
    coordinator.set_rich_capture(persisted.is_some_and(|preferences| preferences.rich_capture));
    coordinator.initialize();
    Ok(())
}

/// Handles a press of the composer accelerator on the main thread. A shortcut
/// change holds the coordinator while the plugin registers on the main thread,
/// and X11 or the Wayland portal deliver presses on their own threads, so a
/// press never waits for a change that waits for its thread. On macOS and
/// Windows presses already arrive on the main thread and run inline.
pub fn handle_global_shortcut(app: &AppHandle) {
    let task_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = trigger(&task_app, CaptureTrigger::StandardShortcut);
    });
}

pub fn handle_double_shift(app: &AppHandle) {
    let _ = enqueue_capture(app);
}

/// Stops capture when Charon quits. It runs on the main thread, so every wait
/// is bounded by [`SHUTDOWN_WAIT`]: taking the worker first stops new
/// captures from being queued, a capture in progress gets the remaining time
/// to finish (and restore the clipboard), and a coordinator still held after
/// that is left for the exiting process to release.
pub fn shutdown(app: &AppHandle) {
    let deadline = Instant::now() + SHUTDOWN_WAIT;
    let runtime = app.state::<CaptureRuntime>();
    let worker = runtime
        .worker
        .lock()
        .ok()
        .and_then(|mut current| current.take());
    if let Some(mut worker) = worker {
        worker.stop(deadline.saturating_duration_since(Instant::now()));
    }
    let coordinator =
        lock_until(&runtime.coordinator, deadline).and_then(|mut current| current.take());
    if let Some(mut coordinator) = coordinator {
        coordinator.shutdown();
    }
}

/// Locks `mutex`, giving up at `deadline` instead of waiting without bound.
fn lock_until<T>(mutex: &Mutex<T>, deadline: Instant) -> Option<MutexGuard<'_, T>> {
    loop {
        match mutex.try_lock() {
            Ok(guard) => return Some(guard),
            Err(TryLockError::Poisoned(_)) => return None,
            Err(TryLockError::WouldBlock) if Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(TryLockError::WouldBlock) => return None,
        }
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

#[tauri::command(async)]
pub fn capture_capabilities(
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, CaptureCoordinator::refresh_capabilities)
}

#[tauri::command(async)]
pub fn capture_open(app: AppHandle) -> Result<CaptureCapabilities, CaptureIpcError> {
    trigger(&app, CaptureTrigger::InApp)?;
    let runtime = app.state::<CaptureRuntime>();
    with_coordinator(&runtime, |coordinator| Ok(coordinator.capabilities()))
}

#[tauri::command(async)]
pub fn capture_request_permission(
    permission: CapturePermissionKind,
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, |coordinator| {
        coordinator.request_permission(permission)
    })
}

/// Replaces the composer accelerator with the user's choice, or restores the
/// default with `None` (ADR 0025), then stores the choice. The plugin
/// registers on the main thread and its key handler locks the coordinator, so
/// the whole change runs on the main thread rather than holding the
/// coordinator on this worker while waiting for it.
#[tauri::command(async)]
pub fn capture_set_shortcut(
    app: AppHandle,
    shortcut: Option<String>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    on_main_thread(&app, move |app| apply_shortcut_change(app, shortcut))?
}

/// Applies the formatted-capture choice (ADR 0026) to the running adapter. A
/// capture in progress finishes first with the previous choice.
pub(crate) fn apply_rich_capture(app: &AppHandle, enabled: bool) {
    let runtime = app.state::<CaptureRuntime>();
    let _ = with_coordinator(&runtime, |coordinator| {
        coordinator.set_rich_capture(enabled);
        Ok(())
    });
}

/// Restores the default accelerator after the preferences file was reset.
pub(crate) fn reset_shortcut(app: &AppHandle) {
    let _ = on_main_thread(app, |app| {
        let runtime = app.state::<CaptureRuntime>();
        with_coordinator(&runtime, |coordinator| coordinator.change_shortcut(None))
    });
}

fn apply_shortcut_change(
    app: &AppHandle,
    requested: Option<String>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    let mut current = runtime
        .coordinator
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    let coordinator = current
        .as_mut()
        .ok_or_else(|| CaptureIpcError::from(CaptureError::Shutdown))?;
    let previous = coordinator.custom_shortcut();
    let capabilities = coordinator.change_shortcut(requested.as_deref())?;
    // A stored choice always had a working registration; if it cannot be
    // stored, the previous accelerator comes back.
    if let Err(error) =
        super::preferences::remember_composer_shortcut(app, coordinator.custom_shortcut())
    {
        let _ = coordinator.change_shortcut(previous.as_deref());
        return Err(CaptureIpcError {
            code: format!("preferences_{}", error.code),
            message_key: error.message_key,
        });
    }
    Ok(capabilities)
}

/// Runs `task` on the main thread and waits for its result. Never call it from
/// the main thread while holding a lock the task needs.
fn on_main_thread<T: Send + 'static>(
    app: &AppHandle,
    task: impl FnOnce(&AppHandle) -> T + Send + 'static,
) -> Result<T, CaptureIpcError> {
    let (sender, receiver) = mpsc::sync_channel(1);
    let task_app = app.clone();
    app.run_on_main_thread(move || {
        let _ = sender.send(task(&task_app));
    })
    .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    receiver
        .recv()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))
}

#[tauri::command(async)]
pub fn capture_composer_ready(app: AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    *runtime
        .composer_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? = true;
    emit_pending_status(&app)?;
    emit_pending_composer_request(&app)
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
            let workspace_runtime = app.state::<WorkspaceRuntime>();
            let outcome =
                workspace::create_capture_note(app, &workspace_runtime, body).map_err(|error| {
                    CaptureIpcError {
                        code: format!("workspace_{}", error.code),
                        message_key: error.message_key,
                    }
                });
            let created = matches!(outcome, Ok(CaptureNoteOutcome::Created(_)));
            let remembered = remember_statuses(app, capture_statuses(outcome, warning));
            // Neither the Note's text nor its id reaches the notification (ADR 0024).
            if created {
                super::notification::notify_capture(app);
            }
            remembered
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
                .pending_composer_request
                .lock()
                .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? =
                Some(CaptureComposerRequest { request_id });
            emit_pending_composer_request(app)
        },
        |warning| remember_statuses(app, vec![warning_status(warning)]),
    )
}

fn emit_pending_composer_request(app: &AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    if !*runtime
        .composer_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
    {
        return Ok(());
    }
    let request = runtime
        .pending_composer_request
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
        .take();
    let Some(request) = request else {
        return Ok(());
    };
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| CaptureIpcError::from(CaptureError::MainEditorUnavailable))?;
    if main
        .emit("capture://composer-focus-requested", request)
        .is_err()
    {
        *runtime
            .pending_composer_request
            .lock()
            .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))? = Some(request);
        return Err(CaptureIpcError::from(CaptureError::MainEditorUnavailable));
    }
    Ok(())
}

/// Maps one capture outcome to its content-free statuses, in display order.
/// A clipboard-restoration warning always follows, because ADR 0010 reports
/// it whether or not a Note was saved.
fn capture_statuses(
    outcome: Result<CaptureNoteOutcome, CaptureIpcError>,
    warning: Option<CaptureWarning>,
) -> Vec<CaptureStatusEvent> {
    let mut statuses = Vec::with_capacity(2);
    match outcome {
        Ok(CaptureNoteOutcome::Created(note_id)) => statuses.push(CaptureStatusEvent {
            message_key: "capture_note_created".to_owned(),
            note_id: Some(note_id),
        }),
        Ok(CaptureNoteOutcome::Empty) => {}
        Ok(CaptureNoteOutcome::WorkspaceClosed) => statuses.push(CaptureStatusEvent {
            message_key: "workspace_error_not_open".to_owned(),
            note_id: None,
        }),
        Err(error) => statuses.push(CaptureStatusEvent {
            message_key: error.message_key,
            note_id: None,
        }),
    }
    statuses.extend(warning.map(warning_status));
    statuses
}

fn warning_status(warning: CaptureWarning) -> CaptureStatusEvent {
    CaptureStatusEvent {
        message_key: warning.message_key().to_owned(),
        note_id: None,
    }
}

fn queue_status(queue: &mut VecDeque<CaptureStatusEvent>, status: CaptureStatusEvent) {
    if queue.len() >= PENDING_STATUS_LIMIT {
        queue.pop_front();
    }
    queue.push_back(status);
}

/// Remembers statuses for the main window, then delivers them at once when it
/// is already focused; otherwise they wait for focus. Never shows or focuses it.
fn remember_statuses(
    app: &AppHandle,
    statuses: Vec<CaptureStatusEvent>,
) -> Result<(), CaptureIpcError> {
    if statuses.is_empty() {
        return Ok(());
    }
    {
        let runtime = app.state::<CaptureRuntime>();
        let mut queue = runtime
            .pending_status
            .lock()
            .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
        for status in statuses {
            queue_status(&mut queue, status);
        }
    }
    // The capture worker calls this, so never `is_focused`, which waits for
    // the main thread while the main thread may be waiting for this worker.
    if super::shell::main_focused(app) {
        emit_pending_status(app)?;
    }
    Ok(())
}

fn emit_pending_status(app: &AppHandle) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    if !*runtime
        .composer_listener_ready
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
    {
        return Ok(());
    }
    let statuses = std::mem::take(
        &mut *runtime
            .pending_status
            .lock()
            .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?,
    );
    if statuses.is_empty() {
        return Ok(());
    }
    let main = app.get_webview_window("main");
    let undelivered = deliver_in_order(statuses, |status| {
        main.as_ref()
            .is_some_and(|main| main.emit("capture://status", status).is_ok())
    });
    if undelivered.is_empty() {
        return Ok(());
    }
    let mut queue = runtime
        .pending_status
        .lock()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    // Undelivered statuses are older than anything queued meanwhile.
    for status in undelivered.into_iter().rev() {
        queue.push_front(status);
    }
    while queue.len() > PENDING_STATUS_LIMIT {
        queue.pop_front();
    }
    Err(CaptureIpcError::from(CaptureError::MainEditorUnavailable))
}

/// Delivers statuses oldest first and stops at the first failure, returning
/// that status and every later one in their original order.
fn deliver_in_order(
    mut statuses: VecDeque<CaptureStatusEvent>,
    mut deliver: impl FnMut(&CaptureStatusEvent) -> bool,
) -> VecDeque<CaptureStatusEvent> {
    while let Some(status) = statuses.front() {
        if !deliver(status) {
            break;
        }
        statuses.pop_front();
    }
    statuses
}

fn dispatch_action(
    action: CaptureAction,
    mut create_note: impl FnMut(String, Option<CaptureWarning>) -> Result<(), CaptureIpcError>,
    mut open_editor: impl FnMut(u32) -> Result<(), CaptureIpcError>,
    mut show_warning: impl FnMut(CaptureWarning) -> Result<(), CaptureIpcError>,
) -> Result<(), CaptureIpcError> {
    match action {
        CaptureAction::CreateNote { body, warning } => create_note(body, warning),
        CaptureAction::FocusComposer { request_id } => open_editor(request_id),
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
    use super::{
        capture_statuses, deliver_in_order, dispatch_action, lock_until, queue_status,
        CaptureWorker, PENDING_STATUS_LIMIT,
    };
    use crate::capture::{CaptureAction, CaptureIpcError, CaptureStatusEvent, CaptureWarning};
    use crate::ipc::workspace::CaptureNoteOutcome;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::{Duration, Instant};

    fn status(message_key: &str, note_id: Option<&str>) -> CaptureStatusEvent {
        CaptureStatusEvent {
            message_key: message_key.to_owned(),
            note_id: note_id.map(str::to_owned),
        }
    }

    #[test]
    fn a_created_note_reports_only_its_key_and_random_id() {
        assert_eq!(
            capture_statuses(Ok(CaptureNoteOutcome::Created("note-1".to_owned())), None),
            [status("capture_note_created", Some("note-1"))]
        );
    }

    #[test]
    fn a_created_note_precedes_its_clipboard_warning() {
        assert_eq!(
            capture_statuses(
                Ok(CaptureNoteOutcome::Created("note-1".to_owned())),
                Some(CaptureWarning::ClipboardNotRestored),
            ),
            [
                status("capture_note_created", Some("note-1")),
                status("capture_warning_clipboard_not_restored", None),
            ]
        );
    }

    #[test]
    fn a_failed_capture_reports_its_error_and_never_an_id() {
        let error = CaptureIpcError {
            code: "workspace_io".to_owned(),
            message_key: "workspace_error_io".to_owned(),
        };
        assert_eq!(
            capture_statuses(Err(error), None),
            [status("workspace_error_io", None)]
        );
        assert_eq!(
            capture_statuses(Ok(CaptureNoteOutcome::WorkspaceClosed), None),
            [status("workspace_error_not_open", None)]
        );
    }

    #[test]
    fn an_empty_selection_reports_nothing_but_keeps_a_clipboard_warning() {
        assert!(capture_statuses(Ok(CaptureNoteOutcome::Empty), None).is_empty());
        assert_eq!(
            capture_statuses(
                Ok(CaptureNoteOutcome::Empty),
                Some(CaptureWarning::ClipboardNotRestored),
            ),
            [status("capture_warning_clipboard_not_restored", None)]
        );
    }

    #[test]
    fn remembered_statuses_queue_in_order_and_drop_the_oldest_beyond_the_bound() {
        let mut queue = VecDeque::new();
        queue_status(&mut queue, status("capture_note_created", Some("first")));
        queue_status(&mut queue, status("capture_note_created", Some("second")));
        assert_eq!(
            queue,
            [
                status("capture_note_created", Some("first")),
                status("capture_note_created", Some("second")),
            ]
        );
        for index in 0..PENDING_STATUS_LIMIT {
            queue_status(
                &mut queue,
                status("capture_note_created", Some(&index.to_string())),
            );
        }
        assert_eq!(queue.len(), PENDING_STATUS_LIMIT);
        assert_eq!(
            queue.front(),
            Some(&status("capture_note_created", Some("0")))
        );
    }

    #[test]
    fn delivery_stops_at_the_first_failure_and_keeps_the_rest_in_order() {
        let queue = VecDeque::from([
            status("capture_note_created", Some("first")),
            status("capture_warning_clipboard_not_restored", None),
            status("capture_note_created", Some("third")),
        ]);
        let mut delivered = Vec::new();
        let undelivered = deliver_in_order(queue, |event| {
            if event.message_key == "capture_warning_clipboard_not_restored" {
                return false;
            }
            delivered.push(event.clone());
            true
        });
        assert_eq!(delivered, [status("capture_note_created", Some("first"))]);
        assert_eq!(
            undelivered,
            [
                status("capture_warning_clipboard_not_restored", None),
                status("capture_note_created", Some("third")),
            ]
        );
        assert!(deliver_in_order(undelivered, |_| true).is_empty());
    }

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
            CaptureAction::FocusComposer { request_id: 9 },
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
        assert!(worker.stop(Duration::from_secs(10)));
        assert!(worker.stop(Duration::from_secs(10)));
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn stopping_waits_no_longer_than_its_bound_for_a_stuck_capture() {
        let (started_tx, started_rx) = mpsc::sync_channel(1);
        let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
        let mut worker = CaptureWorker::start(move || {
            let _ = started_tx.send(());
            let _ = release_rx.recv();
        })
        .expect("worker");

        assert!(worker.enqueue());
        started_rx.recv().expect("worker started");
        let stopping = Instant::now();
        // The capture never finishes in time: the worker is left behind
        // instead of blocking the (main) thread that quits.
        assert!(!worker.stop(Duration::from_millis(50)));
        assert!(stopping.elapsed() < Duration::from_secs(5));
        assert!(!worker.enqueue());
        release_tx.send(()).expect("release worker");
    }

    #[test]
    fn a_contended_lock_is_given_up_at_its_deadline() {
        let mutex = Mutex::new(1);
        let held = mutex.lock().expect("hold");
        let waiting = Instant::now();
        assert!(lock_until(&mutex, waiting + Duration::from_millis(30)).is_none());
        assert!(waiting.elapsed() >= Duration::from_millis(30));
        drop(held);
        assert_eq!(
            lock_until(&mutex, Instant::now()).map(|value| *value),
            Some(1)
        );
    }
}
