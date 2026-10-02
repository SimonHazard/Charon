//! The opt-in, content-free capture notification (ADR 0024).
//!
//! An application-layer adapter, like the tray and the update integration, not
//! a domain module. After a selected-text capture created a Note, it shows one
//! fixed, localized notification through the official notification plugin, at
//! most once per [`MIN_INTERVAL_MS`] and only while the main window is not
//! focused. It never receives the Note's text, id, count, or source
//! application, and a click keeps the platform default: no Note is targeted.
//! The webview holds no notification permission; only Rust shows it.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Instant;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::preferences::NativeLabels;

/// Captures closer together than this rely on the in-shelf acknowledgement.
pub const MIN_INTERVAL_MS: u64 = 2_000;

pub struct NotificationRuntime {
    enabled: AtomicBool,
    last_shown_ms: Mutex<Option<u64>>,
    started_at: Instant,
}

impl Default for NotificationRuntime {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            last_shown_ms: Mutex::new(None),
            started_at: Instant::now(),
        }
    }
}

/// Whether a capture that just created a Note may show the notification.
pub(crate) fn should_notify(
    enabled: bool,
    main_focused: bool,
    has_labels: bool,
    last_shown_ms: Option<u64>,
    now_ms: u64,
) -> bool {
    enabled
        && !main_focused
        && has_labels
        && last_shown_ms.is_none_or(|last| now_ms.saturating_sub(last) >= MIN_INTERVAL_MS)
}

/// Restores the persisted choice at launch; an unreadable file keeps it off.
pub fn load(app: &AppHandle) {
    let enabled = super::preferences::read_persisted(app)
        .is_ok_and(|preferences| preferences.capture_notifications);
    set_enabled(app, enabled);
}

pub fn set_enabled(app: &AppHandle, enabled: bool) {
    app.state::<NotificationRuntime>()
        .enabled
        .store(enabled, Ordering::Release);
}

/// Called by the capture worker once a selected-text capture created a Note.
/// Every failure is ignored without a log or status: the in-shelf
/// acknowledgement still follows when Charon is next revealed.
pub fn notify_capture(app: &AppHandle) {
    let runtime = app.state::<NotificationRuntime>();
    let enabled = runtime.enabled.load(Ordering::Acquire);
    if !enabled {
        return;
    }
    // Never `is_focused`: it waits for the main thread, which may be waiting
    // for this capture worker while Charon quits.
    let main_focused = super::shell::main_focused(app);
    let labels = super::shell::labels(app);
    let mut last_shown_ms = runtime
        .last_shown_ms
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    let now_ms = u64::try_from(runtime.started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
    if !should_notify(
        enabled,
        main_focused,
        labels.is_some(),
        *last_shown_ms,
        now_ms,
    ) {
        return;
    }
    if labels.is_some_and(|labels| show(app, &labels).is_ok()) {
        *last_shown_ms = Some(now_ms);
    }
}

/// Only the fixed labels the webview rendered reach the operating system.
fn show(app: &AppHandle, labels: &NativeLabels) -> tauri_plugin_notification::Result<()> {
    app.notification()
        .builder()
        .title(&labels.notification_title)
        .body(&labels.notification_body)
        .show()
}

#[cfg(test)]
mod tests {
    use super::{should_notify, MIN_INTERVAL_MS};

    #[test]
    fn notifies_only_when_enabled_unfocused_and_labelled() {
        assert!(should_notify(true, false, true, None, 0));
        assert!(!should_notify(false, false, true, None, 0));
        assert!(!should_notify(true, true, true, None, 0));
        assert!(!should_notify(true, false, false, None, 0));
    }

    #[test]
    fn shows_at_most_one_notification_per_interval() {
        assert!(!should_notify(true, false, true, Some(1_000), 1_000));
        assert!(!should_notify(
            true,
            false,
            true,
            Some(1_000),
            1_000 + MIN_INTERVAL_MS - 1
        ));
        assert!(should_notify(
            true,
            false,
            true,
            Some(1_000),
            1_000 + MIN_INTERVAL_MS
        ));
        assert!(should_notify(true, false, true, Some(1_000), u64::MAX));
    }

    #[test]
    fn a_clock_behind_the_last_notification_never_notifies_early() {
        assert!(!should_notify(true, false, true, Some(5_000), 4_000));
    }

    #[test]
    fn the_rate_limit_is_two_seconds() {
        assert_eq!(MIN_INTERVAL_MS, 2_000);
    }
}
