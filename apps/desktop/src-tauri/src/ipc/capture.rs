use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::capture::platform;
use crate::capture::{
    CaptureCapabilities, CaptureCoordinator, CaptureError, CaptureIpcError, CaptureTrigger,
    CaptureWindowPort, ShortcutPort, TauriCaptureWindow,
};

pub struct CaptureRuntime {
    coordinator: Mutex<Option<CaptureCoordinator>>,
    started_at: Instant,
}

impl Default for CaptureRuntime {
    fn default() -> Self {
        Self {
            coordinator: Mutex::new(None),
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
    let callback = Arc::new(move || handle_double_shift(&trigger_app));
    let platform = platform::create(callback);
    let window: Box<dyn CaptureWindowPort> = Box::new(TauriCaptureWindow::new(app.clone()));
    let mut coordinator = CaptureCoordinator::new(
        Box::new(TauriShortcutPort { app: app.clone() }),
        platform,
        window,
    );
    coordinator.initialize();
    *current = Some(coordinator);
    Ok(())
}

pub fn handle_global_shortcut(app: &AppHandle) {
    let _ = trigger(app, CaptureTrigger::StandardShortcut);
}

pub fn handle_double_shift(app: &AppHandle) {
    let _ = trigger(app, CaptureTrigger::DoubleShift);
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

#[tauri::command]
pub fn capture_capabilities(
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, |coordinator| Ok(coordinator.capabilities()))
}

#[tauri::command]
pub fn capture_open(
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    let timestamp = elapsed_ms(&runtime);
    with_coordinator(&runtime, |coordinator| {
        coordinator.trigger(CaptureTrigger::InApp, timestamp)?;
        Ok(coordinator.capabilities())
    })
}

#[tauri::command]
pub fn capture_request_permission(
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, CaptureCoordinator::request_permission)
}

#[tauri::command]
pub fn capture_set_shortcut(
    shortcut: String,
    runtime: State<'_, CaptureRuntime>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    with_coordinator(&runtime, |coordinator| coordinator.set_shortcut(&shortcut))
}

#[tauri::command]
pub fn capture_close(runtime: State<'_, CaptureRuntime>) -> Result<(), CaptureIpcError> {
    with_coordinator(&runtime, CaptureCoordinator::hide)
}

fn trigger(app: &AppHandle, source: CaptureTrigger) -> Result<(), CaptureIpcError> {
    let runtime = app.state::<CaptureRuntime>();
    let timestamp = elapsed_ms(&runtime);
    with_coordinator(&runtime, |coordinator| {
        coordinator.trigger(source, timestamp).map(|_| ())
    })
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
