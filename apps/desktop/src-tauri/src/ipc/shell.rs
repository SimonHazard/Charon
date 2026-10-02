//! Window lifecycle and the opt-in background mode (ADR 0023).
//!
//! An application-layer adapter, like the update integration, not a domain
//! module. On macOS and Windows it owns one Rust-built tray icon whose menu
//! holds only Open and Quit; Linux never creates a tray in this release. React
//! renders every label (the tray's and the capture notification's, ADR 0024)
//! through Paraglide and pushes it here, so no UI copy is hardcoded in Rust,
//! and the webview holds no tray, menu, or notification permission.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Manager};

use crate::preferences::{NativeLabels, PreferencesError, PreferencesIpcError, TrayAvailability};

#[derive(Default)]
pub struct ShellRuntime {
    labels: Mutex<Option<NativeLabels>>,
    background_active: AtomicBool,
    /// The main window's focus as its last `WindowEvent::Focused` reported it.
    main_focused: AtomicBool,
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    tray: tray::TrayState,
}

/// Tracks one tray quit request at a time. The generation keeps a late
/// watchdog from exiting after the webview already answered.
#[cfg(any(target_os = "macos", target_os = "windows", test))]
#[derive(Default)]
pub(crate) struct QuitGate {
    generation: u64,
    pending: bool,
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
impl QuitGate {
    pub(crate) fn request(&mut self) -> u64 {
        self.generation += 1;
        self.pending = true;
        self.generation
    }

    pub(crate) fn resolve(&mut self) {
        self.pending = false;
    }

    pub(crate) fn expired(&self, generation: u64) -> bool {
        self.pending && self.generation == generation
    }

    pub(crate) fn pending(&self) -> bool {
        self.pending
    }
}

/// What a quit request (the icon's Quit, or `Cmd+Q` on macOS) does next.
#[cfg(any(target_os = "macos", target_os = "windows", test))]
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum QuitStep {
    /// No main window or no listening webview holds unsent text: exit now.
    Exit,
    /// Ask the webview to run its draft guard; a watchdog exits if it never
    /// answers.
    AskWebview,
    /// The webview is still answering an earlier request, whose watchdog
    /// stands: asking again would only repeat its warning.
    Wait,
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
pub(crate) fn quit_step(
    main_window_exists: bool,
    webview_listening: bool,
    answer_pending: bool,
) -> QuitStep {
    if !main_window_exists || !webview_listening {
        QuitStep::Exit
    } else if answer_pending {
        QuitStep::Wait
    } else {
        QuitStep::AskWebview
    }
}

/// macOS always hides on close (plan 039); elsewhere only a live tray icon
/// lets closing hide Charon, so a hidden window is never left without a way
/// back.
pub(crate) fn hides_on_close(is_macos: bool, background_active: bool) -> bool {
    is_macos || background_active
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn tray_availability() -> TrayAvailability {
    if cfg!(any(target_os = "macos", target_os = "windows")) {
        TrayAvailability::Available
    } else {
        TrayAvailability::Unavailable
    }
}

/// The latest localized labels, once the webview has sent them.
pub fn labels(app: &AppHandle) -> Option<NativeLabels> {
    lock(&app.state::<ShellRuntime>().labels).clone()
}

/// Whether the main window has focus, for the capture worker. Window getters
/// such as `is_focused` wait for the main thread, which may itself be waiting
/// for that worker while Charon quits, so the worker reads this flag instead.
pub fn main_focused(app: &AppHandle) -> bool {
    app.state::<ShellRuntime>()
        .main_focused
        .load(Ordering::SeqCst)
}

/// Records the main window's focus; called on the main thread from
/// `WindowEvent::Focused`, before pending capture statuses are delivered.
pub fn set_main_focused(app: &AppHandle, focused: bool) {
    app.state::<ShellRuntime>()
        .main_focused
        .store(focused, Ordering::SeqCst);
}

pub fn background_active(app: &AppHandle) -> bool {
    app.state::<ShellRuntime>()
        .background_active
        .load(Ordering::Acquire)
}

/// Whether closing the main window hides it instead of quitting.
pub fn close_hides(app: &AppHandle) -> bool {
    hides_on_close(cfg!(target_os = "macos"), background_active(app))
}

/// Shows the tray icon and lets closing hide Charon. Needs the labels the
/// webview supplies; without them, or without a tray, it fails content-free.
pub fn enable_background(app: &AppHandle) -> Result<(), PreferencesError> {
    let runtime = app.state::<ShellRuntime>();
    let labels = lock(&runtime.labels)
        .clone()
        .ok_or(PreferencesError::TrayUnavailable)?;
    tray::show(app, &labels)?;
    runtime.background_active.store(true, Ordering::Release);
    Ok(())
}

/// Closing quits again (except on macOS) before the icon disappears.
pub fn disable_background(app: &AppHandle) {
    app.state::<ShellRuntime>()
        .background_active
        .store(false, Ordering::Release);
    tray::hide(app);
}

// Linux never creates a tray in this release (ADR 0023): these stubs keep
// closing a plain quit there.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod tray {
    use tauri::AppHandle;

    use crate::preferences::{NativeLabels, PreferencesError};

    pub(super) fn show(_app: &AppHandle, _labels: &NativeLabels) -> Result<(), PreferencesError> {
        Err(PreferencesError::TrayUnavailable)
    }

    pub(super) fn hide(_app: &AppHandle) {}

    pub(super) fn labels_received(_app: &AppHandle, _labels: &NativeLabels) -> bool {
        false
    }

    pub(super) fn resolve_quit(_app: &AppHandle) {}
}

/// The id of the macOS app menu's Quit item.
#[cfg(target_os = "macos")]
const APP_MENU_QUIT: &str = "charon-app-quit";

/// The macOS app menu: Tauri's default menu, whose Quit item (`Cmd+Q`) would
/// terminate at once, with that item replaced by one with the same title and
/// shortcut that asks the webview first, like the menu bar icon's Quit, so
/// `Cmd+Q` is draft-safe (ADR 0023). AppKit's own quit paths (the Dock menu,
/// logging out) still terminate directly: Tauri offers no hook to defer them.
#[cfg(target_os = "macos")]
pub fn app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};

    let menu = Menu::default(app)?;
    // The title AppKit gives the default item ("Quit Charon"); Rust adds no copy.
    let title = PredefinedMenuItem::quit(app, None)?.text()?;
    for entry in menu.items()? {
        let MenuItemKind::Submenu(submenu) = entry else {
            continue;
        };
        let position = submenu.items()?.iter().position(|item| {
            matches!(item, MenuItemKind::Predefined(predefined)
                if predefined.text().is_ok_and(|text| text == title))
        });
        if let Some(position) = position {
            let quit = MenuItem::with_id(app, APP_MENU_QUIT, &title, true, Some("CmdOrCtrl+Q"))?;
            submenu.remove_at(position)?;
            submenu.insert(&quit, position)?;
            break;
        }
    }
    Ok(menu)
}

/// Runs the draft-safe quit request for the app menu's Quit item.
#[cfg(target_os = "macos")]
pub fn handle_app_menu_event(app: &AppHandle, event: &tauri::menu::MenuEvent) {
    if event.id() == APP_MENU_QUIT {
        tray::request_quit(app);
    }
}

/// Stores the localized labels the webview rendered. The first call also
/// restores a persisted background mode, because the tray needs its labels.
#[tauri::command(async)]
pub fn shell_set_labels(app: AppHandle, labels: NativeLabels) -> Result<(), PreferencesIpcError> {
    labels.validate()?;
    *lock(&app.state::<ShellRuntime>().labels) = Some(labels.clone());
    if tray::labels_received(&app, &labels) {
        return Ok(());
    }
    if super::preferences::read_persisted(&app).is_ok_and(|preferences| preferences.background_mode)
    {
        // A failure leaves background mode inactive; Preferences reports it.
        let _ = enable_background(&app);
    }
    Ok(())
}

/// The webview found nothing unsent: Charon exits.
#[tauri::command(async)]
pub fn shell_quit(app: AppHandle) {
    tray::resolve_quit(&app);
    app.exit(0);
}

/// The webview kept unsent text: Charon stays and shows why.
#[tauri::command(async)]
pub fn shell_cancel_quit(app: AppHandle) {
    tray::resolve_quit(&app);
    let _ = crate::reveal_main(&app);
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod tray {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use tauri::image::Image;
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{TrayIcon, TrayIconBuilder};
    use tauri::{AppHandle, Emitter, Manager};

    use super::{lock, QuitGate, ShellRuntime};
    use crate::preferences::{NativeLabels, PreferencesError};

    const TRAY_ID: &str = "charon";
    const MENU_OPEN: &str = "charon-open";
    const MENU_QUIT: &str = "charon-quit";
    /// Emitted to the main webview when the tray asks Charon to quit.
    const QUIT_REQUESTED_EVENT: &str = "shell://quit-requested";
    /// A webview that never answers a quit request cannot keep Charon alive.
    const QUIT_WATCHDOG: Duration = Duration::from_secs(10);

    #[derive(Default)]
    pub(super) struct TrayState {
        icon: Mutex<Option<Tray>>,
        /// The webview listens for quit requests once it has sent its labels.
        bridge_ready: AtomicBool,
        quit: Mutex<QuitGate>,
    }

    /// Built once per process and then only shown or hidden, so its menu
    /// handler is registered exactly once.
    struct Tray {
        icon: TrayIcon,
        open: MenuItem<tauri::Wry>,
        quit: MenuItem<tauri::Wry>,
    }

    pub(super) fn show(app: &AppHandle, labels: &NativeLabels) -> Result<(), PreferencesError> {
        let runtime = app.state::<ShellRuntime>();
        let mut current = lock(&runtime.tray.icon);
        if let Some(tray) = current.as_ref() {
            return tray
                .icon
                .set_visible(true)
                .map_err(|_| PreferencesError::TrayUnavailable);
        }
        // Never build an icon-less (invisible) tray item: closing would then hide
        // Charon without a visible way back.
        let image = app
            .default_window_icon()
            .cloned()
            .ok_or(PreferencesError::TrayUnavailable)?;
        *current = Some(build(app, labels, image).map_err(|_| PreferencesError::TrayUnavailable)?);
        Ok(())
    }

    pub(super) fn hide(app: &AppHandle) {
        if let Some(tray) = lock(&app.state::<ShellRuntime>().tray.icon).as_ref() {
            let _ = tray.icon.set_visible(false);
        }
    }

    /// Marks the webview ready for quit requests and relabels an existing
    /// tray; false when none was built yet.
    pub(super) fn labels_received(app: &AppHandle, labels: &NativeLabels) -> bool {
        let runtime = app.state::<ShellRuntime>();
        runtime.tray.bridge_ready.store(true, Ordering::Release);
        let current = lock(&runtime.tray.icon);
        let Some(tray) = current.as_ref() else {
            return false;
        };
        let _ = tray.open.set_text(&labels.tray_open);
        let _ = tray.quit.set_text(&labels.tray_quit);
        let _ = tray.icon.set_tooltip(Some(&labels.tray_tooltip));
        true
    }

    fn build(app: &AppHandle, labels: &NativeLabels, image: Image<'_>) -> tauri::Result<Tray> {
        let open = MenuItem::with_id(app, MENU_OPEN, &labels.tray_open, true, None::<&str>)?;
        let quit = MenuItem::with_id(app, MENU_QUIT, &labels.tray_quit, true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &quit])?;
        let builder = TrayIconBuilder::with_id(TRAY_ID)
            .icon(image)
            .tooltip(&labels.tray_tooltip)
            .menu(&menu)
            // macOS menu bar items open their menu on click; Windows reveals
            // Charon on left click and shows the menu on right click.
            .show_menu_on_left_click(cfg!(target_os = "macos"))
            .on_menu_event(|app, event| {
                if event.id() == MENU_OPEN {
                    let _ = crate::reveal_main(app);
                } else if event.id() == MENU_QUIT {
                    request_quit(app);
                }
            });
        #[cfg(target_os = "windows")]
        let builder = builder.on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let _ = crate::reveal_main(tray.app_handle());
            }
        });
        let icon = builder.build(app)?;
        Ok(Tray { icon, open, quit })
    }

    /// Asks the webview to run its draft guard; it answers with `shell_quit`
    /// or `shell_cancel_quit`. Without a main window or a listening webview
    /// Charon exits. Runs on the main thread (menu events) and never waits.
    pub(super) fn request_quit(app: &AppHandle) {
        let runtime = app.state::<ShellRuntime>();
        let main = app.get_webview_window("main");
        let mut gate = lock(&runtime.tray.quit);
        let step = super::quit_step(
            main.is_some(),
            runtime.tray.bridge_ready.load(Ordering::Acquire),
            gate.pending(),
        );
        let generation = match step {
            super::QuitStep::Wait => return,
            super::QuitStep::Exit => {
                drop(gate);
                app.exit(0);
                return;
            }
            super::QuitStep::AskWebview => gate.request(),
        };
        drop(gate);
        let delivered = main.is_some_and(|main| main.emit(QUIT_REQUESTED_EVENT, ()).is_ok());
        if !delivered {
            lock(&runtime.tray.quit).resolve();
            app.exit(0);
            return;
        }
        let watchdog_app = app.clone();
        let _ = thread::Builder::new()
            .name("charon-quit-watchdog".to_owned())
            .spawn(move || {
                thread::sleep(QUIT_WATCHDOG);
                let expired =
                    lock(&watchdog_app.state::<ShellRuntime>().tray.quit).expired(generation);
                if expired {
                    watchdog_app.exit(0);
                }
            });
    }

    pub(super) fn resolve_quit(app: &AppHandle) {
        lock(&app.state::<ShellRuntime>().tray.quit).resolve();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_hides_on_macos_or_while_the_tray_exists() {
        assert!(hides_on_close(true, false));
        assert!(hides_on_close(true, true));
        assert!(hides_on_close(false, true));
        assert!(!hides_on_close(false, false));
    }

    #[test]
    fn a_resolved_quit_request_never_expires() {
        let mut gate = QuitGate::default();
        let generation = gate.request();
        gate.resolve();
        assert!(!gate.expired(generation));
    }

    #[test]
    fn a_newer_quit_request_supersedes_the_older_watchdog() {
        let mut gate = QuitGate::default();
        let first = gate.request();
        let second = gate.request();
        assert!(!gate.expired(first));
        assert!(gate.expired(second));
    }

    #[test]
    fn an_unanswered_quit_request_expires() {
        let mut gate = QuitGate::default();
        let generation = gate.request();
        assert!(gate.expired(generation));
    }

    #[test]
    fn a_quit_request_asks_the_webview_only_while_it_can_answer() {
        assert_eq!(quit_step(true, true, false), QuitStep::AskWebview);
        // Nothing listens yet, or the window is gone: nothing unsent can be lost.
        assert_eq!(quit_step(true, false, false), QuitStep::Exit);
        assert_eq!(quit_step(false, true, false), QuitStep::Exit);
        assert_eq!(quit_step(false, false, true), QuitStep::Exit);
        // A second request while the webview answers the first changes nothing.
        assert_eq!(quit_step(true, true, true), QuitStep::Wait);
    }

    #[test]
    fn an_answered_quit_request_lets_the_next_one_ask_again() {
        let mut gate = QuitGate::default();
        assert!(!gate.pending());
        gate.request();
        assert_eq!(quit_step(true, true, gate.pending()), QuitStep::Wait);
        gate.resolve();
        assert_eq!(quit_step(true, true, gate.pending()), QuitStep::AskWebview);
    }

    #[test]
    fn only_macos_and_windows_offer_the_tray() {
        let expected = if cfg!(any(target_os = "macos", target_os = "windows")) {
            TrayAvailability::Available
        } else {
            TrayAvailability::Unavailable
        };
        assert_eq!(tray_availability(), expected);
    }
}
