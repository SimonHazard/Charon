# ADR 0024: Opt-in, content-free capture notifications

## Status

Accepted on 2026-10-02 (operator asked to complete the plan queue); native
spike evidence pending operator verification. Amends `docs/PRODUCT.md` (a new
job and the selected-text capture journey), `docs/UX.md` (Preferences contents,
feature map, permission-denied state), `docs/PRIVACY.md` (a new "System
notifications" section and the preferences contents), `docs/ARCHITECTURE.md`,
`docs/platform-support.md`, and `AGENTS.md` (one privacy invariant). Builds on
plan 045's `CaptureNoteOutcome::Created` and in-shelf acknowledgement, and
reuses ADR 0023's `NativeLabels` and `shell_set_labels`.

## Context

Double-Shift capture is silent by contract (ADR 0006: no window, no focus
change), so a user who captures while working elsewhere gets no confirmation
until they next open Charon; plan 045 acknowledges the Note only inside the
shelf. `docs/FEATURE_BACKLOG.md` asks for an opt-in system notification whose
click reopens Charon on that Note.

Two facts shape the decision. First, operating-system notification centers
keep a history and may show notifications on the lock screen; anything a
notification contains escapes Charon's permanent-delete guarantee. Second, the
official `tauri-plugin-notification` (2.4.0, the newest 2.x release; 3.0 is an
alpha) wires no click or action callback on desktop and cannot observe an
OS-level denial: its desktop `permission_state()` and `request_permission()`
always return `Granted`. A click that opens a Note would need non-official
backend crates (`notify-rust` actions on Linux, `tauri-winrt-notification`
activation on Windows, `mac-notification-sys` click waits on macOS), which the
operator ruled out for now in favour of the official Tauri API.

## Decision

1. Capture notifications are opt-in, **off by default**, stored as
   `captureNotifications` in native preferences (schema v1,
   `#[serde(default)]`), and switchable at any time in Preferences' Capture
   group wherever double Shift can create a Note (never on Wayland, which makes
   no double-Shift claim). The setting is native because Rust decides at
   capture time, possibly while the window is hidden.
2. A notification follows **only** a successful selected-text capture that
   created a Note (`CaptureNoteOutcome::Created`), and only while the main
   window is **not focused**: hidden, minimized, or visible behind another
   application. Manual composer Notes, errors, updates, and deletions never
   notify.
3. The text is fixed, localized, and content-free: title "Charon", body "Note
   captured." ("Note capturée."). It never contains Note text, a title, Tags,
   Attachment names, a count, the source application, or a path. React renders
   both strings through Paraglide and sends them with the existing
   `shell_set_labels` (`NativeLabels.notificationTitle` and
   `notificationBody`, validated like the tray labels); Rust hardcodes no copy.
4. Rate: at most one notification per **2 seconds**, measured on a monotonic
   clock; captures inside that window rely on plan 045's in-shelf
   acknowledgement.
5. **Option A on every platform**: the notification is shown from Rust through
   the official plugin, pinned at `=2.4.0`, and its click keeps the platform
   default (at most activating Charon). No Note is targeted, the Note's id
   never reaches the notification adapter, and nothing is encoded in
   OS-persisted notification data. Option B (click opens the Note) is rejected
   for now because it needs non-official crates.
6. Only local OS notification services are used (the macOS notification
   center, Windows toasts, the freedesktop notification service over the local
   D-Bus session bus); no network or push service. The webview receives no
   `notification:` permission and no `@tauri-apps/plugin-notification`
   package; the only new command is `preferences_set_capture_notifications`.
7. Permission: Charon states plainly, in a persistent line beside the toggle,
   that it cannot verify whether the operating system allows its notifications,
   and says to allow Charon in the system's notification settings if none
   appear. It never shows a "granted" or "denied" state it cannot observe.
8. Failures are silent and content-free: the plugin's result is ignored and
   never logged. On Linux, a missing session bus or notification daemon simply
   shows nothing. A failure never affects the capture, the saved Note, or the
   in-shelf acknowledgement.

## Spike evidence

Observed on the operator's Apple Silicon Mac (macOS 26.6.2), in the working
tree, without `tauri build` and without system permission prompts:

| Check | Result |
| --- | --- |
| Crate resolution | `tauri-plugin-notification 2.4.0` (newest 2.x; requires `tauri ^2.10`) resolves with `tauri =2.11.5` |
| `Cargo.lock` delta | 13 new packages: `tauri-plugin-notification 2.4.0`, `notify-rust 4.18.1`, `mac-notification-sys 0.6.15`, `tauri-winrt-notification 0.8.1`, `windows 0.62.2` with `windows-collections 0.3.2`, `windows-future 0.3.2`, `windows-numerics 0.3.1`, `windows-threading 0.2.1` (Windows only), `rand 0.9.5`, `rand_chacha 0.9.0`, `rand_core 0.9.5`, `ppv-lite86 0.2.21`. Linux reuses the already locked `zbus 5.18.0` |
| Backend per target (`cargo tree --target … -p notify-rust`) | macOS `mac-notification-sys`; Windows (`x86_64-pc-windows-msvc`) `tauri-winrt-notification`; Linux (`x86_64-unknown-linux-gnu`) `zbus` |
| Plugin source, desktop (`src/desktop.rs` 2.4.0) | `permission_state()`/`request_permission()` always return `Granted`; `show()` spawns the backend call on Tauri's async runtime, discards its result, and returns `Ok` before delivery, so neither an OS denial nor a missing Linux daemon is observable; no desktop click or action callback exists |
| Attribution (plugin source) | macOS: posts as `com.apple.Terminal` under `tauri dev` and as `dev.simonhazard.charon` in a bundled build (only if Launch Services knows that identifier); Windows: the app identifier is used as AppUserModelID only outside `target/debug` and `target/release`, otherwise PowerShell's name and icon |
| macOS backend (`mac-notification-sys` source) | uses the deprecated `NSUserNotificationCenter` with an `NSBundle` identifier hook; a fire-and-forget send waits up to 2 s for delivery confirmation on the plugin's async worker, not on the capture worker |
| Linux backend safety | `zbus` is built with `async-io` and without its `tokio` feature, so the backend's blocking D-Bus call inside Tauri's async worker cannot hit a nested-runtime panic; its errors are discarded by the plugin |
| Webview side effect (plugin source) | `init()` also injects the plugin's `window.Notification` shim; with no `notification:` permission and its commands stripped (see the launch row), its startup permission query is rejected (console only) and any Web Notification call fails. Charon's UI never uses the Web Notification API |
| Compile and tests | `cargo clippy --all-targets -D warnings` and `cargo test` pass on macOS, including the `should_notify` table (disabled, focused, unlabelled, first, inside and at the 2 000 ms boundary) |
| `tauri dev` launch (on port 1421 through a CLI `--config` override, because another project's dev server held port 1420; capture notifications off, the default, and the operator's preferences untouched) | built and launched; `removeUnusedCommands` reported "Removed unused commands from notification: notify, request_permission, is_permission_granted", so the webview cannot reach any plugin command; the app was still running after about 40 s and the log shows no panic. No notification was shown or expected, and the window was not inspected (no screen inspection) |
| macOS display, attribution, lock screen, click with Charon hidden, behaviour once the user turns Charon's notifications off | not tested: needs a bundled app, a double-Shift capture with granted permissions, and enabling the setting in the operator's real preferences (operator to verify); whether macOS 26 still displays `NSUserNotification` posts is unknown |
| Windows installed NSIS/MSI build: display, attribution, Action Center click after quit | not tested: no Windows hardware (operator to verify) |
| Linux GNOME and KDE (X11), and a session without a notification daemon | not tested: no Linux machine (operator to verify) |
| Reliable "denied" query | none through the plugin; OS APIs exist (`UNUserNotificationCenter` notification settings on macOS, `ToastNotifier.Setting` on Windows) but need non-official crates, so not used (Decision 7) |
| Option B click probes | not run: Option B rejected by operator decision (non-official crates) |
| Release binary size delta | not measured: needs `tauri build` (operator to verify) |

## Consequences

- `PreferencesSnapshot` gains `captureNotifications`, `NativeLabels` gains
  `notificationTitle` and `notificationBody`, and the app manifest, capability,
  and `generate_handler!` gain `preferences_set_capture_notifications` (19
  custom commands). Reset turns the setting off at once. As with ADR 0023, a
  manual downgrade to a build without the field treats the preferences file as
  corrupt, backs it up, and falls back to defaults; the updater never
  downgrades.
- `ipc/notification.rs` is an application-layer adapter. The capture worker
  calls `notify_capture(app)` with no Note value; the adapter reads the opt-in
  flag, the main window's focus, the rate limit, and the labels. Before the
  webview has sent its labels after launch, a capture shows no notification.
- macOS development builds post as Terminal and Windows development builds as
  PowerShell; only installed builds show Charon's name. The macOS backend
  depends on a deprecated Apple API and may stop displaying in a future macOS.
- Notifications are local, so the desktop's only network request remains the
  opt-in update check (ADR 0016).

## Revisit when

- An official Tauri release wires a desktop click callback or a real
  permission query; then Option B (reveal Charon and open that Note's editor,
  holding the id only in memory, rejecting stale or unknown ids, and never
  changing Note state) or an honest denied state can be reconsidered.
- macOS stops displaying `NSUserNotification` posts, or the plugin moves to
  `UNUserNotificationCenter`.
- A future "show excerpt" option is requested: it needs its own ADR because OS
  notification history escapes the permanent-delete guarantee.
- The operator's native checks contradict a row above.
