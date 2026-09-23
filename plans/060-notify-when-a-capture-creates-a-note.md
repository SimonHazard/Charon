# Plan 060: Offer an opt-in, content-free system notification when capture creates a Note

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 242d51e -- apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc apps/desktop/src-tauri/src/capture/model.rs apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/tests apps/desktop/src/app apps/desktop/src/bindings apps/desktop/src/lib/ipc apps/desktop/src/features/preferences apps/desktop/src/features/notes/note-screen.tsx apps/desktop/messages docs AGENTS.md README.md && git status --short -- apps/desktop docs AGENTS.md README.md`
> (without `..HEAD` the diff includes uncommitted edits). Expected drift, by
> earlier plans: **045** (`capture/model.rs`, `ipc/capture.rs`,
> `ipc/workspace.rs`, `tests/capture_contract.rs`, `bindings/capture.ts`,
> `capture-client.ts`, `providers.tsx`, `capture-status.ts`, `note-screen.tsx`,
> messages, `docs/UX.md`, `docs/PRODUCT.md`, `docs/PRIVACY.md`), **039**
> (`lib.rs`), **038/040/041/047/052** (`providers.tsx`,
> `preferences-panel.tsx`, messages, `docs/UX.md`, `AGENTS.md`),
> **042/046/049** (`note-screen.tsx`), **050/051** (`docs/UX.md`,
> `AGENTS.md`), the operator's macOS permission and ADR 0018 work
> (`AGENTS.md`, `docs/PRIVACY.md`, `docs/platform-support.md`, messages,
> `preferences-panel.tsx`), and backlog plans D (tray: `ipc/shell.rs`,
> `preferences/model.rs`, `shell-bridge.tsx`) and F (shortcuts:
> `ipc/capture.rs`, `preferences/model.rs`) if they landed first. Compare every
> "Current state" excerpt against the live code; any other mismatch is a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M for display-only (Option A); L with click-to-open (Option B)
- **Risk**: MED (desktop click handling is not provided by the Tauri plugin; OS permission state is not observable through it)
- **Depends on**: `plans/045-acknowledge-a-captured-note.md` (hard: `CaptureNoteOutcome::Created(id)`, `CaptureStatusEvent.note_id`, the `capture_note_created` key). Soft: plan 039 (`reveal_main`), backlog plan 059 (shared `NativeLabels`/`ipc/shell.rs`).
- **Category**: direction
- **Planned at**: commit `242d51e` plus the operator's uncommitted working tree, 2026-09-23

## Why this matters

Double-Shift capture is silent by contract (ADR 0006: no window, no focus
change), so a user who captures while working elsewhere gets no confirmation
until they next open Charon; plan 045 adds only an in-shelf acknowledgement at
that point. `docs/FEATURE_BACKLOG.md` ("Notifications système à la création
d'une Note") asks for an opt-in system notification whose click reopens
Charon on that Note. The request touches privacy (lock screens and OS
notification history keep what they show, outside Charon's erasure
guarantee) and a platform gap (Tauri's notification plugin has no desktop
click callback), so it needs a decision and a spike before code.

## Current state

- **Plan 045 must have landed.** Expected shape (verify with
  `grep -n "capture_note_created\|CaptureNoteOutcome" apps/desktop/src-tauri/src/ipc/*.rs`):
  `ipc/workspace.rs` returns
  `pub(crate) enum CaptureNoteOutcome { Created(String), Empty, WorkspaceClosed }`;
  `ipc/capture.rs` has `fn capture_statuses(outcome, warning) -> Vec<CaptureStatusEvent>`
  emitting `CaptureStatusEvent { message_key: "capture_note_created", note_id: Some(id) }`
  and a capped `VecDeque` of pending statuses emitted on main-window focus.
  The success path therefore already knows the new Note's random UUID and
  never its text.
- `apps/desktop/src-tauri/src/ipc/capture.rs:312-327` (pre-045 numbering) is
  the reveal-and-request pattern to mirror for opening a Note:

```rust
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
```

  and `:332-363` `emit_pending_composer_request` only emits once
  `composer_listener_ready` is true (set by `capture_composer_ready`,
  `:263-272`), re-queuing on emit failure.
- `apps/desktop/src-tauri/src/capture/model.rs:102-107`:
  `pub struct CaptureComposerRequest { pub request_id: u32 }` (ts-rs,
  exported by `tests/capture_contract.rs` `export_capture_bindings`).
- `apps/desktop/src/app/providers.tsx:93-138` `CaptureBridge` subscribes to
  `capture://composer-focus-requested` and `capture://status`, then calls
  `client.composerReady()`. `apps/desktop/src/app/composer-focus-context.tsx:1-33`
  is the request/consume context to mirror.
- `apps/desktop/src/features/notes/note-screen.tsx:215-225`:

```tsx
  const expandNote = useCallback(
    async (noteId: string) => {
      if (expandedId !== noteId && draftGuardRef.current && !(await draftGuardRef.current())) {
        return false;
      }
      setCopyState((current) => (current?.noteId === noteId ? null : current));
      setExpandedId(noteId);
      return true;
    },
    [expandedId],
  );
```

- Native preferences (`apps/desktop/src-tauri/src/preferences/model.rs:8-27`):
  schema v1, `#[serde(rename_all = "camelCase", deny_unknown_fields)]`,
  fields `schema_version`, `last_workspace_path`, `capture_hint_dismissed`.
  New fields must use `#[serde(default)]`. `ipc/preferences.rs:41-54` holds
  `preferences_read`/`preferences_reset` and the `with_install_kind` snapshot
  injection pattern. Theme, language, and update opt-in live in webview
  `localStorage` instead; this setting must be native because Rust decides at
  capture time, possibly while the window is hidden.
- **Tauri notification plugin facts** (docs:
  <https://v2.tauri.app/plugin/notification/>; source:
  <https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/src/desktop.rs>):
  - latest stable crate `tauri-plugin-notification` **2.4.0** (2026-08-31);
    not yet in `Cargo.lock` or the local registry.
  - Rust: `use tauri_plugin_notification::NotificationExt;`
    `app.notification().builder().title(..).body(..).show()`.
  - Desktop `permission_state()`/`request_permission()` **always return
    `Granted`**; the plugin cannot observe an OS-level denial.
  - **No click/action callback is wired on desktop**; `onAction` and
    `registerActionTypes` are mobile-only ("The Actions API is only available
    on mobile platforms").
  - Windows: "Only works for installed apps. Shows powershell name & icon in
    development." macOS: in development the plugin posts as
    `com.apple.Terminal`; bundled builds post as the app identifier.
  - Backend: `notify-rust ^4.11` (latest 4.18.0 depends on `zbus ^5`,
    compatible with the locked `zbus 5.18.0`; `mac-notification-sys` on macOS;
    `tauri-winrt-notification ^0.7` on Windows; optional
    `mac-usernotifications` on macOS).
  - `notification:default` grants the webview every notification command;
    this plan sends from Rust only and adds **no** webview permission
    (`apps/desktop/src/app/window-config.test.ts:45-64` pins the list).
- Privacy contract today: `docs/PRIVACY.md` "Local logs and diagnostics exclude
  Note bodies …" and the deletion section: Charon "cannot erase … copies the
  user or another process made". A notification containing Note text would
  create such a copy in OS notification history.
- `AGENTS.md`: "Every flow covers loading, empty, error, destructive, focus,
  active, disabled, and permission-denied states. Failures stay contextual,
  content-free, input-preserving, and actionable." and "All desktop copy goes
  through Paraglide" — Rust must receive notification text from React.
- `scripts/check-ipc-commands.ts` requires every registered command to be
  invoked from `apps/desktop/src/lib/ipc/*.ts`; `scripts/check-message-keys.ts`
  requires Rust `message_key` strings with `capture_`/`preferences_` prefixes
  to exist in `apps/desktop/messages/en.json`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Lockfile refresh (once, after adding a dependency) | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` | exit 0 |
| Bindings | `bun run bindings:generate && bun run bindings:check && bun run ipc:check` | exit 0 |
| Messages | `bun run messages:check` | exit 0 |
| Unit | `bun run --cwd apps/desktop test` | pass |
| Full | `bun run check` | exit 0 |
| Installed builds | `bun run tauri:build` | installers produced |

## Scope

**In scope**:
- `docs/adr/NNNN-capture-notifications.md` (create)
- `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock` (generated only)
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/ipc/{mod.rs,capture.rs,preferences.rs,notification.rs (create)}`; `ipc/shell.rs` only to add labels (or create it minimally if absent)
- `apps/desktop/src-tauri/src/capture/model.rs` (Option B request DTO only)
- `apps/desktop/src-tauri/src/preferences/{mod.rs,model.rs,error.rs}`
- `apps/desktop/src-tauri/tests/{preferences_contract.rs,capture_contract.rs,ipc_error_contract.rs}`
- generated `apps/desktop/src/bindings/{preferences.ts,capture.ts}`
- `apps/desktop/src/lib/ipc/{preferences-client.ts,capture-client.ts,capture-client.test.ts,shell-client.ts}`
- `apps/desktop/src/app/{providers.tsx,shell-bridge.tsx,shell-bridge.test.tsx,note-open-context.tsx (Option B)}`
- `apps/desktop/src/features/preferences/{preferences-context.tsx,preferences-panel.tsx,preferences-panel.test.tsx}`
- `apps/desktop/src/features/notes/{note-screen.tsx,note-screen.test.tsx}` (Option B)
- `apps/desktop/messages/{en.json,fr.json}`
- `docs/PRODUCT.md`, `docs/UX.md`, `docs/PRIVACY.md`, `docs/ARCHITECTURE.md`, `docs/platform-support.md`, `docs/FEATURE_BACKLOG.md`, `README.md`, `AGENTS.md`
- Test fakes and fixtures that implement `CaptureClient`/`NativePreferencesClient` or build `CaptureCapabilities`/`PreferencesSnapshot` literals (add the new members only; TypeScript will list them): `apps/desktop/src/components/shell.test.tsx`, `apps/desktop/src/features/notes/note-editor.test.tsx`, `apps/desktop/src/features/updates/update-context.test.tsx`, `apps/desktop/src/features/preferences/preferences-panel.test.tsx`

**Out of scope**:
- Any Note text, title, excerpt, Tag, Attachment name, or Workspace path in a
  notification (a later "show excerpt" option would need its own ADR because
  OS history escapes the permanent-delete guarantee).
- Notifications for anything other than a successful selected-text capture
  (manual composer, errors, updates, deletions).
- Sounds, badges, tray counters, notification actions other than the default
  click.
- Webview notification permissions or `@tauri-apps/plugin-notification`.
- Encoding the Note id in any OS-persisted payload (Windows toast `launch`
  arguments, Linux hints, macOS `userInfo`): the id may live only in
  in-process memory.

## Git workflow

- Branch: `codex/060-capture-notifications`
- Commits: `docs(adr): accept opt-in content-free capture notifications`,
  `feat(capture): notify after a captured note when enabled`,
  `feat(preferences): add the capture notification setting`,
  (Option B) `feat(capture): open the captured note from its notification`,
  `docs: document capture notifications`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Decision gate — draft the ADR and get operator approval (no code)

`ls docs/adr`, take the next free number, create
`docs/adr/NNNN-capture-notifications.md` with status `Proposed — pending the
Step 1 spike`. Decision draft:
1. Opt-in, default off, native preference, switchable in Preferences.
2. Only after a successful selected-text capture that created a Note, and
   only when the main window is not focused.
3. Fixed, localized, content-free text (title "Charon", body "Note
   captured."); never Note content, count, or source application.
4. Rate: at most one notification per 2 seconds; captures inside that window
   rely on plan 045's in-shelf acknowledgement.
5. Local OS notification APIs only; no network. The Note id stays in
   process memory.
6. Click behaviour: decided by the spike — Option A (platform default: at
   most activates Charon; no Note targeting) or Option B (click reveals
   Charon and opens that Note's editor on the platforms where the spike proves
   a click callback; Option A elsewhere).
7. Permission: Charon states plainly that it cannot verify whether the OS
   allows its notifications (unless the spike finds a reliable query) and
   says where to allow them.
8. Amends PRODUCT (job + capture journey), UX (Preferences, interaction
   states), PRIVACY (new "System notifications" section), AGENTS (one
   bullet).

Operator questions (with recommendation): approve ADR + spike (required);
A vs B (recommend deciding after the spike); rate limit 2 s (recommended);
notify when Charon is visible but unfocused (recommended: yes).

**Verify**: the ADR file exists and nothing else changed. **STOP and wait for
the operator's answer.** Declined → `BLOCKED: operator declined`.

### Step 1: Spike on a throwaway branch — go/no-go

Branch `spike/capture-notifications` from `main`; never merged. English
literals are allowed here only.

1. Display (Option A): add `tauri-plugin-notification = "=2.4.0"`, register
   `.plugin(tauri_plugin_notification::init())`, and after a successful
   capture call the builder with fixed text. Test **installed** builds
   (macOS `.app` from `bun run tauri:build` copied to /Applications; Windows
   NSIS install; Linux deb or AppImage on GNOME and KDE). Record per platform:
   shown?; attributed to Charon (name/icon)?; visible on the lock screen?;
   what a click does with Charon hidden (nothing / activates / relaunch via
   single-instance) and whether the window appears; behaviour after the user
   disables Charon's notifications in OS settings (silent? error returned by
   `show()`?).
2. Click probes (Option B), each isolated:
   - Linux: `notify-rust` (the version the plugin resolved; read it with
     `cargo tree -i notify-rust`) with `.action("default", "Open")`,
     `.show()?.wait_for_action(|action| …)` on one dedicated thread; check
     that a new notification can close the previous handle so at most one
     waiter thread exists.
   - Windows: `tauri-winrt-notification` `Toast::new(<app id>)…on_activated(…)`
     with the installed app's AppUserModelID; check the callback fires while
     Charon runs hidden, and what happens when the toast is clicked from the
     Action Center after Charon quit (must not target a Note).
   - macOS: `mac-notification-sys` `wait_for_click(true)` and, separately,
     notify-rust's optional `mac-usernotifications` backend; record which
     one reports a click for the ad-hoc local build and for a build signed
     with the ADR 0018 self-signed identity (if available), and whether the
     deprecated `NSUserNotification` path still displays on macOS 14/15.
3. Permission probe: does any backend expose a reliable "denied" state
   (e.g. `UNUserNotificationCenter` settings on macOS, Windows
   `ToastNotifier.Setting`)? Record API names only.
4. Linux daemon probe: with `zbus` (already a dependency), is
   `org.freedesktop.Notifications` owned on the session bus? Record for each
   desktop.
5. Record added crates (`cargo tree -e normal -i notify-rust`) and release
   binary size delta.

Go criteria for A: installed builds display the content-free notification on
macOS and Windows, and on at least one Linux desktop, without any crash when
no daemon exists. B is "go" per platform only where the click callback fires
reliably while Charon is hidden and needs no Note id in OS-persisted data.

**Verify**: result table complete ("not tested" + reason allowed). Report the
table with a recommended option per platform, then **STOP and wait**. No-go
for A → `BLOCKED: spike no-go (<reason>)`. Delete the spike branch.

### Step 2: Accept the ADR with the evidence

Status `Accepted on <date> by operator decision`; record the option per
platform, the permission wording, and the rate limit.

**Verify**: `grep -n "Accepted on" docs/adr/NNNN-capture-notifications.md` → 1.

### Step 3: Dependency

Option A: add `tauri-plugin-notification = "=2.4.0"` (or the exact version
the spike validated) and `.plugin(tauri_plugin_notification::init())` in
`lib.rs`. Option B additionally adds, exactly pinned, only the backend crates
the spike proved (platform-targeted `[target.'cfg(...)'.dependencies]`
sections), and those platforms bypass the plugin. Run the lockfile refresh
once. Do **not** touch `capabilities/main.json`.

**Verify**: `cargo check` → exit 0; `git diff --stat apps/desktop/src-tauri/Cargo.lock`
shows only the crates recorded in the spike; `bun run --cwd apps/desktop test -- src/app/window-config.test.ts` → pass (capabilities unchanged).

### Step 4: Preference and labels

- `preferences/model.rs`: add `#[serde(default)] pub capture_notifications: bool`
  to `PersistedPreferences` (default `false`), the same field to
  `PreferencesSnapshot`, and `pub fn set_capture_notifications(root, enabled)`
  in `preferences/mod.rs` (modelled on `remember_workspace`, `mod.rs:15-27`).
- Labels: if `NativeLabels` already exists (plan 059), add
  `notification_title` and `notification_body` (and `notification_open` for
  Option B's Linux action label). Otherwise create
  `pub struct NativeLabels { pub notification_title: String, pub notification_body: String }`
  (ts-rs, camelCase) with `validate()` (non-empty after trim, ≤ 64 scalars,
  no control characters → `PreferencesError::InvalidValue`), exported in
  `tests/preferences_contract.rs`.
- If `ipc/shell.rs` exists, extend `shell_set_labels`; otherwise create
  `ipc/shell.rs` with `#[derive(Default)] pub struct ShellRuntime { labels: Mutex<Option<NativeLabels>> }`,
  `pub fn labels(app) -> Option<NativeLabels>`, and
  `#[tauri::command(async)] pub fn shell_set_labels(app, labels: NativeLabels) -> Result<(), PreferencesIpcError>`;
  `.manage` it and register the command in `lib.rs`.
- `ipc/preferences.rs`: `preferences_set_capture_notifications(app, enabled: bool) -> Result<PreferencesSnapshot, PreferencesIpcError>`
  persists, then updates the runtime flag (Step 5), then returns the snapshot.
- Tests: an old v1 file without the field loads `false`; round trip `true`;
  labels validation boundaries.

**Verify**: Rust command → exit 0; `bun run bindings:generate && bun run bindings:check` → exit 0.

### Step 5: Notification adapter (`ipc/notification.rs`)

Create the module (application-layer adapter, not a domain module):

```rust
pub const MIN_INTERVAL_MS: u64 = 2_000;

#[derive(Default)]
pub struct NotificationRuntime {
    enabled: AtomicBool,
    last_shown_ms: Mutex<Option<u64>>,
}

/// Pure and unit-tested.
pub(crate) fn should_notify(enabled: bool, main_focused: bool, has_labels: bool,
                            last_shown_ms: Option<u64>, now_ms: u64) -> bool {
    enabled && !main_focused && has_labels
        && last_shown_ms.is_none_or(|last| now_ms.saturating_sub(last) >= MIN_INTERVAL_MS)
}

pub fn notify_capture(app: &AppHandle, note_id: &str) { /* see below */ }
```

(`Option::is_none_or` needs Rust ≥ 1.82; the toolchain is 1.91.0.)

- `.manage(ipc::notification::NotificationRuntime::default())`; at the end
  of `setup`, load `enabled` from `ipc::preferences::read_persisted(app)`
  (errors → `false`); `preferences_set_capture_notifications` updates it.
- `notify_capture`: compute `main_focused` from
  `app.get_webview_window("main").map(|w| w.is_focused().unwrap_or(false))`;
  use a monotonic clock (`Instant` stored as elapsed ms since the runtime was
  created); if `should_notify` → Option A:
  `app.notification().builder().title(&labels.notification_title).body(&labels.notification_body).show()`;
  ignore the `Result` (content-free: no log, no status). Record
  `last_shown_ms` only when `show()` returned `Ok`.
  `note_id` is unused in Option A (prefix it `_note_id`); in Option B it is
  captured by the click closure only.
- Call it from `ipc/capture.rs` in the success branch that plan 045 created,
  right after the statuses are remembered:
  `if let Ok(CaptureNoteOutcome::Created(id)) = &outcome { super::notification::notify_capture(app, id); }`
  (adapt to the exact variable names 045 used; do not restructure 045's code).
- Unit tests for `should_notify`: disabled, focused, missing labels, first
  notification, inside and at the 2 000 ms boundary.

**Verify**: Rust command → exit 0; `grep -n "notify_capture" apps/desktop/src-tauri/src/ipc/capture.rs` → 1.

### Step 6 (Option B only): open the Note from a click

Skip entirely under Option A.

- `capture/model.rs`: `pub struct CaptureNoteOpenRequest { pub request_id: u32, pub note_id: String }`
  (ts-rs camelCase), exported in `tests/capture_contract.rs`.
- `ipc/capture.rs`: `pending_note_open: Mutex<Option<CaptureNoteOpenRequest>>`
  in `CaptureRuntime`; `pub fn open_note_from_notification(app, note_id: String)`:
  reject unless `uuid::Uuid::parse_str(&note_id).is_ok()`; reveal the main
  window (`crate::reveal_main` if plan 039 made it available, else the three
  calls in the excerpt above); store the request with a fresh request id;
  emit `capture://note-open-requested` through a copy of
  `emit_pending_composer_request`'s ready/requeue logic. Also emit pending
  note-open requests from `capture_composer_ready`.
- Backends: wire the click callback the spike proved on each platform to
  `open_note_from_notification`, keeping at most one waiting thread/handle
  (closing the previous notification's handle first). Platforms without a
  proven callback stay on Option A.
- React: `capture-client.ts` `subscribeNoteOpen(listener)`;
  `src/app/note-open-context.tsx` mirroring `composer-focus-context.tsx`;
  `CaptureBridge` subscribes before `composerReady()`. In `note-screen.tsx`,
  consume the request: if the Note is absent from `snapshot.notes`, call
  `refreshWorkspace()` once; if present, `await expandNote(noteId)` then focus
  the editor textarea on the next frame (see `focusAttachments` at
  `note-screen.tsx:227-241` for the double-`requestAnimationFrame` pattern);
  if `expandNote` returns `false` (dirty draft), announce
  `m.capture_note_open_blocked()`; if the Note is still absent, announce
  `m.capture_note_open_missing()`. Never change status, filters, or content.
- Catalogs: `capture_note_open_blocked` "Save or close the open note first." /
  "Enregistrez ou fermez d’abord la note ouverte.";
  `capture_note_open_missing` "That note is no longer available." /
  "Cette note n’est plus disponible.".
- Tests: `capture-client.test.ts` payload shape; `note-screen.test.tsx`:
  request for a present Note expands it; absent Note triggers one refresh then
  announces; dirty draft announces and keeps the current editor.

**Verify**: `bun run ipc:check && bun run messages:check` → exit 0; unit tests pass.

### Step 7: React label push and Preferences toggle

- `shell-bridge.tsx`: if it exists, add `notificationTitle: m.notification_capture_title()`
  and `notificationBody: m.notification_capture_body()` to its `setLabels`
  call; otherwise create it (label push on mount and on locale change only)
  plus `src/lib/ipc/shell-client.ts` with `setLabels`, and mount it in
  `providers.tsx` beside `CaptureBridge`.
- `preferences-client.ts`: `setCaptureNotifications(enabled)`.
- `preferences-context.tsx`: `setCaptureNotifications` with pending + `errorKey`
  (pattern `:101-114`); default `captureNotifications: false`.
- `preferences-panel.tsx`, Capture section (after the permission rows): an
  `aria-pressed` toggle modelled on the updates toggle (`:370-378`), the
  description, and a persistent (not Tooltip-only) line:
  `m.preferences_notifications_unverified()`.
- Copy (EN / FR):
  `notification_capture_title` "Charon" / "Charon";
  `notification_capture_body` "Note captured." / "Note capturée.";
  `preferences_notifications` "Capture notifications" / "Notifications de capture";
  `preferences_notifications_description` "Show a system notification when double Shift creates a note. It never includes the note’s text." / "Afficher une notification système quand le double Maj crée une note. Elle n’inclut jamais le texte de la note.";
  `preferences_notifications_enable` / `_disable` "Turn on" / "Turn off", "Activer" / "Désactiver";
  `preferences_notifications_unverified` "Charon can’t check whether your system allows its notifications. If none appear, allow Charon in your system’s notification settings." / "Charon ne peut pas vérifier si votre système autorise ses notifications. Si aucune n’apparaît, autorisez Charon dans les réglages de notifications du système.".
  If the spike found a reliable denial query, replace the unverified line with
  a real `denied` state using the existing `preferences_state_denied` label.
- Tests (`preferences-panel.test.tsx`): toggle reflects `aria-pressed` and
  calls the client; failure shows an inline alert and keeps the toggle off;
  the unverified line is visible without hovering.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences src/app` → pass; `bun run messages:check` → exit 0.

### Step 8: Contracts and documentation

- `docs/PRIVACY.md`: new `## System notifications` section: opt-in, default
  off; fixed text only; OS notification centers may keep history and show it
  on lock screens, which is why no Note content is ever included; the Note id
  stays in process memory; no network.
- `docs/PRODUCT.md`: Jobs bullet; in "### Selected-text capture", one sentence
  on the optional notification (and Option B click behaviour where
  available).
- `docs/UX.md`: Preferences contents sentence; feature-map row; interaction
  states: the "permission-denied" bullet gains "notifications: Charon cannot
  verify OS permission and says where to allow it".
- `docs/ARCHITECTURE.md`: under "### Update integration", a sibling
  paragraph "### System notifications" (application adapter, receives only a
  UUID and localized labels).
- `docs/platform-support.md`: per-platform result from the spike (installed
  Windows builds only; macOS attribution; Linux daemon requirement).
- `AGENTS.md` (Product and privacy invariants): "Capture notifications are
  opt-in, default off, content-free, rate-limited, and local; the Note id
  never enters OS-persisted notification data."
- `README.md` Features; `docs/FEATURE_BACKLOG.md` item status.

**Verify**: `grep -n "System notifications" docs/PRIVACY.md` → 1; `bun run check` → exit 0.

### Step 9: Native smoke (installed builds)

For each platform: enable; capture in another app with Charon hidden → one
notification with only the fixed text; two captures within 2 s → one
notification; Charon focused → none; disable → none; OS notifications off for
Charon → no crash, Preferences still shows the unverified line. Option B:
click → Charon reveals and opens that Note's editor; click after deleting
that Note → "no longer available" message, nothing else changes; click with a
dirty editor → blocked message, draft kept. Record verified/unverified per
row in the PR body; delete `apps/desktop/src-tauri/target/debug` afterwards.

## Test plan

- Rust: preferences default/round-trip/labels tests; `should_notify` table;
  Option B: UUID rejection unit test for `open_note_from_notification`'s
  validation helper (extract it as a pure fn).
- TypeScript: `preferences-panel.test.tsx`, `shell-bridge.test.tsx`,
  `capture-client.test.ts`, `note-screen.test.tsx` (Option B).
- Structural patterns: `src/app/capture-status.test.ts`,
  `tests/capture_contract.rs` serialization test
  (`capture_contract_serialization_has_stable_names`).

## Done criteria

- [ ] ADR `NNNN-capture-notifications.md` `Accepted` with the spike table
- [ ] Rust fmt/clippy/test exit 0; `bun run check` exit 0
- [ ] `bun run bindings:check && bun run ipc:check && bun run messages:check` exit 0
- [ ] `grep -rn "notification:" apps/desktop/src-tauri/capabilities` → 0
- [ ] `grep -rn "body(" apps/desktop/src-tauri/src/ipc/notification.rs` shows only `labels.notification_body`
- [ ] Step 9 recorded per platform
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 045 has not landed (no `capture_note_created` in `apps/desktop/src-tauri/src/ipc/capture.rs`).
- The operator has not approved Step 0 or not answered Step 1.
- Any path would put Note text, a count, or the Note id into a notification
  payload persisted by the OS.
- The chosen backend requires a webview capability, a network request, or a
  helper process.
- A click on a stale notification could change, delete, or create a Note.

## Maintenance notes

- If backlog plan 059 (tray) lands later, it adds its tray labels to the same
  `NativeLabels` and reuses `ipc/shell.rs`; with Charon in the background, a
  notification click (Option B) reveals the hidden window through the same
  `reveal_main`.
- The macOS `NSUserNotification` path used by `mac-notification-sys` is
  deprecated by Apple; revisit if macOS stops displaying it (spike notes).
- Reviewer: grep the diff for any string built from a Note, snapshot, or
  capture body reaching `ipc/notification.rs`; confirm the rate limit and the
  focused-window suppression.
