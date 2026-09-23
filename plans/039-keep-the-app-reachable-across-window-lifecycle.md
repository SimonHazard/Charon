# Plan 039: Keep Charon running when its macOS window is closed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tauri.conf.json apps/desktop/src/app/window-config.test.ts apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/features/notes/note-editor.test.tsx docs/UX.md docs/platform-support.md README.md && git status --short -- apps/desktop docs README.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 042 and 046
> may have landed first and edited `note-editor.tsx`; that is expected drift.
> Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 036 (DONE: Quality compiles the macOS-only code)
- **Category**: bug
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

On macOS the red close button destroys the only window, which shuts down the
capture listeners and exits; macOS users expect close-to-hide, with the Dock
icon keeping the app and its double-Shift gesture alive. Windows and Linux
keep close-quits, which is their convention. Separately, the window-state
plugin persists every flag, including VISIBLE, DECORATIONS and FULLSCREEN,
which Charon never needs; restoring only size, position and maximized keeps
relaunch predictable. The window is also shown at its default size before the
plugin moves it; the window-state guide recommends creating it hidden and
showing it once restored (<https://v2.tauri.app/plugin/window-state/>).

## Current state

- `apps/desktop/src-tauri/src/lib.rs:13-75` (the whole builder). Relevant lines:

```rust
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        …
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Focused(true)) {
                ipc::capture::handle_main_focus(window.app_handle());
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                ipc::capture::shutdown(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Charon");
```

- `tauri-plugin-window-state 2.4.1`: `StateFlags::default()` = `all()`;
  `Builder::with_state_flags(StateFlags)` exists. Restore (in `on_window_ready`)
  calls `show()` and `set_focus()` only when VISIBLE is set **and** the saved
  state was visible (`should_show = state.visible`, `src/lib.rs:179-265`); it
  never hides. So `"visible": false` plus the VISIBLE flag would leave the app
  invisible after quitting while hidden (possible once close hides on macOS).
- Tauri 2.11.5 creates config windows before the `setup` hook
  (`src/app.rs:2524-2531`), so `setup` runs after the plugin restored size and
  position.
- `apps/desktop/src-tauri/tauri.conf.json` `app.windows[0]` has no `visible` key
  (default `true`). Plan 038 adds `backgroundColor` there.
- `apps/desktop/src/app/window-config.test.ts:35-39` ("keeps the native saved
  window state plugin authoritative") asserts the literal
  `.plugin(tauri_plugin_window_state::Builder::default().build())`.
- `apps/desktop/src/features/notes/note-editor.tsx:193-217` registers
  `appWindow.onCloseRequested`: for a clean draft it returns (Tauri then
  destroys the window, because a JS close listener exists), for a dirty draft
  it calls `preventDefault()`, flushes, then `appWindow.destroy()`. With an
  editor expanded, Charon therefore quits even if Rust hides on close.
- `ipc::capture::shutdown` is idempotent (`capture.rs:206-222`, uses `take()`).
  `handle_main_focus` (`capture.rs:235-237`) only emits pending status.
  `macos/mod.rs:82-85` returns an empty selection while Charon is frontmost.
- Tauri 2.11.5: `tauri::RunEvent::Reopen { .. }` exists (`app.rs:279`, macOS,
  non-exhaustive); `enable_macos_default_menu` is true, so Cmd+Q exits through
  the default menu and emits `RunEvent::Exit`. The updater restart goes through
  `request_exit` and does not need the window destroyed.
- `docs/UX.md` "Single-shelf layout" (around line 38) says nothing about close
  semantics; `docs/platform-support.md` has a `## macOS evidence and limits` section.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust fmt/clippy/test | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Desktop unit | `bun run --cwd apps/desktop test -- src/app/window-config.test.ts src/features/notes/note-editor.test.tsx` | pass |
| Full | `bun run check` | exit 0 |
| Native smoke (macOS) | `bun run tauri:dev` | see Step 4 |

## Scope

**In scope**: `apps/desktop/src-tauri/src/lib.rs`,
`apps/desktop/src-tauri/tauri.conf.json` (`visible` only),
`apps/desktop/src/app/window-config.test.ts`,
`apps/desktop/src/features/notes/note-editor.tsx`,
`apps/desktop/src/features/notes/note-editor.test.tsx`, `docs/UX.md`,
`docs/platform-support.md`, `README.md`.

**Out of scope**:
- A tray icon or minimize-to-tray (`docs/FEATURE_BACKLOG.md` item needing a UX/privacy decision).
- `ipc::capture::shutdown` internals.
- Windows/Linux close behaviour (stays close-quits).

## Git workflow

- Branch: `codex/039-window-lifecycle`
- Commits: `chore(desktop): persist only size, position and maximized window state`,
  `feat(macos): hide on close and reopen from the dock`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Restrict persisted window state

Replace the plugin line with:

```rust
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
```

Add `"visible": false` to the `main` window in `tauri.conf.json`, and at the
end of the `setup` hook show it explicitly (after the plugin restored it):
`if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }`
(reuse `reveal_main` once Step 2 adds it). Never rely on the plugin to show it.

Replace the `window-config.test.ts` case at 35-39 so it asserts
`with_state_flags(` and the three flag names, that `StateFlags::VISIBLE` is
absent, that the main window config has `visible: false`, and that `lib.rs`
shows the main window in `setup`.

**Verify**: Rust command → exit 0; unit test → pass.

### Step 2: macOS close-to-hide, Dock reopen, capture shutdown on exit

```rust
fn reveal_main<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
// single instance: .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| reveal_main(app)))
// in on_window_event, before the Destroyed arm:
            #[cfg(target_os = "macos")]
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window.hide().is_ok() {
                        api.prevent_close();
                    }
                }
            }
// replacing .run(tauri::generate_context!()).expect("failed to run Charon"):
        .build(tauri::generate_context!())
        .expect("failed to build Charon")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => reveal_main(app),
            tauri::RunEvent::Exit => ipc::capture::shutdown(app),
            _ => {}
        });
```

Cmd+Q exits through the default macOS menu; `RunEvent::Exit` then stops
capture (idempotent with the `Destroyed` path).

**Verify**: Rust command → exit 0 (clippy on Linux too; the arms are cfg-gated).

### Step 3: Keep the webview's close guard from destroying on macOS

In `note-editor.tsx`, read
`const macos = capabilities?.platform === 'macos' || (!capabilities && navigator.platform.startsWith('Mac'))`
from `useNativePreferences()` and mirror it in a ref. Change the handler to:

```ts
.onCloseRequested(async (event) => {
  const macos = macosRef.current;
  if (!macos && !inFlight.current && draftRef.current.value === lastSavedBodyRef.current) return;
  event.preventDefault();
  if ((await flushDraft()) && !macos) await appWindow.destroy();
})
```

**Verify**: new `note-editor.test.tsx` cases: on macOS, a clean close and a
dirty close both flush without calling `destroy`. The existing Windows/Linux
expectations (around lines 366, 405 and 439-445) stay unchanged → pass.

### Step 4: Native smoke on macOS (operator or executor with a Mac)

`bun run tauri:dev`, then:
- launch: the window appears once, already at its saved size and position
  (no jump), on the canvas colour;
- close with the red button → window hides, Dock icon stays; press
  `Cmd+Shift+Space` → window returns focused; click the Dock icon → window
  returns; `Cmd+Q` quits;
- close with an expanded editor, once clean and once dirty → the window hides,
  Charon keeps running, and the dirty body is saved;
- after hiding, click into another app, select text and double Shift →
  exactly one Note is created (capturing while Charon itself is still
  frontmost is expected to create nothing);
- with an update staged (optional), hide, reopen and restart → the app relaunches.

Cmd+Tab to Charon does not reveal the hidden window; that is standard macOS
behaviour. Record the result in the commit body. If no Mac is available, mark
the step as "unverified natively" in the README status. Afterwards delete
`apps/desktop/src-tauri/target/debug` (AGENTS hygiene).

### Step 5: Documentation

- `docs/UX.md` "Single-shelf layout": "On macOS, closing the window hides
  Charon and keeps capture armed; the Dock icon or `Cmd+Shift+Space` brings it
  back, and `Cmd+Q` quits. On Windows and Linux, closing the window quits."
- `docs/platform-support.md` `## macOS evidence and limits` and `README.md`
  Features: one sentence each.

**Verify**: `bun run check` → exit 0.

## Test plan

- `window-config.test.ts`: flags assertion; presence of `CloseRequested` +
  `prevent_close` + `RunEvent::Reopen` + `RunEvent::Exit` in `lib.rs` (string
  assertions, matching the file's existing style).
- `note-editor.test.tsx`: macOS clean and dirty close cases.
- Rust: no unit test possible for window events; Step 4 is the manual gate.

## Done criteria

- [ ] Rust fmt/clippy/test exit 0 locally
- [ ] `grep -n "StateFlags::VISIBLE" apps/desktop/src-tauri/src/lib.rs` → nothing; `grep -n "with_state_flags" apps/desktop/src-tauri/src/lib.rs` → one
- [ ] `grep -n "RunEvent::Reopen\|RunEvent::Exit" apps/desktop/src-tauri/src/lib.rs` → one each
- [ ] macOS note-editor close tests pass; `bun run check` exits 0
- [ ] Step 4 outcome recorded (verified or explicitly unverified)
- [ ] `plans/README.md` status row updated

## STOP conditions

- After hiding with the red button and activating another app, double Shift
  on a real selection creates no Note: STOP and report.
- `cargo clippy` flags the `RunEvent` match as non-exhaustive or unreachable on
  Linux/Windows despite the cfg gate: report rather than adding allow attributes.

## Maintenance notes

- A future tray plan should reuse `reveal_main(app)`.
- Reviewer: confirm `Cmd+Q` still terminates, that `shutdown` runs at least
  once and is harmless twice, and that a dirty draft is never lost on hide.
