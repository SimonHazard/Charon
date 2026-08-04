# Plan 012: Add minimal preferences and pragmatic platform fallbacks

> **Executor instructions**: Use `apple-design` for the compact preferences
> surface and permission continuity. Follow every verification gate and STOP
> condition. Do not request native permission on mount. Keep preferences free of
> note content. Update the plan index only after native and UI tests pass.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- apps/desktop/src-tauri/src apps/desktop/src apps/desktop/messages apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock plans/README.md`
> Stop if another native preference store or Workspace-switch transaction has
> landed without an accepted ownership decision.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/010-simplify-workspace-and-copy-domain.md`, `plans/011-build-single-shelf-desktop.md`
- **Category**: direction, security, dx, tests
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

The simplified app still needs three small pieces of durable configuration:
which Workspace to reopen, which theme/language the user chose, and whether the
enhanced macOS capture permissions are available. Those controls do not justify
a Settings route, onboarding wizard, diagnostics dashboard, or configurable
shortcut catalog.

The cross-platform contract must also stay pragmatic. macOS keeps the physically
proved double-Shift selected-text path. Windows, X11, and Wayland keep the safe
standard accelerator and visible composer until native evidence exists; Charon
must not gain speculative listeners or input injection.

## Current state

- `apps/desktop/src-tauri/src/ipc/workspace.rs:57-70` safely resolves
  `Documents/Charon`, while lines 18-33 expose a user folder chooser.
- `apps/desktop/src/app/workspace-context.tsx:148-166` can switch to a selected
  folder but does not remember it across restarts.
- `apps/desktop/src-tauri/src/ipc/workspace.rs:133-150` stops/removes the current
  Workspace before starting and snapshotting the replacement. If the replacement
  watcher/snapshot fails, the previous runtime has already been dropped.
- Theme and locale currently persist in WebView storage. Keep them there unless
  a proved startup need requires native duplication.
- Capture capabilities, separate macOS Input Monitoring/Accessibility actions,
  and the bounded ADR 0010 fallback exist from Plan 007.
- The standard accelerator currently opens an empty editor; ADR 0011 changes it
  to reveal the main window and focus the bottom composer.
- Rust registers fs, updater, process, window-state, dialog, clipboard, global
  shortcut, and single-instance plugins. `tauri-plugin-fs`, updater, and process
  have no live call site beyond registration at the planned baseline.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Preferences Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked preferences` | schema, migration, corruption and atomic tests pass |
| Workspace switch | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace_switch` | previous runtime survives cancel/failure; success swaps once |
| Capture Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture` | gesture/capability/fallback tests pass |
| UI | `bun run test:desktop -- preferences workspace capture shell theme locale` | targeted tests pass |
| Bindings | `bun run bindings:generate && bun run bindings:check` | generated preferences/capability DTOs current |
| Quality | `bun run check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |

## Scope

**In scope**:

- `apps/desktop/src-tauri/src/preferences/{mod,model,storage,error}.rs` (create)
- `apps/desktop/src-tauri/src/ipc/{preferences,workspace,capture,mod}.rs`
- `apps/desktop/src-tauri/src/lib.rs`, `Cargo.toml`, `Cargo.lock`, Tauri capability/config
- Generated preference/capture bindings and frontend IPC clients
- `apps/desktop/src/app/{providers,workspace-context,theme,locale}.ts*`
- Compact `apps/desktop/src/features/preferences/**`
- Titlebar/settings/capture help and bottom-composer focus plumbing from Plan 011
- EN/FR messages and tests beside changed files
- README/privacy/platform-support corrections required by implementation evidence

**Out of scope**:

- A Settings route, command palette, shortcut recorder, onboarding wizard,
  diagnostics export, updater UI/network, launch at login, notifications
- Moving the default Workspace into opaque app data
- Linux/Windows synthetic Copy, modifier-only hooks, Accessibility automation,
  automatic Paste, or arbitrary keystrokes
- Duplicating note content, selection, clipboard payloads, or absolute paths in logs

## Git workflow

- Branch: `codex/012-minimal-preferences`
- Commits: `feat(core): remember the validated workspace`,
  `feat(preferences): add compact local controls`,
  `refactor(capture): focus the portable composer`
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a tiny versioned native preference file

Store `preferences.json` atomically in Tauri's app config directory. Schema v1
contains only:

- `schemaVersion`;
- last successfully opened Workspace path;
- a boolean that the concise first-run capture hint was dismissed.

Do not duplicate theme or locale while validated WebView storage already owns
them. Do not store a custom accelerator, permission grant, note count/content,
search, status filter, selection, diagnostics, clipboard data, or capture text.
OS permission APIs remain authoritative each session.

Expose typed read/update/reset commands. Validate the path is absolute only at
the native boundary; never serialize it into logs/errors. Use atomic temp write,
rename, and config-directory sync. Corrupt preferences are renamed to a
content-free backup and reset without touching any Workspace.

**Verify**: Rust tests cover fresh, read/update, atomic failure, corrupt backup,
unknown future schema, non-UTF8 path handling, and redacted errors.

### Step 2: Make Workspace switching validate before replacing

Refactor the native switch sequence:

1. user cancels chooser: no state or preference change;
2. open/create and fully validate the candidate in a temporary Workspace value,
   including every managed Attachment reference/path containment rule;
3. start its watcher and obtain its first valid snapshot;
4. only then lock the runtime, swap candidate for current, and stop the previous
   watcher;
5. persist the new path only after swap success;
6. on failure, drop candidate and leave previous runtime/watcher/snapshot active.

Prevent overlapping chooser/switch operations. An unsaved editor draft must be
handled in React before invoking native switch; cancel preserves it. Startup
first tries the remembered path. If it is unavailable/invalid, keep that error
contextual and offer Retry, Choose another, and Use `Documents/Charon`; do not
silently create elsewhere or leak the path in copy.

Keep ADR 0007's resolver exactly: `Documents/Charon`, then safe
`Documents/Charon Workspace`, then explicit chooser. Documents is retained
because visible Markdown is an interoperability feature, not an implementation
default to hide.

**Verify**: switch tests cover cancel, invalid folder, missing/escaping
Attachment reference, watcher failure, snapshot failure, unsaved-draft cancel,
successful swap, preference-write failure, rapid double invocation,
last-path startup, and safe default fallback. After success, `Copy as Markdown`
resolves Attachment paths under the new root, never the former root.

### Step 3: Build one compact Preferences popover/sheet

Populate the existing settings trigger with one anchored Popover at regular
width and a bottom Sheet only when space demands it. It contains four groups:

1. Appearance: Solarized/Light/Dark exclusive choice.
2. Language: English/Français exclusive choice.
3. Notes folder: basename/current-location disclosure, Choose folder, and Use
   default. Reveal the full path only after an explicit user action if a safe
   native reveal API is already available; otherwise omit it.
4. Capture: concise capability state, portable shortcut, and on macOS separate
   explicit Input Monitoring and Accessibility request actions with ADR 0010
   clipboard disclosure.

No sidebar, tabs, About dashboard, diagnostics, advanced shortcuts, update
toggle, or Reset everything. Theme/language preview immediately and preserve
focus. Folder switch warns only for a dirty draft and destructive collision.

The popover originates from the gear and returns along the same path. It remains
interruptible; permission results update semantic state, not animation callbacks.
Reduced motion crossfades/static swaps; reduced transparency is solid.

**Verify**: UI tests cover all themes/locales, current folder, choose cancel/
failure/success, dirty draft, every capability state, explicit permission action,
focus return, rapid reopen, reduced preferences, and EN/FR label parity.

### Step 4: Retarget the portable shortcut to the bottom composer

Remove Command-double-Shift code, help text, gesture branch, and tests as
specified by ADR 0011. Keep unmodified double Shift on macOS exactly as proved:
Input Monitoring detection, Accessibility direct selection, then ADR 0010's
single bounded Copy fallback, one flat Note, no focus theft.

Make `CmdOrCtrl+Shift+Space` on every platform show/focus the existing main
window and focus the bottom composer without creating an editor draft. If the
window is already visible, it only focuses composer. Duplicate activations must
not duplicate listeners, drafts, or Notes.

On Linux/Windows, `doubleShift` and selected-text capability remain unsupported
until existing gates pass. Do not add a low-level global key hook, clipboard
reader, or platform-specific injection. Wayland copy explains the visible
fallback without labelling compositor limits as an error.

**Verify**: capture tests cover macOS one-Note behavior, empty/denied no-op,
portable hidden/visible window focus, no draft creation, duplicate suppression,
Linux X11/Wayland/Windows honest states, and removal of Command-double-Shift.

### Step 5: Remove unused native plugins and dependency surfaces

After proving no call site remains, remove native/JS dependencies registered
only for unimplemented future features. Expected Rust candidates are
`tauri-plugin-fs`, `tauri-plugin-updater`, and `tauri-plugin-process`; expected
JavaScript candidates were handled in Plan 011. Retain dialog (folder and
Attachment choosers), clipboard manager (`Copy as Markdown`), global shortcut,
single instance, and window state where live behavior/tests require them.

Update Tauri capabilities to least privilege and remove empty updater config.
Use Cargo/Bun owning tools to regenerate lockfiles; never hand-edit them. Update
the fixed version ledger in `plans/README.md` in the same change.

**Verify**: `rg` proves removed crate/plugin names have no source/config match;
`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets`
and Quality pass.

### Step 6: Run pragmatic platform and privacy smoke

Repeat the macOS physical matrix from Plan 007 after the refactor: AppKit,
Safari/WebKit, Chromium/Electron including Codex, editor text, PDF, secure,
blocked, canvas, existing rich clipboard, timeout, concurrent write, and focus.
Record acquisition path and exactly-one-Note result without content.

On available Linux and Windows environments, verify only standard shortcut,
window reveal, composer focus, manual create, folder/Attachment chooser,
theme/language, and explicit `Copy as Markdown`. Mark untested platforms
honestly; do not promote claims.

**Verify**: all command-table checks pass and `docs/platform-support.md` has a
dated row per tested artifact with no unsupported promotion.

## Test plan

- Native preference schema/atomicity/redaction tests.
- Candidate-before-current Workspace swap integration tests, including managed
  Attachment validation and post-switch copy-path resolution.
- Compact Preferences surface states and focus/motion tests.
- Portable composer-focus shortcut on all platform capability fixtures.
- Existing macOS gesture/AX/Copy/race tests with flat Note creation.
- Native dependency/capability least-privilege scan.
- Manual macOS matrix and standard fallback smoke where platforms are available.

## Done criteria

- [ ] Preferences contain only last Workspace path and hint dismissal.
- [ ] Candidate Workspace validates fully before current runtime is replaced.
- [ ] `Documents/Charon` remains the safe visible default and another folder is selectable.
- [ ] One compact surface owns theme, language, folder, and capture permissions.
- [ ] Portable shortcut focuses the bottom composer; no Command-double-Shift remains.
- [ ] macOS double Shift and ADR 0010 behavior remain physically proved.
- [ ] Linux/Windows receive safe standard behavior without unsupported hooks/claims.
- [ ] Unused native plugins are removed and lockfiles/ledger are regenerated.
- [ ] Rust/UI/binding/aggregate tests and platform smoke pass.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- A preference requires note content, clipboard payload, selection, or telemetry.
- Candidate Workspace cannot be validated before dropping the current runtime.
- Folder switching can lose an acknowledged save or dirty draft.
- Portable composer focus requires creating another window or editor draft.
- macOS capture loses ADR 0010 safety, focus, or clipboard-race guarantees.
- Linux/Windows support would require unproved low-level input injection/listeners.
- A supposedly unused plugin still has a live product/config call site.

## Maintenance notes

- Keep Preferences proportional to the product. A new item needs a common user
  task, not merely an available native API.
- Updater dependencies may return only in the release plan with signed artifacts,
  privacy copy, and a real endpoint.
- Never treat macOS debug TCC grants as signed-release evidence.
