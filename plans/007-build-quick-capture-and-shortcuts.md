# Plan 007: Build quick capture and the cross-platform shortcut capability ladder

> **Executor instructions**: This is a risk-first platform plan. Execute the
> spike and gates in order, and never advertise a capability before its platform
> smoke test passes. Stop on any STOP condition. Update the index when done.
>
> **Drift check (run first)**: inspect Tauri windows, global-shortcut registration,
> platform modules, and command registry. Expected state: one main window, in-app
> commands, and no native modifier listener or Accessibility code. Re-read ADR
> 0002. Stop if another implementation already claims `Shift`, `Shift`.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 003, 004, and 005
- **Category**: direction, migration, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

Global double Shift is the signature interaction, but it is not a normal global
accelerator. Tauri's shortcut API models modifiers plus one key, and Wayland does
not provide a universal modifier-only hook. A capability ladder keeps the core
capture workflow reliable everywhere while allowing a proved native macOS path
and honest, testable fallbacks on Linux and Windows.

## Current state

- The app-owned command registry handles focused-window shortcuts only.
- Tauri global-shortcut is pinned but has no production registration.
- Only the main window exists. No quick-capture route, native event tap, selected
  text adapter, permission prompt, or platform capability report exists.
- ADR 0002 requires `CmdOrCtrl+Shift+Space` everywhere and treats double Shift
  plus selected-text capture as separately proved platform capabilities.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| State tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture::gesture` | all timing/state cases pass |
| Core tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture` | all coordinator tests pass |
| UI tests | `bun run test:desktop -- capture shortcut` | all quick-window tests pass |
| Rust quality | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Debug app | `bun run tauri:build -- --debug` | current-platform bundle succeeds |

## Suggested executor toolkit

- Use `improve-codebase-architecture` to keep shortcut, selection acquisition,
  permissions, and window lifecycle inside one deep CaptureCoordinator.
- Read official Tauri global-shortcut and capability docs before coding.
- Use `shadcn` for the capture form, section combobox, kbd labels, and errors.
- Use `apple-design` for capture-window materialization, repeated-trigger
  interruption, anchored origin, and reduced-motion/transparency behavior.

## Scope

**In scope**:

- `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock`,
  `apps/desktop/src-tauri/build.rs`
- `apps/desktop/src-tauri/tauri.conf.json`,
  `apps/desktop/src-tauri/capabilities/main.json`,
  `apps/desktop/src-tauri/capabilities/capture.json`
- `apps/desktop/src-tauri/src/capture/mod.rs`, `coordinator.rs`, `gesture.rs`, `model.rs`,
  `error.rs`, `window.rs`
- `apps/desktop/src-tauri/src/capture/platform/mod.rs`, `macos.rs`, `linux.rs`, `windows.rs`
- `apps/desktop/src-tauri/src/ipc/capture.rs`,
  `apps/desktop/src-tauri/src/ipc/mod.rs`, `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/tests/capture_contract.rs`
- `apps/desktop/src/bindings/capture.ts` (generated),
  `apps/desktop/src/lib/ipc/capture-client.ts`
- `apps/desktop/src/routes/capture.tsx`
- `apps/desktop/src/features/capture/capture-screen.tsx`, `capture-form.tsx`,
  `capture-controller.ts`, `capture-status.tsx`
- `apps/desktop/src/app/commands/default-commands.ts`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- Tests beside these frontend files
- `docs/adr/0002-platform-capture.md`, `docs/ARCHITECTURE.md`,
  `docs/platform-support.md` for evidence and exact dependency pins

**Out of scope**:

- Synthetic paste, keyboard-event suppression, clipboard-based selected-text
  theft, background content collection, Wayland capability claims without a
  stable supported protocol, auto-start at login, and release signing.
- Full Windows double Shift if no signed Windows smoke environment is available.

## Git workflow

- Branch: `codex/007-quick-capture`
- Commits: `test(capture): prove gesture state machine`,
  `feat(capture): add quick capture coordinator`,
  `feat(macos): add consented double-shift capture`,
  then platform adapters only when proved
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Run and document a platform spike before choosing native crates

On each available target, record OS/session, Accessibility status, whether a
standard global accelerator registers, whether modifier key down/up events are
observable outside the app, and whether selected text can be read without
modifying the clipboard. Update `docs/platform-support.md` with evidence.

For any native Rust dependency, query the official registry and upstream docs,
select a stable release, pin it exactly in a target-specific dependency table,
and add its version to `plans/README.md`. Do not add an unmaintained permission
plugin or a Git dependency merely to avoid implementing a small OS adapter. The
preferred architecture uses official OS APIs through a narrowly scoped adapter.

This gate may result in:

- macOS: supported double Shift and Accessibility selected text.
- Linux X11: standard accelerator; native double Shift only if proved.
- Linux Wayland: fallback accelerator only.
- Windows: standard accelerator; native enhancements deferred until proved.

**Verify**: `rg -n "macOS|X11|Wayland|Windows|evidence|fallback" docs/platform-support.md` -> complete capability rows; every added native dependency is exact in `Cargo.toml` and the ledger.

### Step 2: Implement and exhaustively test the double-Shift state machine

In pure `gesture.rs`, accept normalized key down/up events plus monotonic time.
Trigger only after two complete Shift press-release taps within 300ms, with no
non-modifier event between them. Ignore auto-repeat; reset on focus/security
boundary changes, timeout, another key, a held Shift, or mixed chord use. Treat
left/right Shift according to the documented spike decision. Never suppress or
rewrite OS key events.

Use a fake monotonic clock. Cover exact threshold edges, key repeat, Shift+letter,
left/right combinations, three taps, long hold, sleep/resume gap, concurrent
fallback shortcut, and listener restart.

**Verify**: run State tests -> all cases pass with no wall-clock sleeps.

### Step 3: Build the deep CaptureCoordinator with capability fallback

CaptureCoordinator owns registration, native adapter lifecycle, permission
state, selected-text acquisition, quick-window show/focus, draft handoff, and
shutdown. Its public model reports each capability as `available`, `denied`,
`unsupported`, or `error`, plus the active fallback shortcut.

Register the standard accelerator in Rust with Tauri global-shortcut so it works
while the main window is hidden. Validate and re-register changes without leaving
two active shortcuts. On trigger, request selected text only if the platform
adapter is authorized; otherwise open an empty draft. Emit no selected text to
logs, analytics, crash reports, or diagnostics.

Add macOS Accessibility trust check and prompt only from a user action. Use the
native event adapter proved in Step 1 for double Shift and the Accessibility API
for selected text; do not overwrite the clipboard as a workaround. Linux and
Windows modules must compile on their targets even when they return unsupported.

**Verify**: run Core tests -> fake adapters cover available, denied, unsupported,
registration conflict, repeated trigger, shutdown, and no-content-logging cases.

### Step 4: Add a purpose-built quick-capture window

Configure a hidden `capture` window at `/capture`: 560px wide, content-sized,
centered near the active display, always on top while open, excluded from the
taskbar where supported, and not persisted as a normal main-window state. Use
restrained decoration consistent with `docs/UX.md`; do not introduce permanent
glass or platform-private APIs.

The form contains a Markdown textarea, section combobox, Save, and Close. Prefill
authorized selected text, focus the textarea, and retain an unsaved draft if a
second trigger arrives. Enter behavior must not accidentally submit multiline
content; use Cmd/Ctrl+Enter to save and Escape to close, with confirmation for a
dirty non-empty draft. Successful save uses exactly one Workspace create command,
clears the draft, and hides the window.

The WebView content materializes with the shared surface spring from a subtle
scale/opacity state anchored to the capture field, never by pretending the native
window itself has gesture momentum. A second global trigger while opening must
retarget from the current presentation values and focus the existing draft; a
close during entry reverses the same path. Native show/focus and save semantics
must not wait for visual completion. Reduced motion uses an immediate show plus a
short fade; reduced transparency uses an opaque elevated surface with a stronger
separator. Do not stack backdrop filters over the native window material.

**Verify**: `bun run test:desktop -- capture-screen capture-controller` -> prefill, empty,
permission denied, repeated trigger, dirty close, save conflict/retry, focus,
and localized labels pass.

### Step 5: Connect in-app and global commands without overlap

Register `capture.open` in the app command registry and display both active
global mechanisms in shortcut help. In-app raw keyboard handling may reuse the
pure gesture state machine only if TanStack Hotkeys cannot express modifier-only
sequences; keep that listener inside CaptureCoordinator's frontend controller.
Prevent duplicate opens when global and focused-window listeners see the same
gesture. Remove all listeners on app exit, window teardown, and shortcut change.

**Verify**: `bun run test:desktop -- shortcut capture` -> editable typing, duplicate
suppression, listener cleanup, and command-help labels pass.

### Step 6: Run the platform acceptance matrix

For every CI-available target, build and run the standard accelerator smoke test.
On physical/virtual targets available to the operator, execute the documented
manual cases: app hidden, other app focused, Shift+letter does not trigger,
double Shift does, denial opens empty capture, selection prefill is exact, save
persists, Escape is safe, and restart re-registers one listener.

Mark a feature supported in `docs/platform-support.md` only when its row contains
date, OS/session, build identifier, and result. The UI reads the runtime
capability model, not hard-coded platform promises.

**Verify**: Debug app command succeeds on the current platform; capability table
has no unsupported feature labeled supported.

## Test plan

- Exhaustive pure gesture tests with a fake monotonic clock.
- Coordinator contract tests with fake shortcut, permission, selection, window,
  and Workspace adapters.
- UI tests for full capture states and draft safety.
- Motion tests cover trigger-while-opening, close-while-entering, current-value
  retargeting, focus before animation completion, and accessibility fallbacks.
- Compile checks for macOS, Linux, and Windows target-specific modules in CI.
- Documented manual platform matrix, because OS-global hooks cannot be proved by
  jsdom or Rust unit tests alone.

## Done criteria

- [ ] Standard fallback accelerator works while the main window is hidden.
- [ ] Double Shift never fires for Shift+letter, repeat, hold, or unrelated keys.
- [ ] macOS native features are permission-gated and content is never logged.
- [ ] Wayland and unproved targets show honest fallback status.
- [ ] Capture window preserves drafts, focuses correctly, and saves one note.
- [ ] Listeners are single-instance and cleaned up.
- [ ] All native dependencies are exact and documented with evidence.
- [ ] Core/UI tests, clippy, format, current-platform build, and capability table pass.
- [ ] This plan is `DONE` in the index.

## STOP conditions

- The native listener requires suppressing global keyboard events, private APIs,
  an unsigned helper, or invasive privileges beyond documented Accessibility.
- Selected text can only be acquired by silently replacing the user's clipboard.
- macOS double Shift cannot pass false-positive tests in a signed/local build.
- A Wayland implementation depends on a compositor-specific hack presented as universal.
- A new native dependency has no stable, maintained, registry-published release.
- The quick window can lose non-empty drafts during conflict or re-trigger.

## Maintenance notes

- Global hooks are platform code. Re-run the full manual matrix after OS, Tauri,
  or native dependency upgrades.
- Keep timeout and left/right semantics user-configurable only after evidence that
  configuration improves real workflows without increasing false triggers.
- If Wayland gains a stable global-shortcuts protocol supporting this sequence,
  add a new adapter and update ADR 0002 rather than weakening the fallback.
