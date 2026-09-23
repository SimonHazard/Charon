# Plan 061: Let users choose the reveal-and-focus-composer shortcut (double Shift stays fixed)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 242d51e -- apps/desktop/src-tauri/src/capture apps/desktop/src-tauri/src/ipc/capture.rs apps/desktop/src-tauri/src/ipc/preferences.rs apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests apps/desktop/src/bindings apps/desktop/src/lib apps/desktop/src/features/preferences apps/desktop/messages docs AGENTS.md README.md && git status --short -- apps/desktop docs AGENTS.md README.md`
> (without `..HEAD` the diff includes uncommitted edits). Expected drift, by
> earlier plans: the operator's uncommitted macOS permission work
> (`capture/coordinator.rs` `request_permission`, `capture/error.rs`
> `SettingsOpenFailed`, `macos/mod.rs`, `macos/permissions.rs`,
> `tests/capture_contract.rs`, `tests/ipc_error_contract.rs`,
> `preferences-panel.tsx`, messages, `docs/UX.md`), ADR 0018 work (`AGENTS.md`,
> `docs/PRIVACY.md`, `docs/platform-support.md`), **045** (`capture/model.rs`,
> `ipc/capture.rs`, `tests/capture_contract.rs`, `bindings/capture.ts`,
> `lib/ipc/capture-client.ts`, messages, docs), **039** (`lib.rs`),
> **038/040/041/047/052** (`preferences-panel.tsx`, messages, `docs/UX.md`,
> `AGENTS.md`), **046** (messages, `docs/UX.md` keyboard contract),
> **050/051** (`docs/UX.md`, `AGENTS.md`), and backlog plans D/E
> (`preferences/model.rs`, `ipc/preferences.rs`) if they landed first. Compare
> every "Current state" excerpt against the live code; any other mismatch is a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (global registration runs on the main thread; conflict detection is platform-dependent)
- **Depends on**: none hard. Coordinate with plan 045 (same `capture` files) and plan 046 (keyboard contract text).
- **Category**: direction
- **Planned at**: commit `242d51e` plus the operator's uncommitted working tree, 2026-09-23

## Why this matters

`Cmd+Shift+Space` (macOS) and `Alt+Shift+Space` (Windows/X11) are hardcoded;
when another app or the desktop already owns them, the reveal-and-focus
shortcut silently fails and the user cannot pick another one.
`docs/FEATURE_BACKLOG.md` ("Reconfigurer les raccourcis de capture") asks for
choosing it in Preferences, with validation, conflict handling, reset to
default, and honest per-platform limits. `docs/PRODUCT.md` lists a
"configurable shortcut catalog" as a non-goal and ADR 0011 removed the old
catalog, so a new ADR must narrowly permit **one** user-chosen accelerator for
this **one** action before any code. Double Shift is not configurable in this
plan.

## Current state

- `apps/desktop/src-tauri/src/capture/coordinator.rs:6-14`:

```rust
pub const DEFAULT_CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
pub fn composer_shortcut(platform: PlatformKind) -> &'static str {
    match platform {
        PlatformKind::Windows | PlatformKind::LinuxX11 | PlatformKind::LinuxWayland => {
            "Alt+Shift+Space"
        }
        _ => DEFAULT_CAPTURE_SHORTCUT,
    }
}
```

- `coordinator.rs:17-23` `trait ShortcutPort { register(&mut self, &str), unregister(&mut self, &str), current_state(&self) -> Option<(CapabilityState, String)> }`;
  `:53-74` `new` sets `active_shortcut: composer_shortcut(platform.platform()).to_owned()`;
  `:76-88` `initialize` registers `active_shortcut` and sets
  `standard_shortcut` to `Available` or `Error`; `:151-159` `shutdown`
  unregisters `active_shortcut`; `:193-205` `refresh_platform_states` lets the
  Wayland portal override `standard_shortcut` and `active_shortcut`.
- `apps/desktop/src-tauri/src/capture/model.rs:40-51` `CaptureCapabilities { platform, standard_shortcut, input_monitoring, accessibility, double_shift, selected_text, active_shortcut }` (ts-rs camelCase).
- `apps/desktop/src-tauri/src/capture/error.rs:7-12` already has
  `InvalidShortcut` → `("invalid_shortcut", "capture_error_invalid_shortcut")`,
  `ShortcutRegistration`, `ShortcutUnregistration`; `InvalidShortcut` has no
  live producer since ADR 0011. Catalog text (`messages/en.json:136-138`):
  "That shortcut is not valid. The previous shortcut remains active." /
  "The shortcut is already used or could not be registered. The visible
  capture command still works." / "The previous shortcut could not be removed
  safely. Retry before changing it."
- `apps/desktop/src-tauri/src/ipc/capture.rs:108-150` `TauriShortcutPort`:
  on Wayland `register` ignores the string and starts the portal session;
  elsewhere it calls `GlobalShortcut::register(shortcut)`. `:152-196`
  `initialize` builds the coordinator and calls `initialize()` while holding
  the coordinator mutex. `:418-430` `with_coordinator` locks that mutex.
- `apps/desktop/src-tauri/src/lib.rs:47-61` installs
  `tauri_plugin_global_shortcut` only when not on Wayland, with a handler that
  calls `ipc::capture::handle_global_shortcut` on `Pressed`.
- `tauri-plugin-global-shortcut 2.3.2`
  (`~/.cargo/registry/src/index.crates.io-*/tauri-plugin-global-shortcut-2.3.2/src/lib.rs:88-102,131-141,182-191`):
  `register`/`unregister` parse the string, then run the OS call **on the main
  thread** (`run_on_main_thread` + blocking `recv`). Errors collapse into
  `Error::GlobalHotkey(String)`. `tauri-runtime-wry 2.11.4`
  `send_user_message` (`src/lib.rs:235-255`) runs the task inline when already
  on the main thread. Docs: <https://v2.tauri.app/plugin/global-shortcut/>.
- `global-hotkey 0.8.0` parser (`src/hotkey.rs:168-230`): modifiers
  `OPTION|ALT`, `CONTROL|CTRL`, `COMMAND|CMD|SUPER`, `SHIFT`,
  `CMDORCTRL` (Super on macOS, Control elsewhere); exactly one key, last;
  keys are **physical** `Code`s (`KeyA`/`A`, `Digit0`/`0`, `Space`, `F1`…).
  Conflict behaviour: Windows `RegisterHotKey` failing with
  `ERROR_HOTKEY_ALREADY_REGISTERED` → `AlreadyRegistered`
  (`platform_impl/windows/mod.rs:96-104`); X11 `BadAccess` →
  `AlreadyRegistered` (`platform_impl/x11/mod.rs:150-166`); macOS
  `RegisterEventHotKey(…, 0, …)` (`platform_impl/macos/mod.rs:114-129`) fails
  only on an OS error and generally **succeeds even when another app or a
  system shortcut uses the same combination**, so conflicts are not
  detectable there.
- Wayland: `capture/platform/linux/portal.rs:200-206` binds one shortcut
  `composer` with `preferred_trigger` `ALT+SHIFT+space`. The GlobalShortcuts
  portal states "An application can only attempt to bind shortcuts of a
  session once" and adds `ConfigureShortcuts` in interface version 2
  (<https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html>).
  Charon therefore cannot rebind on Wayland; the desktop owns the trigger.
- `apps/desktop/src-tauri/tests/capture_contract.rs:14-40` `FakeShortcut`
  with `fail_for` and an `operations` log; `:140-170` `coordinator_on`;
  `:455-487` experimental adapters register `Alt+Shift+Space`; `:489-505`
  Wayland. Use these fixtures.
- Native preferences: `apps/desktop/src-tauri/src/preferences/model.rs:8-27`
  (schema v1, `deny_unknown_fields`; new fields need `#[serde(default)]`);
  `ipc/preferences.rs:22-26` `read_persisted(app)`.
- UI: `apps/desktop/src/features/preferences/preferences-panel.tsx:267-303`
  renders the "Write a note" row: label + info Tooltip, a `<kbd>` with
  `formatShortcut(native.capabilities.activeShortcut, platform, {shift, space})`
  or `m.capture_portal_shortcut()` when empty, a state icon, and the
  `capture_error_shortcut_registration` warning. `src/lib/shortcut-label.ts:1-31`
  maps `CmdOrCtrl`/`Cmd`/`Super` to `⌘` on macOS, `CmdOrCtrl` to `Ctrl`
  elsewhere, and prints other tokens verbatim (`Super` stays "Super").
- Contracts that forbid this today: `docs/PRODUCT.md:262-263` non-goal "A
  second capture window, compact alternate mode, generic Error destination, or
  configurable shortcut catalog."; ADR 0011 Decision 12 ("The visible shortcut
  set is intentionally small…"); `AGENTS.md` "Keep `Cmd+Shift+Space` on macOS
  and `Alt+Shift+Space` on Windows/Linux as the reveal-and-focus-composer
  fallback."; `docs/ARCHITECTURE.md` "Create another ADR before changing …
  shortcut support"; `docs/UX.md:204-207` and `:293-298`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Focused Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked shortcut` | pass |
| Bindings | `bun run bindings:generate && bun run bindings:check && bun run ipc:check` | exit 0 |
| Messages | `bun run messages:check` | exit 0 |
| Unit | `bun run --cwd apps/desktop test -- src/lib src/features/preferences` | pass |
| Full | `bun run check` | exit 0 |
| e2e | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**:
- `docs/adr/NNNN-user-chosen-composer-shortcut.md` (create)
- `apps/desktop/src-tauri/src/capture/{shortcut.rs (create),mod.rs,coordinator.rs,model.rs,error.rs}`
- `apps/desktop/src-tauri/src/ipc/{capture.rs,preferences.rs}`, `apps/desktop/src-tauri/src/lib.rs` (invoke list only)
- `apps/desktop/src-tauri/src/preferences/{mod.rs,model.rs}`
- `apps/desktop/src-tauri/tests/{capture_contract.rs,ipc_error_contract.rs,preferences_contract.rs}`
- generated `apps/desktop/src/bindings/{capture.ts,preferences.ts}`
- `apps/desktop/src/lib/{shortcut-label.ts,shortcut-label.test.ts,shortcut-recorder.ts (create),shortcut-recorder.test.ts (create)}`
- `apps/desktop/src/lib/ipc/capture-client.ts`
- `apps/desktop/src/features/preferences/{preferences-context.tsx,preferences-panel.tsx,preferences-panel.test.tsx}`
- `apps/desktop/messages/{en.json,fr.json}`
- `docs/PRODUCT.md`, `docs/UX.md`, `docs/ARCHITECTURE.md`, `docs/platform-support.md`, `docs/adr/0011-rapid-capture-product.md` (status note only), `docs/FEATURE_BACKLOG.md`, `README.md`, `AGENTS.md`
- Test fakes and fixtures that implement `CaptureClient`/`NativePreferencesClient` or build `CaptureCapabilities`/`PreferencesSnapshot` literals (add the new members only; TypeScript will list them): `apps/desktop/src/components/shell.test.tsx`, `apps/desktop/src/features/notes/note-editor.test.tsx`, `apps/desktop/src/features/updates/update-context.test.tsx`, `apps/desktop/src/features/preferences/preferences-panel.test.tsx`

**Out of scope**:
- Double Shift (timing, modifier, or enabling) — stays fixed.
- Any second configurable action or an in-app shortcut map (`CmdOrCtrl+F`,
  Escape, editor keys): that would be the catalog ADR 0011 removed.
- Wayland rebinding or `ConfigureShortcuts` (optional follow-up; see
  Maintenance notes). Wayland keeps displaying the portal assignment.
- Keyboard-layout-aware letter labels (`navigator.keyboard.getLayoutMap()` is
  not available in WKWebView/WebKitGTK); documented as a limitation.
- The global-shortcut plugin version, Tauri version, or webview permissions.

## Git workflow

- Branch: `codex/061-composer-shortcut`
- Commits: `docs(adr): allow one user-chosen composer shortcut`,
  `feat(capture): validate and apply a user-chosen composer shortcut`,
  `feat(preferences): record and reset the composer shortcut`,
  `docs: document the configurable composer shortcut`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Decision gate — draft the ADR and get operator approval (no code)

`ls docs/adr`, take the next free number, create
`docs/adr/NNNN-user-chosen-composer-shortcut.md` (`Proposed`). Decision draft:
1. The user may replace the one reveal-and-focus-composer accelerator on
   macOS, Windows, and X11 from Preferences, and reset it to the platform
   default. It is stored per machine in native preferences.
2. Double Shift, every in-app key, and Wayland's portal-owned trigger are
   unchanged; this is not a shortcut catalog.
3. Validation rules (Step 3) are deterministic and enforced in Rust; the
   webview only records keys.
4. A change registers the new accelerator before releasing the old one; any
   failure keeps the previous accelerator active.
5. At startup a stored accelerator that fails validation or registration
   falls back to the default and Preferences says so.
6. Conflict detection is honest: Windows and X11 report an accelerator
   already held by another app; macOS cannot, so Preferences says Charon
   cannot detect every conflict there.
7. Letter keys are stored by physical position; on non-QWERTY layouts the
   displayed letter may differ from the keycap (documented limitation).
8. Supersedes the PRODUCT non-goal only for this one accelerator; amends
   ADR 0011 Decision 12, `AGENTS.md`, `docs/UX.md`, and
   `docs/ARCHITECTURE.md`.

Operator questions (recommendation in brackets): approve [required]; minimum
two modifiers including one of Cmd/Ctrl/Alt/Super [yes]; the reserved-list in
Step 3 [accept or edit]; Wayland `ConfigureShortcuts` now [defer].

**Verify**: only the ADR file is new. **STOP and wait for the operator.**

### Step 1: Short native feasibility check (throwaway branch, go/no-go)

Branch `spike/composer-shortcut`; never merged. Add a temporary debug-only
command that unregisters the current accelerator and registers a string
passed in, from a `#[tauri::command(async)]` thread, using the main-thread
dispatch described in Step 5. On each available platform record:
- runtime re-registration works and the new combination reveals Charon;
- registering `Cmd+Space` (macOS, Spotlight) and a combination held by
  another running app: `Ok` or `Err`, and whether Charon or the other owner
  receives the key;
- Windows: registering a combination held by another app returns an error;
- X11: same; Wayland: nothing to test (portal owns it).
Go if re-registration works on macOS and Windows (X11 if available).

**Verify**: table reported to the operator; **STOP and wait**. No-go →
`BLOCKED: spike no-go (<reason>)`. Delete the spike branch.

### Step 2: Accept the ADR

Status `Accepted on <date> by operator decision`; add the spike table
(conflict detection per platform) and the approved rule set. Add one line to
ADR 0011 `## Status`: "ADR NNNN permits one user-chosen composer shortcut."

**Verify**: `grep -n "Accepted on" docs/adr/NNNN-user-chosen-composer-shortcut.md` → 1.

### Step 3: Pure validator `capture/shortcut.rs`

Create the module (declare `pub mod shortcut;` in `capture/mod.rs`). No I/O.

```rust
pub const MAX_ACCELERATOR_LEN: usize = 64;

pub fn configurable(platform: PlatformKind) -> bool {
    matches!(platform, PlatformKind::Macos | PlatformKind::Windows | PlatformKind::LinuxX11)
}

/// Canonical form: modifiers in the order Cmd|Super, Ctrl, Alt, Shift, then one key.
pub fn normalize(input: &str, platform: PlatformKind) -> Result<String, CaptureError>;
```

Rules (each gets a unit test; errors are content-free):
1. ASCII only, `1..=MAX_ACCELERATOR_LEN` bytes, split on `+`, trim, no empty
   token → else `InvalidShortcut`.
2. Modifiers, case-insensitive: `CmdOrCtrl`/`CommandOrControl` → `Cmd` on
   macOS, `Ctrl` elsewhere; `Cmd`/`Command`/`Super`/`Meta` → `Cmd` on macOS,
   `Super` elsewhere; `Ctrl`/`Control`; `Alt`/`Option`; `Shift`. A repeated
   modifier → `InvalidShortcut`.
3. Exactly one key, last: `A`–`Z` (also `KeyA`…), `0`–`9` (also `Digit0`…),
   `Space`, `F1`–`F24`. Anything else → `InvalidShortcut`.
4. At least two modifiers, at least one of `Cmd`/`Super`/`Ctrl`/`Alt` →
   else `InvalidShortcut`.
5. Reserved list, compared after normalization → `ShortcutReserved` (new
   error variant, `("shortcut_reserved", "capture_error_shortcut_reserved")`):
   - macOS: `Cmd+Shift+3`, `Cmd+Shift+4`, `Cmd+Shift+5`, `Cmd+Shift+Z`,
     `Cmd+Ctrl+Q`, `Cmd+Ctrl+Space`;
   - Windows: `Ctrl+Shift+Z`, `Super+Shift+S`;
   - X11: `Ctrl+Shift+Z`, `Ctrl+Alt+T`, `Ctrl+Alt+L`.
   (Edit only if the operator changed the list in Step 0.)
6. Non-configurable platform → `ShortcutNotConfigurable` (new variant,
   `("shortcut_not_configurable", "capture_error_shortcut_not_configurable")`).

Tests: both defaults (`CmdOrCtrl+Shift+Space` on macOS → `Cmd+Shift+Space`;
`Alt+Shift+Space` on Windows) are valid; `ctrl+alt+n` → `Ctrl+Alt+N`;
`Shift+Alt+KeyN` → `Alt+Shift+N`; `Cmd+F` (one modifier), `Shift+Alt` (no
key), `Ctrl+Alt+Enter` (unsupported key), `Ctrl++`, a 65-byte string,
`Ctrl+Ctrl+N`, non-ASCII → `InvalidShortcut`; each reserved entry →
`ShortcutReserved`; Wayland → `ShortcutNotConfigurable`.

Catalog additions (EN / FR):
`capture_error_shortcut_reserved` "That shortcut is used by the system or by common editing commands. Choose another." / "Ce raccourci est utilisé par le système ou par des commandes d’édition courantes. Choisissez-en un autre.";
`capture_error_shortcut_not_configurable` "Your desktop manages this shortcut. Change it in its keyboard settings." / "Votre bureau gère ce raccourci. Modifiez-le dans ses réglages clavier.";
`capture_error_shortcut_conflict` "The system refused this shortcut; another app may use it. Your previous shortcut stays active." / "Le système a refusé ce raccourci ; une autre application l’utilise peut-être. Votre raccourci précédent reste actif.".
Add all three variants (plus `ShortcutConflict` → `("shortcut_conflict", "capture_error_shortcut_conflict")`)
to `capture/error.rs` and `tests/ipc_error_contract.rs`.

**Verify**: focused Rust command → pass; `bun run messages:check` → exit 0.

### Step 4: Coordinator — preferred shortcut, change, origin

In `capture/model.rs` add (ts-rs camelCase):

```rust
pub enum ShortcutOrigin { Default, Custom, DefaultAfterFailure, Desktop }
```

and to `CaptureCapabilities`: `default_shortcut: String`,
`shortcut_origin: ShortcutOrigin`, `shortcut_configurable: bool`. Update
`capture_contract_serialization_has_stable_names` and the bindings export.

In `coordinator.rs`:
- `new` fills `default_shortcut = composer_shortcut(platform)`,
  `shortcut_origin = Desktop` on Wayland else `Default`,
  `shortcut_configurable = shortcut::configurable(platform)`.
- `pub fn set_preferred_shortcut(&mut self, preferred: Option<String>)` —
  stores it; only meaningful before `initialize()`.
- `initialize()`: if configurable and a preferred value normalizes and
  differs from the normalized default, try `register(&normalized)`; on success
  `active_shortcut = normalized`, origin `Custom`. Otherwise register the
  default string exactly as today (keep `active_shortcut` equal to
  `composer_shortcut(platform)` so existing tests and the UI are unchanged);
  if a preferred value existed, origin `DefaultAfterFailure`.
- `pub fn custom_shortcut(&self) -> Option<String>` — `Some(active)` only
  when origin is `Custom`.
- `pub fn change_shortcut(&mut self, requested: Option<&str>) -> Result<CaptureCapabilities, CaptureError>`:
  1. `ensure_active()`; not configurable → `ShortcutNotConfigurable`.
  2. target = `None` → the default string; `Some(raw)` → `shortcut::normalize`
     (errors propagate). If `normalize(target) == normalize(default)`, use
     the default string.
  3. If `normalize(active_shortcut) == normalize(target)` and
     `standard_shortcut == Available` → only update origin, return.
  4. `self.shortcut.register(&target)` → on error return `ShortcutConflict`
     (previous stays active and untouched).
  5. If the previous was `Available`, `unregister(&previous)`; on error,
     `unregister(&target)` (best effort) and return `ShortcutUnregistration`.
  6. `active_shortcut = target`, `standard_shortcut = Available`, origin
     `Default` or `Custom`; return `capabilities()`.
- `refresh_platform_states` keeps the Wayland override unchanged.

Tests in `tests/capture_contract.rs` (use `FakeShortcut` and its
`operations` log): change registers new **before** unregistering old; a
`fail_for` target leaves the old active, returns `ShortcutConflict`, and logs
no unregister; reset returns to the exact default string; same-as-current is
a no-op (no operations); Wayland → `ShortcutNotConfigurable` with no
operations; `initialize` with a valid preferred registers it (origin
`Custom`); with a failing preferred registers the default (origin
`DefaultAfterFailure`); with an invalid preferred string never calls
`register` with it; `shutdown` unregisters the custom accelerator.

**Verify**: Rust command → exit 0.

### Step 5: Persistence and IPC

- `preferences/model.rs`: `#[serde(default)] pub composer_shortcut: Option<String>`
  on `PersistedPreferences`; `validate()` rejects a value that is empty, longer
  than 64 bytes, non-ASCII, or contains a control character
  (`InvalidValue`) — semantic validation stays in `capture::shortcut`.
  `preferences/mod.rs`: `pub fn remember_composer_shortcut(root, value: Option<&str>) -> Result<PersistedPreferences, PreferencesError>`.
  Test: an old file without the field loads `None`.
- `ipc/capture.rs` `initialize`: before `current.as_mut()…initialize()`, call
  `set_preferred_shortcut(super::preferences::read_persisted(app).ok().and_then(|p| p.composer_shortcut))`.
- New command in `ipc/capture.rs`:

```rust
#[tauri::command(async)]
pub fn capture_set_shortcut(
    app: AppHandle,
    shortcut: Option<String>,
) -> Result<CaptureCapabilities, CaptureIpcError> {
    // The plugin registers on the main thread and its key handler also runs
    // there and locks the coordinator. Holding the coordinator lock on this
    // worker thread while waiting for the main thread could deadlock, so the
    // whole critical section runs on the main thread.
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let task_app = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(apply_shortcut_change(&task_app, shortcut));
    })
    .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?;
    rx.recv()
        .map_err(|_| CaptureIpcError::from(CaptureError::RuntimeLock))?
}
```

  `apply_shortcut_change`: under `with_coordinator`, read
  `previous = custom_shortcut()` and call `change_shortcut(requested)`; then
  persist `custom_shortcut()` with `remember_composer_shortcut`. On a persist
  error, call `change_shortcut(previous.as_deref())` to roll back and return
  `CaptureIpcError { code: format!("preferences_{}", e.code), message_key: e.message_key }`.
- Register `ipc::capture::capture_set_shortcut` in `lib.rs`; add
  `setShortcut(shortcut: string | null)` →
  `invoke<CaptureCapabilities>('capture_set_shortcut', { shortcut })` to
  `capture-client.ts` (and the fixture/test fakes that implement
  `CaptureClient`).

**Verify**: Rust command → exit 0; `bun run bindings:generate && bun run bindings:check && bun run ipc:check` → exit 0.

### Step 6: Recorder and Preferences row

1. `src/lib/shortcut-recorder.ts` (pure, tested): 
   `acceleratorFromKeyboardEvent(event: Pick<KeyboardEvent,'code'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'|'isComposing'>, platform: PlatformKind): { kind: 'pending' } | { kind: 'unsupported' } | { kind: 'accelerator'; value: string }`.
   Modifier-only codes (`ShiftLeft/Right`, `ControlLeft/Right`, `AltLeft/Right`,
   `MetaLeft/Right`, `CapsLock`, `Fn`) or `isComposing` → `pending`.
   `KeyX` → `X`, `DigitN` → `N`, `Space`, `F1`–`F24`; anything else →
   `unsupported`. Modifiers: `metaKey` → `Cmd` (macOS) / `Super`; `ctrlKey`
   → `Ctrl`; `altKey` → `Alt`; `shiftKey` → `Shift`; canonical order as in
   Rust. Tests cover each branch, AZERTY-style `code: 'KeyQ'` → `Q`.
2. `shortcut-label.ts`: render `Super` as `Win` on Windows and `Super` on
   Linux (add a test).
3. `preferences-context.tsx`: `setShortcut(value: string | null)` updating
   `capabilities` from the response, with `pendingShortcut` and a dedicated
   `shortcutErrorKey` (do not reuse the generic `errorKey`).
4. `preferences-panel.tsx`, the row at `:267-303`:
   - when `capabilities.shortcutConfigurable`: a `Change…` button
     (`m.preferences_shortcut_change()`); activating it turns the `<kbd>`
     area into a focused recorder (`role="textbox"`, `aria-live="polite"`,
     `aria-label={m.preferences_shortcut_recording()}`) that handles
     `onKeyDown`: `Escape` with no modifier cancels and calls
     `event.stopPropagation()` so the Popover stays open; `Tab` exits
     recording without capturing; every other key calls `preventDefault()`
     and `stopPropagation()`, then `pending` keeps waiting, `unsupported`
     shows `m.preferences_shortcut_unsupported_key()`, and `accelerator` calls
     `native.setShortcut(value)`;
   - a `Reset` button (`m.preferences_shortcut_reset()`) when
     `shortcutOrigin === 'custom'`, calling `setShortcut(null)`;
   - `shortcutOrigin === 'defaultAfterFailure'` → persistent warning
     `m.preferences_shortcut_fallback()`;
   - macOS only, persistent hint `m.preferences_shortcut_conflict_hint()`;
   - Wayland (`!shortcutConfigurable`): no button, keep the portal display,
     add `m.capture_error_shortcut_not_configurable()` as plain help text;
   - errors from `shortcutErrorKey` render beside the row with `role="alert"`.
   Feedback begins on key down; no animation is added.
5. Copy (EN / FR):
   `preferences_shortcut_change` "Change…" / "Modifier…";
   `preferences_shortcut_recording` "Press the new shortcut, or Escape to cancel" / "Appuyez sur le nouveau raccourci, ou Échap pour annuler";
   `preferences_shortcut_unsupported_key` "Use a letter, a digit, Space, or F1–F24 with at least two modifier keys." / "Utilisez une lettre, un chiffre, Espace ou F1–F24 avec au moins deux touches de modification.";
   `preferences_shortcut_reset` "Reset" / "Réinitialiser";
   `preferences_shortcut_fallback` "Your chosen shortcut could not be registered, so the default is active." / "Votre raccourci n’a pas pu être enregistré ; le raccourci par défaut est actif.";
   `preferences_shortcut_conflict_hint` "Charon can’t detect every shortcut used by macOS or other apps. If it doesn’t respond, choose another." / "Charon ne peut pas détecter tous les raccourcis utilisés par macOS ou d’autres applications. S’il ne répond pas, choisissez-en un autre.".
6. Tests (`preferences-panel.test.tsx`, pattern: "shows a contextual warning
   when the portable shortcut registration fails" at `:128`): recording then
   pressing `Ctrl+Alt+N` calls `setShortcut('Ctrl+Alt+N')`; Escape cancels
   and the Popover stays open; a `shortcut_conflict` error shows the alert and
   the previous `<kbd>` text; Reset appears only for `custom`; the fallback
   warning; Wayland shows no Change button.

**Verify**: unit command → pass; `bun run messages:check` → exit 0.

### Step 7: Contracts and documentation

- `docs/PRODUCT.md`: non-goal line becomes "… generic Error destination, or a
  configurable shortcut catalog (one user-chosen composer shortcut is
  permitted by ADR NNNN)."; "### Manual capture and portable fallback" gains
  one sentence on changing and resetting it (not on Wayland).
- `docs/UX.md` `:204-207` and the keyboard contract `:293-298`: "the
  platform default or the user's chosen shortcut"; Preferences sentence
  (`:102-106`) adds "shortcut change and reset".
- `AGENTS.md` bullet: "Keep `Cmd+Shift+Space` on macOS and `Alt+Shift+Space`
  on Windows/Linux as the **default** reveal-and-focus-composer shortcut; ADR
  NNNN lets the user replace that one accelerator (not on Wayland). Double
  Shift is not configurable."
- `docs/ARCHITECTURE.md` "### CaptureCoordinator": one sentence on
  validation, register-before-unregister, and persisted choice.
- `docs/platform-support.md`: per-platform conflict-detection result.
- `README.md` and `docs/FEATURE_BACKLOG.md` item status.

**Verify**: `grep -n "ADR NNNN\|user-chosen" docs/PRODUCT.md AGENTS.md` (with the real number) → ≥ 1 each; `bun run check` → exit 0.

### Step 8: Native smoke

macOS, Windows, X11 (record unverified where unavailable): change to
`Ctrl+Alt+N` → works immediately and after relaunch; old combination no
longer reveals; conflict (Windows/X11: a combination held by another app) →
alert, previous still works; Reset → default works; edit `preferences.json`
by hand to `"composerShortcut": "Cmd+F"` → relaunch shows the fallback
warning and the default works; Wayland: no Change button. Delete
`apps/desktop/src-tauri/target/debug` afterwards.

## Test plan

- Rust: `capture/shortcut.rs` unit tests; coordinator change/initialize tests
  in `tests/capture_contract.rs`; `ipc_error_contract.rs` new tuples;
  preferences default test.
- TypeScript: `shortcut-recorder.test.ts`, `shortcut-label.test.ts`,
  `preferences-panel.test.tsx`.
- e2e: the fixture cannot register global keys; if the demo fixture's fake
  capture client is extended with `setShortcut`, one Chromium e2e can cover
  the recorder UI, otherwise rely on unit tests.

## Done criteria

- [ ] ADR accepted with the feasibility table; ADR 0011 status note added
- [ ] Rust fmt/clippy/test exit 0; `bun run check` exit 0
- [ ] `bun run bindings:check && bun run ipc:check && bun run messages:check` exit 0
- [ ] `grep -rn "InvalidShortcut" apps/desktop/src-tauri/src/capture/shortcut.rs` → ≥ 1 (the dormant variant now has a producer)
- [ ] `grep -n "double" apps/desktop/src-tauri/src/capture/shortcut.rs` → 0 (double Shift untouched)
- [ ] Step 8 recorded
- [ ] `plans/README.md` status row updated

## STOP conditions

- The operator has not approved Step 0 or the Step 1 go/no-go.
- Runtime re-registration fails on macOS or Windows in Step 1.
- `capture_set_shortcut` hangs in native testing (main-thread deadlock).
- Any change would alter double-Shift behaviour, the Wayland portal
  `preferred_trigger`, or add an in-app shortcut map.
- An existing test asserting `activeShortcut` equals `DEFAULT_CAPTURE_SHORTCUT`
  or `Alt+Shift+Space` fails for a user who never changed the shortcut.

## Maintenance notes

- Old builds read `preferences.json` with `deny_unknown_fields`; after a
  manual downgrade the file is treated as corrupt and backed up (the updater
  never downgrades).
- Follow-up option: on Wayland, call the portal's `ConfigureShortcuts`
  (interface version ≥ 2) behind a "Change in system settings" button.
- The reserved list is a policy constant; changing it needs only a unit-test
  update and an ADR note, not a new ADR.
- Reviewer: check register-before-unregister ordering in the operation log
  tests, that no error message echoes the rejected accelerator string, and
  that Escape inside the recorder never closes Preferences.
