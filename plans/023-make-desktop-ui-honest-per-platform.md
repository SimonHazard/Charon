# Plan 023: Make the desktop shelf honest and functional on every platform

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src/components/shelf-chrome.tsx apps/desktop/src/features/preferences apps/desktop/messages apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/capabilities/main.json apps/desktop/src/components/shell.test.tsx apps/desktop/e2e/release.spec.ts docs/UX.md docs/platform-support.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (Plan 021/022 are independent; do 023 any time)
- **Category**: bug (cross-platform UX), dx
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

`docs/platform-support.md` records double-Shift selected-text capture as
"Not implemented" on Linux and Windows, and `AGENTS.md` forbids claiming a
platform capability before its gate passes. Yet the Help popover advertises
"Shift Shift — Capture selected text from another app" and a hybrid
"⌘/Ctrl + Shift + Space" string on every platform, while Preferences (correctly)
says selected-text capture is not claimed off macOS. Two surfaces in the same
window contradict each other, and one FR string says notes live "sur ce Mac".

Three functional gaps compound it on Linux/Windows:

- Global-shortcut registration failure (Wayland has no X11 grab; conflicts on
  Windows) is stored in `capabilities.standardShortcut = 'error'` but the
  frontend never reads `standardShortcut`, so users see a shortcut that does
  nothing and no explanation.
- The single-instance plugin callback is empty, so launching Charon again on
  Linux/Windows exits silently instead of raising the existing window (macOS
  masks this because the OS activates the bundle).
- The 28 px drag strip uses `data-tauri-drag-region`, whose injected script
  invokes `plugin:window|start_dragging`; that command needs
  `core:window:allow-start-dragging`, which is **not** part of
  `core:window:default`. The strip is therefore inert today; the app also
  ships `-webkit-app-region`, an Electron-only property that no Tauri webview
  honours.

## Current state

- `apps/desktop/src/components/shelf-chrome.tsx:52-61` — Help popover renders
  both rows unconditionally:
  ```tsx
  <span className="help-shortcut-row">
    <kbd>{m.capture_help_double_shift_keys()}</kbd>
    <span>{m.capture_help_double_shift_description()}</span>
  </span>
  <span className="help-shortcut-row">
    <kbd>{m.capture_help_composer_keys()}</kbd>
    <span>{m.capture_help_composer_description()}</span>
  </span>
  ```
- `apps/desktop/messages/en.json:10-12` — `capture_help_double_shift_keys`
  ("Shift Shift"), `capture_help_composer_keys` ("⌘/Ctrl + Shift + Space").
  `:150-152` — `preferences_shortcut_macos` ("⌘ + Shift + Space"),
  `preferences_shortcut_other` ("Ctrl + Shift + Space"),
  `preferences_platform_fallback`. `:117` — `capture_error_shortcut_registration`
  exists but is unreachable from the initialize path. `fr.json:142` —
  "Vos notes restent dans ce dossier, sur ce Mac." (EN `:142` says "device").
- `apps/desktop/src/features/preferences/preferences-panel.tsx:210-251` —
  Preferences already branches on `native.capabilities.platform === 'macos'`
  for the shortcut and the permission rows; helpers `stateLabel`/`stateIcon`
  exist at `:42-57` for capability states. `useNativePreferences()` exposes
  `capabilities` (`preferences-context.tsx`).
- `apps/desktop/src/bindings/capture.ts:11` — `CaptureCapabilities` has
  `standardShortcut: CapabilityState` (`'available' | 'error' | 'unsupported' | ...`), `doubleShift`, `selectedText`, `platform`.
  `grep -rn standardShortcut apps/desktop/src --include=*.tsx` → only a test fixture.
- `apps/desktop/src-tauri/src/capture/coordinator.rs:60-70` — registration
  failure sets `standard_shortcut = CapabilityState::Error`.
- `apps/desktop/src-tauri/src/lib.rs:18` —
  `.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))`.
  `ipc/capture.rs:284-291` already shows the pattern to reveal the main
  window (`get_webview_window("main")` → `unminimize`/`show`/`set_focus`).
- `apps/desktop/src-tauri/capabilities/main.json:6` —
  `["core:default", "clipboard-manager:allow-write-text", "dialog:allow-open"]`.
  `gen/schemas/acl-manifests.json` `core:window` default set has no
  `allow-start-dragging`.
- `apps/desktop/src/styles/app.css:60-72` — `.desktop-shell` grid
  `28px minmax(0,1fr)`; `.window-drag-region { -webkit-app-region: drag }`;
  `:84` `-webkit-app-region: no-drag`. `shelf-chrome.tsx:18-20` renders
  `<div aria-hidden className="window-drag-region" data-tauri-drag-region />`.
- `apps/desktop/src/components/shell.test.tsx:44` asserts
  `screen.getByText('⌘/Ctrl + Shift + Space').tagName === 'KBD'`.
- `docs/UX.md:90-92` — "A minimal native drag region ... native outer-window
  controls and macOS traffic-light space remain platform-owned."

Conventions: all copy through Paraglide `m.*` (flat snake_case keys, EN and FR
in parity — 164 keys each today); key combos inside `<kbd>`; Base UI `render`
API; icons from `@tabler/icons-react`; tests with Vitest + Testing Library
(`shell.test.tsx`, `preferences-panel.test.tsx`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (compiles Paraglide) | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test:desktop` | all pass |
| E2E (Chromium) | `bun run --cwd apps/desktop test:e2e -- --project=chromium` | all pass |
| Rust | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Native check | `bun run tauri:dev` | window opens; drag strip drags the window (macOS host) |

## Scope

**In scope**:
- `apps/desktop/src/components/shelf-chrome.tsx`
- `apps/desktop/src/features/preferences/preferences-panel.tsx`
- `apps/desktop/messages/en.json`, `fr.json`
- `apps/desktop/src/components/shell.test.tsx`, `apps/desktop/src/features/preferences/preferences-panel.test.tsx`
- `apps/desktop/src/app/theme-contract.test.ts` (exact ACL assertion discovered by the execution gate)
- `apps/desktop/e2e/release.spec.ts` (only assertions on the Help/Preferences strings)
- `apps/desktop/src-tauri/src/lib.rs` (single-instance callback only)
- `apps/desktop/src-tauri/capabilities/main.json` (add one permission)
- `apps/desktop/src/styles/app.css` (remove the two `-webkit-app-region` lines only)
- `docs/UX.md`, `docs/platform-support.md` (wording only)

**Out of scope**:
- Implementing Linux/Windows selected-text capture (Plan 033 spike).
- Removing or resizing the 28 px drag strip (needs a physical per-OS review;
  see Maintenance notes).
- Narrowing `core:default` (Plan 027 does that and must keep
  `core:window:allow-start-dragging`).

## Git workflow

- Branch: `codex/023-honest-platform-ui`
- Commit message: `fix(desktop): show platform-accurate shortcuts and focus the running instance`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Resolve the Help popover per platform

In `shelf-chrome.tsx`, read `const { capabilities } = useNativePreferences();`
(import from `@/features/preferences/preferences-context`; the hook is already
used by `PreferencesPanel` — check its exact export name there). Then:

- Render the double-Shift row **only** when `capabilities?.doubleShift === 'available'`
  or `capabilities?.platform === 'macos'` (macOS shows it even when permission
  is pending, because Preferences explains the permission path). Otherwise
  render one row with `<span>{m.preferences_platform_fallback()}</span>` (no
  `<kbd>`).
- Replace `m.capture_help_composer_keys()` with
  `capabilities?.platform === 'macos' ? m.preferences_shortcut_macos() : m.preferences_shortcut_other()`.
  When `capabilities` is `undefined` (browser fixture), fall back to
  `navigator.platform.startsWith('Mac')` for the glyph choice.
- Delete `capture_help_composer_keys` from both message files (its only
  consumer was this row). Keep `capture_help_double_shift_keys`.

Update `shell.test.tsx:44` to render with a fake capabilities value for macOS
and assert `⌘ + Shift + Space`, and a second case for `platform: 'windows'`
asserting `Ctrl + Shift + Space` and the absence of "Shift Shift".

**Verify**: `bun run typecheck && bun run test:desktop` → pass; `grep -rn capture_help_composer_keys apps/desktop/src apps/desktop/messages` → no matches (excluding `src/paraglide`).

### Step 2: Surface the standard-shortcut state in Preferences

In `preferences-panel.tsx` shortcut row (`:211-231`), after the `<kbd>`, render
`stateIcon(native.capabilities.standardShortcut)` and, when the state is
`'error'` or `'unsupported'`, a `<p className="preferences-inline-warning">`
with `m.capture_error_shortcut_registration()` (already worded: "The shortcut
is already used or could not be registered. The visible capture command still
works."). Add a test in `preferences-panel.test.tsx` with
`standardShortcut: 'error'` asserting the warning text is visible, and one with
`'available'` asserting it is absent.

**Verify**: `bun run test:desktop` → pass, including the two new cases.

### Step 3: Fix the FR platform over-claim

`fr.json:142` → "Vos notes restent dans ce dossier, sur cet appareil." Confirm
`en.json:142` already says "device". No other change.

**Verify**: `grep -n "sur ce Mac" apps/desktop/messages/fr.json` → no matches.

### Step 4: Raise the running instance on a second launch

In `lib.rs:18`:

```rust
.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}))
```

`tauri::Manager` is already imported. Keep this plugin registered **first**
(it must precede other plugins per the plugin docs — it already is).

**Verify**: `cargo clippy ... -D warnings && cargo test ... --locked` → exit 0. Native (macOS host): run `bun run tauri:dev`, then launch a second instance from another terminal (`open -n` the dev bundle or run the binary again) → the first window comes to front and the second process exits.

### Step 5: Make the drag strip actually drag, and delete the Electron-only CSS

- `capabilities/main.json` → `"permissions": ["core:default", "core:window:allow-start-dragging", "clipboard-manager:allow-write-text", "dialog:allow-open"]`.
- `app.css:71` and `:84` → delete the two `-webkit-app-region` declarations
  (leave the `.window-drag-region` rule otherwise intact).

**Verify**: `bun run tauri:dev` on the macOS host → click-drag on the strip
above the search field moves the window (before this step it does not).
`bun run --cwd apps/desktop test:e2e -- --project=chromium` → passes (Playwright
does not touch the strip).

### Step 6: Align the docs

- `docs/platform-support.md`: add under "Current support state" that the Help
  surface now shows only capabilities the runtime reports, and that a failed
  standard-shortcut registration is displayed in Preferences.
- `docs/UX.md` "Keyboard contract": note that displayed shortcut glyphs
  resolve from `capabilities.platform` (⌘ on macOS, Ctrl elsewhere).

**Verify**: `git diff --stat` shows only in-scope files; `bun run typecheck && bun run test:desktop` → pass.

## Test plan

- Unit: `shell.test.tsx` — macOS vs Windows Help rendering (Step 1);
  `preferences-panel.test.tsx` — shortcut error state (Step 2).
- E2E: adjust any assertion on "⌘/Ctrl + Shift + Space" in
  `e2e/release.spec.ts` (grep first; the fixture runs in a browser where
  `capabilities` is undefined → the `navigator.platform` fallback applies; on
  the CI Linux runner assert `Ctrl + Shift + Space`).
- Native (macOS host): Steps 4 and 5 manual checks; record results in the plan
  status row.
- Rust: no new tests needed beyond compile/clippy.

## Done criteria

- [x] Help popover shows the double-Shift row only on macOS/available and a platform-resolved composer shortcut
- [x] Preferences shows the standard-shortcut state and the registration warning when `standardShortcut` is `error`/`unsupported`
- [x] `fr.json` no longer says "sur ce Mac"
- [x] Second launch focuses the existing window (verified natively on the host)
- [x] `capabilities/main.json` includes `core:window:allow-start-dragging`; `grep -n "webkit-app-region" apps/desktop/src/styles/app.css` → no matches
- [x] EN/FR key parity holds (`bun run typecheck` compiles Paraglide without missing-key errors); `bun run test:desktop` and Chromium E2E pass
- [x] `plans/README.md` status row for 023 updated

`AWAITING OPERATOR`: the macOS app starts and the second-instance focus path is
proved, but a human click-drag of the 28 px strip remains to be performed.

## STOP conditions

- `useNativePreferences` (or the equivalent hook) is not reachable from
  `ShelfActions` without restructuring providers — report instead of adding a
  new context.
- Granting `core:window:allow-start-dragging` fails Tauri's ACL validation at
  build time (permission name changed) — report the exact error.
- The single-instance callback needs a different plugin API than
  `get_webview_window`/`set_focus` — report.

## Maintenance notes

- Whether the 28 px strip should exist at all with native decorations is an
  operator/UX decision that needs a physical look on Linux (GNOME header bar)
  and Windows (title bar): with decorations on, the strip is a second drag
  surface and costs ~6% of the 480 px minimum height. Record the decision in
  `docs/UX.md` (and an ADR note if the drag region is removed).
- Plan 027 narrows `core:default`; it must keep `core:window:allow-start-dragging`
  (and `core:window:allow-internal-toggle-maximize` if double-click-to-maximize
  on the strip is desired).
- Plan 033 (Linux/Windows capture spike) will revisit the Help copy once a
  platform gains real double-Shift support.
