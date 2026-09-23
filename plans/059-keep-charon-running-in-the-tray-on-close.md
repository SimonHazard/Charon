# Plan 059: Let Charon keep running in the menu bar or notification area after its window closes (opt-in)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 242d51e -- apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/src/capture/platform/linux.rs apps/desktop/src-tauri/tests/preferences_contract.rs apps/desktop/src/app apps/desktop/src/lib/ipc apps/desktop/src/features/preferences apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/features/notes/note-screen.tsx apps/desktop/messages docs AGENTS.md README.md && git status --short -- apps/desktop docs AGENTS.md README.md`
> (without `..HEAD` the diff includes uncommitted edits). Expected drift, by
> earlier plans: **039** (`lib.rs`, `tauri.conf.json` `"visible": false`,
> `note-editor.tsx`, `window-config.test.ts`,
> `docs/UX.md`, `docs/platform-support.md`, `README.md`,
> `docs/FEATURE_BACKLOG.md`), **038** (`tauri.conf.json`, `providers.tsx`,
> `preferences-panel.tsx`, `docs/PRODUCT.md`, `docs/UX.md`, `AGENTS.md`),
> **040/041/047/052** (`preferences-panel.tsx`, messages, `docs/UX.md`,
> `AGENTS.md`), **042/045/046/049** (`note-editor.tsx`, `note-screen.tsx`,
> `providers.tsx`, messages, `docs/PRODUCT.md`, `docs/PRIVACY.md`),
> **050/051** (`docs/UX.md`, `AGENTS.md`), and the operator's macOS permission
> and ADR 0018 signing work (`AGENTS.md`, `docs/PRIVACY.md`,
> `docs/platform-support.md`, `preferences-panel.tsx`, messages). If plans
> E (notifications) or F (shortcuts) from the same backlog batch landed first,
> `preferences/model.rs`, `ipc/preferences.rs`, and `ipc/shell.rs` are
> expected drift too. Compare every "Current state" excerpt against the live
> code; any other mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (native tray behaviour differs per desktop; a missing Linux library panics inside `tray-icon`)
- **Depends on**: `plans/039-keep-the-app-reachable-across-window-lifecycle.md` (hard: `reveal_main`, the `RunEvent` loop, macOS close-to-hide, and the editor close guard it rewrites). Soft: plan 045 and 038 edit `providers.tsx`.
- **Category**: direction
- **Planned at**: commit `242d51e` plus the operator's uncommitted working tree, 2026-09-23

## Why this matters

`docs/FEATURE_BACKLOG.md` ("Réduire l'application dans la zone de
notification à la fermeture") asks for an opt-in mode in which closing the
window hides Charon while the process, and therefore double-Shift capture,
keeps running, with a visible icon and an explicit Quit. Today closing the
window on Windows and Linux quits Charon and stops capture; plan 039 only makes
macOS hide on close, without any icon. The mode must stay local, explicit, and
reversible, add no implicit capture or action, and never strand the user with
a hidden window and no way to reopen or quit it — which is exactly what would
happen on a Linux desktop without a StatusNotifier host, or crash outright if
the AppIndicator library is missing.

## Current state

Read these before editing; line numbers are from the tree at planning time.

- `apps/desktop/src-tauri/Cargo.toml:30` — `tauri = { version = "=2.11.5", features = [] }`.
  No `tray-icon` feature. Linux-only dependencies (`:44-48`) already include
  `zbus = "=5.18.0"`, `async-io = "=2.6.0"`, `futures-lite = "=2.6.1"`.
- `apps/desktop/src-tauri/tauri.conf.json:50-60`:

```json
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0", "librsvg2-2"]
      },
      "rpm": {
        "depends": ["webkit2gtk4.1", "gtk3", "librsvg2"]
      },
```

  Commit `cd79fd9` (plan 037) removed `libayatana-appindicator3-1`/`libxdo3`
  (deb) and `libappindicator-gtk3`/`xdotool` (rpm) because nothing used them.
  The installed Tauri CLI schema supports a `recommends` list for both deb and
  rpm (`apps/desktop/node_modules/@tauri-apps/cli/config.schema.json`,
  `DebConfig.recommends` and `RpmConfig.recommends`).
- `apps/desktop/src-tauri/src/lib.rs:13-75` is the whole builder. Before plan
  039 it ends with `.run(tauri::generate_context!())` (`:73`). **After plan
  039** (required) it has `fn reveal_main(app)`, the single-instance plugin
  calls `reveal_main`, a `#[cfg(target_os = "macos")]` `CloseRequested` arm
  that calls `window.hide()` and `api.prevent_close()`, and
  `.build(...).run(|app, event| match event { RunEvent::Reopen {..} => reveal_main(app), RunEvent::Exit => ipc::capture::shutdown(app), _ => {} })`.
  Plan 039 also sets `"visible": false` on the `main` window in
  `tauri.conf.json` and shows it explicitly at the end of `setup`. The invoke
  list is at `:30-45`; `ipc::capture::initialize` runs in `setup` at `:62`.
  `reveal_main` is a private generic `fn` in `lib.rs`; this plan makes it
  `pub(crate)` so `ipc/shell.rs` can call `crate::reveal_main`.
- Tauri 2.11.5 tray API (verified in
  `~/.cargo/registry/src/index.crates.io-*/tauri-2.11.5/src/tray/mod.rs`):
  `TrayIconBuilder::with_id`, `.icon(Image)`, `.tooltip` (Linux: unsupported),
  `.menu(&Menu)` (Linux: a menu, once set, cannot be replaced — change item
  text instead), `.show_menu_on_left_click(bool)` (Linux: unsupported),
  `.on_menu_event`, `.on_tray_icon_event`, `.build(&app)`;
  `TrayIconEvent::Click { button, button_state, .. }` is **not emitted on
  Linux**; `AppHandle::remove_tray_by_id`, `AppHandle::default_window_icon()`;
  `tauri::menu::MenuItem::with_id(manager, id, text, enabled, accelerator)` and
  `MenuItem::set_text`; `MenuEvent::id()` returns a `MenuId` that implements
  `AsRef<str>` and `PartialEq<&str>`. Docs:
  <https://v2.tauri.app/learn/system-tray/>,
  <https://docs.rs/tauri/2.11.5/tauri/tray/struct.TrayIconBuilder.html>.
- Tauri 2.11.5 enables `tray-icon 0.24` with features `["serde", "gtk"]`
  (`tauri-2.11.5/Cargo.toml:352-360`). `gtk` pulls `libappindicator 0.9` on
  Linux; `libxdo` is only added by Tauri's separate `linux-libxdo` feature,
  which this plan does **not** enable, so `libxdo`/`xdotool` stay removed.
- **Linux crash hazard**: `libappindicator-sys-0.9.0/src/lib.rs:13-55` loads
  the library lazily with `libloading` and **panics** if none of
  `libayatana-appindicator3.so.1`, `libappindicator3.so.1`,
  `libayatana-appindicator3.so`, `libappindicator3.so` can be opened (the last
  two because its default `backcompat` feature is on). `Cargo.lock` already
  contains `tray-icon 0.24.2`, `libappindicator 0.9.0`, and `libloading 0.7.4`.
  Even with the library present, the icon is only visible when a
  StatusNotifier host owns `org.kde.StatusNotifierWatcher` on the session bus
  (stock GNOME needs the AppIndicator extension).
- `apps/desktop/src-tauri/src/capture/platform/linux.rs:20-24`:
  `pub(super) fn local_session_bus() -> bool` (only local `unix:` D-Bus
  transports). `capture/platform/linux/portal.rs:93-111` shows the house
  pattern for a bounded session-bus connection
  (`zbus::connection::Builder::session()`, 2 s `method_timeout`, raced
  against a 2 s `async_io::Timer`).
- `apps/desktop/src-tauri/src/preferences/model.rs:8-27`:

```rust
pub const PREFERENCES_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistedPreferences {
    pub schema_version: u32,
    pub last_workspace_path: Option<String>,
    // reserved, unused since Plan 030; kept on disk for schema-v1 compatibility.
    pub capture_hint_dismissed: bool,
}
```

  `snapshot()` (`:44-51`) builds `PreferencesSnapshot { schema_version,
  workspace_name, has_remembered_workspace, install_kind }` (`:93-101`).
  `storage.rs:29-35`: a file that fails to deserialize is renamed to
  `preferences.corrupt-<uuid>.json` and defaults are used.
- `apps/desktop/src-tauri/src/ipc/preferences.rs:14-20` (`storage(app)` under
  `app_config_dir`), `:22-26` (`read_persisted`), `:41-49`
  (`preferences_read`, `preferences_reset`), `:51-54` (`with_install_kind`
  injects runtime-only data into the snapshot — follow this pattern).
- `apps/desktop/src-tauri/tests/preferences_contract.rs:6-21` exports
  `InstallKind`, `PreferencesSnapshot`, `PreferencesIpcError` to
  `apps/desktop/src/bindings/preferences.ts` (run by `bun run bindings:generate`).
- `apps/desktop/src/features/preferences/preferences-context.tsx:21-26`
  (`defaultPreferences`), `:28-36` (context value), `:101-114`
  (`requestPermission`: pending + `errorKey` pattern to copy).
- `apps/desktop/src/features/preferences/preferences-panel.tsx:366-390` is the
  opt-in toggle to imitate:

```tsx
            <Button
              aria-pressed={updates.enabled}
              disabled={updateBusy}
              onClick={() => updates.setEnabled(!updates.enabled)}
              size="sm"
              variant={updates.enabled ? 'default' : 'outline'}
            >
```

- `apps/desktop/src/app/providers.tsx:93-138` `CaptureBridge` subscribes to
  native events, then calls `client.composerReady()`; mirror it.
  `apps/desktop/src/app/composer-focus-context.tsx:1-33` is the
  request/consume context pattern to mirror.
- `apps/desktop/src/features/notes/note-screen.tsx:83-89` holds
  `draftGuardRef` (the open editor's `flushDraft`, registered by
  `note-editor.tsx:183`), and `:130-132` computes
  `setWorkspaceSwitchBlocked(editorDirty || composerDirty)`.
- `apps/desktop/src/features/notes/note-editor.tsx:193-217` registers
  `appWindow.onCloseRequested`. In `@tauri-apps/api` 2.11.1
  (`node_modules/.bun/@tauri-apps+api@2.11.1/node_modules/@tauri-apps/api/window.js:1632-1641`)
  that helper calls `this.destroy()` unless the handler called
  `preventDefault()`, so a Rust `prevent_close()` alone does not keep the
  window while an editor is open. Plan 039 adds a `macosRef` so macOS always
  prevents and never destroys.
- `apps/desktop/src/app/window-config.test.ts:45-64` pins the webview
  capability list exactly; this plan adds **no** webview permission (the tray
  is Rust-owned).
- `scripts/check-ipc-commands.ts` fails unless every command in
  `generate_handler!` is invoked from a file in `apps/desktop/src/lib/ipc/`.
  `scripts/check-message-keys.ts` requires every Rust `message_key` beginning
  with `capture_`, `workspace_`, `clipboard_`, or `preferences_` to exist in
  `apps/desktop/messages/en.json`.
- Contracts to amend (quote-level facts): `AGENTS.md` "Keep one single-column
  shelf … No navigation rail or product routes" and "Every flow covers
  loading, empty, error, destructive, focus, active, disabled, and
  permission-denied states"; `docs/PRIVACY.md:41-43` "Preferences store a
  successfully validated folder choice and presentation choices, never Note
  content."; `docs/UX.md:102-106` lists the Preferences contents;
  `docs/PRODUCT.md` "## Jobs" (`:21-45`) has no background job;
  `docs/FEATURE_BACKLOG.md` "Contraintes : aucune capture ou action
  supplémentaire ne doit devenir implicite. Le mode background doit rester
  local, explicite et désactivable."
- All desktop copy goes through Paraglide (`AGENTS.md`), so native tray labels
  must be rendered by React and pushed to Rust; Rust never hardcodes UI copy.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust format/lint/test | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Lockfile refresh (once, after a manifest change) | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` | exit 0; then `git diff --stat apps/desktop/src-tauri/Cargo.lock` shows only expected packages |
| Bindings | `bun run bindings:generate && bun run bindings:check && bun run ipc:check` | exit 0 |
| Messages | `bun run messages:check` | exit 0 |
| Desktop unit | `bun run --cwd apps/desktop test -- src/features/preferences src/app src/features/notes` | pass |
| Full | `bun run check` | exit 0 |
| Chromium e2e | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Native | `bun run tauri:dev`; installers via `bun run tauri:build` | see Step 12 |

## Suggested executor toolkit

- `apple-design` (required by `AGENTS.md` for window/interaction behaviour) when
  writing the Preferences copy and the close/quit interaction.
- <https://v2.tauri.app/learn/system-tray/> and the Tauri source under
  `~/.cargo/registry/src/index.crates.io-*/tauri-2.11.5/src/tray/mod.rs`.

## Scope

**In scope**:
- `docs/adr/NNNN-background-mode-and-tray.md` (create; NNNN = next free number)
- `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock` (generated only)
- `apps/desktop/src-tauri/tauri.conf.json` (Linux `recommends` only)
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/ipc/mod.rs`, `apps/desktop/src-tauri/src/ipc/shell.rs` (create), `apps/desktop/src-tauri/src/ipc/preferences.rs`
- `apps/desktop/src-tauri/src/preferences/{mod.rs,model.rs,error.rs}`
- `apps/desktop/src-tauri/src/capture/platform/linux.rs` (visibility of `local_session_bus` only)
- `apps/desktop/src-tauri/tests/preferences_contract.rs`, `apps/desktop/src-tauri/tests/ipc_error_contract.rs`
- `apps/desktop/src/bindings/preferences.ts` (generated only)
- `apps/desktop/src/lib/ipc/preferences-client.ts`, `apps/desktop/src/lib/ipc/shell-client.ts` (create)
- `apps/desktop/src/app/providers.tsx`, `apps/desktop/src/app/shell-bridge.tsx` (create), `apps/desktop/src/app/shell-bridge.test.tsx` (create), `apps/desktop/src/app/quit-request-context.tsx` (create), `apps/desktop/src/app/window-config.test.ts`
- `apps/desktop/src/features/preferences/{preferences-context.tsx,preferences-panel.tsx,preferences-panel.test.tsx}`
- `apps/desktop/src/features/notes/{note-editor.tsx,note-editor.test.tsx,note-screen.tsx,note-screen.test.tsx}`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `docs/PRODUCT.md`, `docs/UX.md`, `docs/PRIVACY.md`, `docs/ARCHITECTURE.md`, `docs/platform-support.md`, `docs/FEATURE_BACKLOG.md`, `README.md`, `AGENTS.md`
- Test fakes and fixtures that implement `CaptureClient`/`NativePreferencesClient` or build `CaptureCapabilities`/`PreferencesSnapshot` literals (add the new members only; TypeScript will list them): `apps/desktop/src/components/shell.test.tsx`, `apps/desktop/src/features/notes/note-editor.test.tsx`, `apps/desktop/src/features/updates/update-context.test.tsx`, `apps/desktop/src/features/preferences/preferences-panel.test.tsx`

**Out of scope** (do NOT touch):
- Start at login, start hidden, or `tauri-plugin-autostart` — separate decision.
- Hiding the macOS Dock icon (`ActivationPolicy::Accessory` /
  `set_dock_visibility`): it removes the app menu that carries Cmd+Q and the
  Edit shortcuts; defer to its own decision.
- Any tray menu item other than Open and Quit (no "capture", "new note",
  counts, badges, recent Notes): the backlog forbids implicit actions and
  `AGENTS.md` forbids decorative UI.
- Tauri's `linux-libxdo` feature, `libxdo`, `xdotool`.
- Creating the tray from JavaScript (`@tauri-apps/api/tray`) or adding any
  `core:tray:*`/`core:menu:*` webview permission.
- `ipc::capture` internals and the capture listener lifecycle (capture keeps
  running while hidden exactly as it does when the window is merely
  unfocused).
- Notification behaviour (plan 060) and shortcut configuration (plan 061).

## Git workflow

- Branch: `codex/059-background-mode`
- Commits (conventional, as in `git log`: `fix(release): forward locked flag to Cargo (#57)`):
  `docs(adr): accept an opt-in background mode with a tray icon`,
  `feat(desktop): add a Rust-owned tray and opt-in background mode`,
  `feat(preferences): let users keep Charon running after closing`,
  `docs: document background mode per platform`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Decision gate — draft the ADR and get operator approval (no code)

1. Run `ls docs/adr` and take the next free four-digit number (plans 038,
   041, 051 and the ADR 0018 work may already have used some). Create
   `docs/adr/NNNN-background-mode-and-tray.md` with status
   `Proposed — pending the Step 1 spike` and the existing ADR headings
   (`## Status`, `## Context`, `## Decision`, `## Consequences`,
   `## Revisit when`). Decision content:
   1. Background mode is opt-in, default off, stored in native preferences,
      and switchable at any time in Preferences.
   2. When enabled and the platform tray is **proven available at runtime**,
      Charon shows one Rust-owned tray/menu-bar icon whose menu contains only
      "Open Charon" and "Quit Charon". Closing the window then hides it; the
      process and the existing capture listeners keep running.
   3. On Windows and Linux, closing hides **only while the icon exists**. If
      the icon cannot be created (Linux without the AppIndicator library or
      without a StatusNotifier host), closing keeps quitting and Preferences
      states that background mode is unavailable. macOS keeps plan 039's
      close-to-hide with or without the icon and keeps its Dock icon.
   4. Quit is always explicit (tray menu, Preferences button while active,
      Cmd+Q on macOS) and draft-safe: Charon flushes an open editor and refuses
      to quit while the composer holds unsent text, revealing the window with
      a contextual message, like the updater restart guard.
   5. No capture, Copy, Paste, notification, or other action becomes
      implicit; the tray exposes no Note content and no counts.
   6. Linux is `Experimental`; Wayland icon visibility depends on the host.
   7. Amends `docs/PRODUCT.md` (new job), `docs/UX.md` (close semantics,
      Preferences contents), `docs/PRIVACY.md` (preferences contents and
      listener lifetime), and `AGENTS.md` (one bullet).
2. List these operator questions in the report, with the recommendation:
   - Approve the ADR direction and the throwaway spike? (required)
   - Default off? (recommended: yes)
   - Tray glyph: reuse the app icon via `default_window_icon()` (recommended
     for this plan) or supply a monochrome macOS template image first?
   - Linux packages: add the AppIndicator library as `recommends` (recommended;
     the feature is opt-in and probed) or `depends`?
   - Quit with unsent composer text: block and reveal (recommended, same as
     the updater restart) or discard?

**Verify**: `ls docs/adr | tail -3` shows the new file; `git status --short`
shows only that file. Then **STOP and wait for the operator's answer in chat.**
A missing or negative answer means `BLOCKED: operator declined` in
`plans/README.md`.

### Step 1: Spike on a throwaway branch — go/no-go (operator approval from Step 0 required)

Create `spike/background-tray` from `main`. Nothing from this branch is merged.

1. Add `"tray-icon"` to the `tauri` features in `Cargo.toml` and build a
   minimal tray in `setup` (Open/Quit menu with English literals — allowed on
   the spike branch only, never merged) using the API listed in Current
   state.
2. Measure and record in a table (no Note content, no paths):
   - macOS (Apple Silicon, bundled `.app` from `bun run tauri:build`): icon
     visible in the menu bar; left click shows the menu; Open reveals and
     focuses; hide + double-Shift capture still creates one Note.
   - Windows 10/11 (NSIS install): icon in the notification area (may sit in
     the overflow); left click `Up` event fires; right click shows the menu.
   - Linux X11 and Wayland, at least KDE Plasma and GNOME with and without the
     AppIndicator extension: output of
     `busctl --user status org.kde.StatusNotifierWatcher` (owner or error),
     whether the icon appears, whether a missing library reproduces the panic
     (run the AppImage on a system without `libayatana-appindicator3-1` or
     temporarily rename the library in a VM — never on the operator's
     machine), and whether `show()`+`set_focus()` raises the window on Wayland.
   - Packaging: `dpkg-deb -I <deb>` and `rpm -qpR <rpm>` output (does the
     bundler add an AppIndicator dependency itself?), and
     `./Charon.AppImage --appimage-extract` then
     `find squashfs-root -name '*appindicator*'` (is the library bundled?).
   - `git diff --stat apps/desktop/src-tauri/Cargo.lock` after
     `cargo check` (expected: little or nothing, the packages are already
     locked) and the release binary size delta per platform.
3. Go criteria: macOS and Windows icons work; on Linux, the probe in Step 5
   predicts icon visibility correctly on every tested desktop (no false
   "available"); no crash path remains once the probe gates tray creation.

**Verify**: the table is complete (or states "not tested" per row with a
reason). Report it to the operator with a go/no-go recommendation, then
**STOP and wait**. On "no-go", delete the spike branch and mark the plan
`BLOCKED: spike no-go (<one-line reason>)`. On "go", delete the spike branch
and continue from `main` on `codex/059-background-mode`.

### Step 2: Accept the ADR with the spike evidence

Change the ADR status to `Accepted on <date> by operator decision`, add the
spike table's conclusions to `## Context`, and record the operator's answers
(default, glyph, `recommends`/`depends`, composer rule) in `## Decision`.

**Verify**: `grep -n "Accepted on" docs/adr/NNNN-background-mode-and-tray.md` → one match.

### Step 3: Enable the tray feature and Linux package hints

1. `Cargo.toml:30` → `tauri = { version = "=2.11.5", features = ["tray-icon"] }`.
2. Under `[target.'cfg(target_os = "linux")'.dependencies]` add
   `libloading = "=0.7.4"` (the exact version already in `Cargo.lock`).
3. `tauri.conf.json` Linux: add `"recommends": ["libayatana-appindicator3-1"]`
   to `deb` and `"recommends": ["libappindicator-gtk3"]` to `rpm` (or move
   them to `depends` if the operator chose that). Leave `depends` otherwise
   unchanged.
4. Run the lockfile refresh command once, then return to `--locked` commands.

**Verify**: `cargo check` → exit 0; `git diff --stat apps/desktop/src-tauri/Cargo.lock`
lists at most the packages the spike recorded; `grep -n '"tray-icon"' apps/desktop/src-tauri/Cargo.toml` → one match.

### Step 4: Preferences model — persisted intent plus runtime state

In `preferences/model.rs`:

```rust
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistedPreferences {
    pub schema_version: u32,
    pub last_workspace_path: Option<String>,
    pub capture_hint_dismissed: bool,
    #[serde(default)]
    pub background_mode: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum TrayAvailability { Available, Experimental, Unavailable }

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct NativeLabels {
    pub tray_open: String,
    pub tray_quit: String,
    pub tray_tooltip: String,
}
```

- Keep `PREFERENCES_SCHEMA_VERSION = 1`; `#[serde(default)]` lets existing
  files load. Extend `Default` with `background_mode: false`.
- `PreferencesSnapshot` gains `background_mode: bool` (from the file),
  `tray_availability: TrayAvailability`, `background_active: bool` (both
  runtime-only; `snapshot()` fills `Unavailable`/`false`, the IPC layer
  overwrites them like `with_install_kind`).
- `NativeLabels::validate()` rejects any field that is empty after trimming,
  longer than 64 Unicode scalar values, or contains a control character →
  `PreferencesError::InvalidValue`.
- `preferences/error.rs`: add `TrayUnavailable` →
  `("tray_unavailable", "preferences_error_tray_unavailable")`.
- `preferences/mod.rs`: re-export `NativeLabels`, `TrayAvailability`; add
  `pub fn set_background_mode(root, enabled: bool) -> Result<PersistedPreferences, PreferencesError>`
  (read, set, write, return), modelled on `remember_workspace` (`mod.rs:15-27`).
- `tests/preferences_contract.rs`: add `TrayAvailability::decl`,
  `NativeLabels::decl` to the export list.
- `tests/ipc_error_contract.rs`: add the new error tuple next to the existing
  preferences cases.
- Catalogs: add `preferences_error_tray_unavailable`
  (EN "The menu bar or notification area icon is unavailable on this desktop. Closing the window will quit Charon." /
  FR "L’icône de barre des menus ou de zone de notification est indisponible sur ce bureau. Fermer la fenêtre quittera Charon.").

Unit tests in `model.rs`/`storage.rs`: a v1 file **without** `backgroundMode`
loads with `false`; round trip with `true`; `NativeLabels::validate` boundary
cases (empty, 64 vs 65 scalars, `\n`).

**Verify**: Rust command → exit 0; `bun run bindings:generate && bun run bindings:check` → exit 0;
`grep -n "backgroundActive" apps/desktop/src/bindings/preferences.ts` → one match.

### Step 5: `ipc/shell.rs` — availability probe, tray lifecycle, close policy, quit gate

Create `apps/desktop/src-tauri/src/ipc/shell.rs` and add `pub mod shell;` in
`ipc/mod.rs`. It is an application-layer adapter (like the updater), not a
domain module. Shape:

```rust
pub const TRAY_ID: &str = "charon";
const MENU_OPEN: &str = "charon-open";
const MENU_QUIT: &str = "charon-quit";
const QUIT_WATCHDOG: std::time::Duration = std::time::Duration::from_secs(10);

#[derive(Default)]
pub struct ShellRuntime {
    labels: Mutex<Option<NativeLabels>>,
    items: Mutex<Option<(MenuItem<tauri::Wry>, MenuItem<tauri::Wry>)>>,
    background_active: AtomicBool,
    bridge_ready: AtomicBool,
    quit: Mutex<QuitGate>,
}

/// Pure, unit-tested: generation counter so a late watchdog never exits
/// after the webview already answered.
#[derive(Default)]
pub(crate) struct QuitGate { generation: u64, pending: bool }
impl QuitGate {
    pub(crate) fn request(&mut self) -> u64 { self.generation += 1; self.pending = true; self.generation }
    pub(crate) fn resolve(&mut self) { self.pending = false; }
    pub(crate) fn expired(&self, generation: u64) -> bool { self.pending && self.generation == generation }
}

pub(crate) fn close_hides(is_macos: bool, background_active: bool) -> bool {
    is_macos || background_active
}
```

Functions (exact names; keep each small):

- `pub fn tray_availability() -> TrayAvailability` — macOS and Windows:
  `Available`. Linux: `Experimental` when **both** `appindicator_loadable()`
  and `status_notifier_host_present()` are true, else `Unavailable`. Other
  targets: `Unavailable`.
- `#[cfg(target_os = "linux")] fn appindicator_loadable() -> bool` — try
  `unsafe { libloading::Library::new(name) }` for the four names listed in
  Current state, in that order, returning `true` on the first success (drop
  the handle immediately). Add a `// SAFETY:` comment: these are the same
  libraries `tray-icon` would load; loading runs their constructors only.
- `#[cfg(target_os = "linux")] fn status_notifier_host_present() -> bool` —
  return `false` unless `crate::capture::platform::linux::local_session_bus()`
  (change its visibility from `pub(super)` to `pub(crate)` in
  `capture/platform/linux.rs:20`); then, with `async_io::block_on` and the
  same 2 s race as `portal.rs:96-111`, call
  `zbus::fdo::DBusProxy::new(&connection).await?.name_has_owner("org.kde.StatusNotifierWatcher".try_into()?)`.
  Any error or timeout → `false`.
- `pub fn enable_background(app: &AppHandle) -> Result<(), PreferencesIpcError>` —
  if `tray_availability() == Unavailable` → `Err(TrayUnavailable)`. If
  `app.tray_by_id(TRAY_ID)` is `None`, build it with the labels (no labels
  yet → `Err(TrayUnavailable)`):

```rust
let open = MenuItem::with_id(app, MENU_OPEN, &labels.tray_open, true, None::<&str>)?;
let quit = MenuItem::with_id(app, MENU_QUIT, &labels.tray_quit, true, None::<&str>)?;
let menu = Menu::with_items(app, &[&open, &quit])?;
let icon = app.default_window_icon().cloned().ok_or(/* TrayUnavailable */)?;
TrayIconBuilder::with_id(TRAY_ID)
    .icon(icon)
    .tooltip(&labels.tray_tooltip)
    .menu(&menu)
    .show_menu_on_left_click(cfg!(target_os = "macos"))
    .on_menu_event(|app, event| {
        if event.id() == MENU_OPEN { crate::reveal_main(app) }
        else if event.id() == MENU_QUIT { request_quit(app) }
    })
    .on_tray_icon_event(|tray, event| {
        #[cfg(not(target_os = "macos"))]
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            crate::reveal_main(tray.app_handle());
        }
    })
    .build(app)?;
```

  Map every `tauri::Error` to `PreferencesError::TrayUnavailable` (never log
  labels). Store `open`/`quit` in `items`, then set `background_active = true`.
  In `lib.rs`, change plan 039's `fn reveal_main` to `pub(crate) fn reveal_main`;
  do not duplicate it.
- `pub fn disable_background(app: &AppHandle)` — `app.remove_tray_by_id(TRAY_ID)`,
  clear `items`, set `background_active = false`.
- `pub fn background_active(app: &AppHandle) -> bool`.
- `pub fn request_quit(app: &AppHandle)` — if `bridge_ready` is false, or
  emitting `shell://quit-requested` (payload `()`) to `main` fails, call
  `app.exit(0)`. Otherwise `let generation = quit.request()` and spawn a
  `charon-quit-watchdog` thread that sleeps `QUIT_WATCHDOG` and calls
  `app.exit(0)` only if `quit.expired(generation)`.
- Commands (all `#[tauri::command(async)]`):
  - `shell_set_labels(app, labels: NativeLabels) -> Result<(), PreferencesIpcError>` —
    validate; store; mark `bridge_ready`; if a tray exists call
    `set_text` on both items and `tray.set_tooltip(Some(..))`; else if the
    persisted `background_mode` is `true`, try `enable_background` and
    ignore its error (the snapshot will report inactive).
  - `shell_quit(app)` — `quit.resolve()`, then `app.exit(0)`.
  - `shell_cancel_quit(app)` — `quit.resolve()`, then `crate::reveal_main(&app)`.

Unit tests in `shell.rs`: `close_hides` truth table (4 cases); `QuitGate`:
a resolved request does not expire, a second request supersedes the first
generation, an unresolved current generation expires.

**Verify**: Rust command → exit 0 on the executor's OS; the Quality workflow
must also compile Linux/Windows (check the PR later).

### Step 6: Wire the runtime into `lib.rs`

- `.manage(ipc::shell::ShellRuntime::default())` beside the other runtimes.
- Invoke list: add `ipc::shell::shell_set_labels`, `ipc::shell::shell_quit`,
  `ipc::shell::shell_cancel_quit`, `ipc::preferences::preferences_set_background_mode`.
- In `on_window_event`, for `main` and **non-macOS** targets only (plan 039
  already handles macOS), add before the `Destroyed` arm:

```rust
#[cfg(not(target_os = "macos"))]
if window.label() == "main" {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if ipc::shell::background_active(window.app_handle()) && window.hide().is_ok() {
            api.prevent_close();
        }
    }
}
```

**Verify**: Rust command → exit 0; `grep -n "background_active" apps/desktop/src-tauri/src/lib.rs` → one match.

### Step 7: Preferences IPC

In `ipc/preferences.rs`:
- Replace `with_install_kind(snapshot)` call sites with
  `with_runtime(&app, snapshot)` which sets `install_kind` (unchanged logic),
  `tray_availability = shell::tray_availability()`, and
  `background_active = shell::background_active(app)`. Cache the Linux probe
  result in a `OnceLock` **only for the process lifetime** so Preferences
  refreshes do not open a D-Bus connection each time; re-probe inside
  `enable_background`.
- Add `preferences_set_background_mode(app, enabled: bool) -> Result<PreferencesSnapshot, PreferencesIpcError>`:
  enabling → `shell::enable_background(&app)?` then persist with
  `set_background_mode(root, true)`; on persist failure call
  `shell::disable_background(&app)` and return the error. Disabling → persist
  `false` first, then `disable_background`. Return `with_runtime` snapshot.

**Verify**: Rust command → exit 0.

### Step 8: React clients, bridge, and quit handshake

1. `src/lib/ipc/shell-client.ts` (create), same style as `capture-client.ts`:
   `setLabels(labels: NativeLabels)` → `invoke('shell_set_labels', { labels })`,
   `quit()` → `invoke('shell_quit')`, `cancelQuit()` → `invoke('shell_cancel_quit')`,
   `subscribeQuitRequest(listener)` → `listen('shell://quit-requested', …)`.
2. `preferences-client.ts`: `setBackgroundMode(enabled)` →
   `invoke<PreferencesSnapshot>('preferences_set_background_mode', { enabled })`.
3. `src/app/quit-request-context.tsx` (create): a context holding one
   registered handler `() => Promise<boolean>` (`true` = safe to quit),
   with `registerQuitHandler(handler) → unregister`, modelled on
   `composer-focus-context.tsx`.
4. `src/app/shell-bridge.tsx` (create): when `enabled` (Tauri runtime),
   subscribe to quit requests first, then call `setLabels` with
   `m.tray_open()`, `m.tray_quit()`, `m.tray_tooltip()`; call `setLabels`
   again whenever the locale changes (read `usePreferences().locale`). On a
   quit request: no handler registered → `quit()`; handler returns `true` →
   `quit()`; `false` → `cancelQuit()`. Mount it in `providers.tsx` next to
   `CaptureBridge`, inside the new `QuitRequestProvider`.
5. `note-screen.tsx`: register a quit handler that runs
   `draftGuardRef.current?.()` (return `false` if it resolves `false`), then
   returns `false` and calls `announce(m.shell_quit_blocked_composer())` when
   `composerDirty` is true; else `true`.
6. `note-editor.tsx` (after plan 039): read
   `native.preferences.backgroundActive` into a `backgroundActiveRef` and
   compute `const hides = macosRef.current || backgroundActiveRef.current`
   inside the close handler, so a hidden-on-close window is never destroyed:
   `if (!hides && clean) return; event.preventDefault(); if ((await flushDraft()) && !hides) await appWindow.destroy();`
7. Catalogs (EN / FR): `tray_open` "Open Charon" / "Ouvrir Charon";
   `tray_quit` "Quit Charon" / "Quitter Charon"; `tray_tooltip` "Charon" /
   "Charon"; `shell_quit_blocked_composer` "Add or clear the note you are
   writing before quitting." / "Ajoutez ou effacez la note en cours avant de
   quitter.".

**Verify**: `bun run ipc:check && bun run messages:check` → exit 0; new
`shell-bridge.test.tsx` cases pass: labels sent once on mount and again after
a locale change; a quit request with no handler calls `quit`; a handler
returning `false` calls `cancelQuit` and not `quit`. New
`note-editor.test.tsx` case: on `windows` with `backgroundActive: true`, a
clean and a dirty close both flush without `destroy`; existing Windows/Linux
cases (background inactive) are unchanged. New `note-screen.test.tsx` case:
the quit handler returns `false` and announces when the composer is dirty.

### Step 9: Preferences surface

In `preferences-context.tsx` add `setBackgroundMode(enabled)` with a
`pendingBackground` flag and the shared `errorKey` pattern
(`requestPermission` at `:101-114`); update `defaultPreferences` with
`backgroundMode: false, trayAvailability: 'unavailable', backgroundActive: false`.

In `preferences-panel.tsx`, add a `preferences-group` section after Capture
titled `m.preferences_background()`:
- description `m.preferences_background_description()` (platform wording via
  `native.capabilities?.platform`: macOS "menu bar", others "notification
  area");
- the `aria-pressed` toggle copied from the updates button, disabled while
  pending or when `trayAvailability === 'unavailable'`, with the reason
  `m.preferences_background_unavailable()` shown as text (not only a Tooltip);
- `stateLabel('experimental')` beside it on Linux;
- a warning row when `backgroundMode && !backgroundActive`
  (`m.preferences_error_tray_unavailable()`);
- while `backgroundActive`, a `variant="ghost"` `m.tray_quit()` button that
  runs the same guard as a tray quit request (register-handler path via the
  context) and then `shellClient.quit()`.

Copy (EN / FR), plain wording per `AGENTS.md`:
`preferences_background` "Background" / "Arrière-plan";
`preferences_background_description` "Keep Charon running in the menu bar (macOS) or notification area after you close its window, so double Shift keeps working. Quit it from the icon." / "Garder Charon actif dans la barre des menus (macOS) ou la zone de notification après la fermeture de sa fenêtre, pour que le double Maj continue de fonctionner. Quittez-le depuis l’icône.";
`preferences_background_enable` / `_disable` "Keep running" / "Stop keeping running" and "Garder actif" / "Ne plus garder actif";
`preferences_background_unavailable` "This desktop does not show app icons in its panel, so closing the window quits Charon." / "Ce bureau n’affiche pas d’icônes d’application dans son panneau : fermer la fenêtre quitte Charon.".

Tests in `preferences-panel.test.tsx` (pattern: the updates toggle and the
existing experimental-platform `describe`): toggle calls the client and
reflects `aria-pressed`; unavailable → disabled with the visible reason;
enable error → inline alert, toggle stays off; Quit button only while
`backgroundActive`.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass.

### Step 10: Contract and documentation amendments

- `docs/PRODUCT.md` "## Jobs": add "Optionally keep Charon running in the
  macOS menu bar or the Windows/Linux notification area after closing its
  window, with explicit Open and Quit." and a short `### Background mode`
  journey (opt-in, default off, availability-gated, draft-safe Quit).
- `docs/UX.md`: in "Single-shelf layout" add the close semantics per
  platform with and without background mode; in the Preferences sentence
  (`:102-106`) add "an opt-in background mode"; feature map row
  "Background mode | Preferences and one tray/menu-bar icon | Open and Quit only; unavailable state explains why closing quits."
- `docs/PRIVACY.md:41-43`: "Preferences store a successfully validated folder
  choice, presentation choices, and the background-mode choice, never Note
  content." Add: "While background mode keeps Charon running, the capture
  listeners described below stay active until Quit; the tray exposes no Note
  content."
- `docs/ARCHITECTURE.md` "## Deep modules" → after "### Update integration",
  a short "### Window lifecycle and tray" paragraph: application-layer
  adapter, Rust-owned, labels supplied by React, no webview tray permission.
- `docs/platform-support.md`: one row or paragraph per platform with the
  spike evidence (Linux `Experimental`, the AppIndicator library and
  StatusNotifier host requirement, no click events).
- `AGENTS.md` under "UI and motion": "An opt-in background mode may show one
  Rust-owned tray/menu-bar icon with only Open and Quit; closing hides only
  while that icon exists (macOS always hides), and Quit stays explicit and
  draft-safe."
- `docs/FEATURE_BACKLOG.md`: mark the item as planned/implemented per the
  repo's convention (or remove it if the operator prefers; ask).
- `README.md` Features: one bullet.

**Verify**: `grep -n "background mode" docs/PRODUCT.md docs/UX.md docs/PRIVACY.md AGENTS.md` → at least one match per file; `bun run check` → exit 0.

### Step 11: Pinned-contract tests

`window-config.test.ts`: keep the capability list assertion unchanged (the
point is that no webview permission was added); add assertions that
`Cargo.toml` contains `features = ["tray-icon"]` and does not contain
`linux-libxdo`, and that `tauri.conf.json` deb/rpm `depends` still exclude
`libayatana-appindicator3-1`/`libxdo3` unless the operator chose `depends`.

**Verify**: `bun run --cwd apps/desktop test -- src/app/window-config.test.ts` → pass.

### Step 12: Native smoke (operator or an executor with the hardware)

Record results in the PR body; mark rows you could not run as "unverified
natively". Delete `apps/desktop/src-tauri/target/debug` afterwards (AGENTS).

- macOS: enable → menu bar icon; close → hidden, Dock icon stays; icon →
  Open reveals; Quit with a clean editor quits; Quit with a dirty editor saves
  then quits; Quit with composer text reveals Charon and shows the message;
  hidden + double Shift in another app creates one Note; disable → icon gone,
  close still hides (plan 039).
- Windows (NSIS install): enable → icon; close → hidden, taskbar entry gone;
  left click reveals; right click menu; Quit paths as above; disable → close
  quits again; launching Charon again while hidden reveals it
  (single-instance).
- Linux KDE (X11 and Wayland): icon via the menu; GNOME without extension:
  toggle disabled with the reason and close quits; with the extension: icon
  works; system without the AppIndicator library: no crash, toggle disabled.

## Test plan

- Rust: preferences serde/default/validation tests; `close_hides` and
  `QuitGate` unit tests; `ipc_error_contract.rs` new tuple; bindings export.
- TypeScript: `shell-bridge.test.tsx` (new), `preferences-panel.test.tsx`,
  `note-editor.test.tsx`, `note-screen.test.tsx`, `window-config.test.ts`.
- Model new component tests on `src/app/capture-status.test.ts` and the
  existing `preferences-panel.test.tsx` experimental-platform block.
- No tray behaviour is testable in the browser fixture; Step 12 is the gate.

## Done criteria

- [ ] ADR `NNNN-background-mode-and-tray.md` is `Accepted` with spike evidence
- [ ] Rust fmt/clippy/test exit 0; `bun run check` exits 0; Chromium e2e pass
- [ ] `bun run bindings:check && bun run ipc:check && bun run messages:check` exit 0
- [ ] `grep -n '"tray-icon"' apps/desktop/src-tauri/Cargo.toml` → 1; `grep -n "linux-libxdo" apps/desktop/src-tauri/Cargo.toml` → 0
- [ ] `grep -rn "core:tray\|core:menu" apps/desktop/src-tauri/capabilities` → 0
- [ ] `grep -rn "appindicator_loadable\|status_notifier_host_present" apps/desktop/src-tauri/src/ipc/shell.rs` → both defined and used by `tray_availability`
- [ ] Step 12 recorded per platform (verified or explicitly unverified)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 039 has not landed (`grep -n "RunEvent::Reopen" apps/desktop/src-tauri/src/lib.rs` → 0): STOP.
- The operator has not approved Step 0, or has not answered the Step 1 go/no-go.
- Any Linux configuration crashes after the probe gates tray creation, or the
  probe reports available while no icon is visible: STOP and report (never
  ship a hide-without-icon path).
- `cargo check` changes `Cargo.lock` beyond what the spike recorded.
- A step appears to need a webview tray/menu permission, a tray item beyond
  Open/Quit, or English copy hardcoded in Rust.
- Quit can lose a dirty editor draft in any tested path.

## Maintenance notes

- Old builds read `preferences.json` with `deny_unknown_fields`; a manual
  downgrade after `backgroundMode` was written treats the file as corrupt,
  backs it up as `preferences.corrupt-*.json`, and falls back to the default
  Workspace. The updater never downgrades; mention it in release notes only if
  a downgrade path is ever documented.
- `tray-icon 0.25` adds a pure-Rust `ksni` StatusNotifier backend without
  `libappindicator` (see <https://github.com/tauri-apps/tray-icon>). When a
  Tauri release adopts it, revisit the library probe and the `recommends`
  entry. `libayatana-appindicator` upstream is deprecated
  (<https://github.com/tauri-apps/tray-icon/issues/260>).
- Plan 060 (notifications) should extend `NativeLabels` and `ShellRuntime`
  rather than add a second labels command.
- Reviewer: confirm the window is never hidden on Windows/Linux without a
  live tray icon, Quit never skips the draft guard, and the Preferences toggle
  is disabled with a visible reason when unavailable.
- Deferred: Dock-icon hiding on macOS, start at login, start hidden, a
  monochrome template glyph (if the operator did not supply one).
