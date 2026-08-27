# Plan 033: Spike — selected-text capture adapters for Windows and Linux (design + ADR, not a build)

> **Executor instructions**: This is a design/spike plan. Its output is an ADR
> draft, a throwaway prototype in a scratch branch, and an evidence table —
> not shipped code. Do not merge prototype code into `main`. Stop at every
> "STOP" boundary and report; the operator decides whether to fund a build
> plan afterwards. Respect `AGENTS.md`: never add automatic Paste, arbitrary
> keystroke injection, clipboard-history monitoring, OCR, screen capture, or
> private APIs; one bounded synthetic Copy per explicit gesture is the ceiling
> ADR 0010 permits.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/src/capture docs/platform-support.md docs/adr/0002-platform-capture.md docs/adr/0008-macos-capture-permissions-and-signing.md docs/adr/0009-public-accessibility-selection.md docs/adr/0010-bounded-copy-selection-fallback.md docs/PRIVACY.md`
> If any in-scope file changed since this plan was written, re-read them before
> proceeding.

## Status

- **Priority**: P3 (direction)
- **Effort**: M for the spike; a build would be L per platform
- **Risk**: LOW for the spike (no product change)
- **Depends on**: `plans/021-make-workspace-persistence-portable.md`, `plans/022-restore-three-os-rust-gate.md`, `plans/023-make-desktop-ui-honest-per-platform.md` (the base app must run and be verified on Linux/Windows first)
- **Category**: direction
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters (grounded)

`docs/PRODUCT.md` "Jobs" leads with "Capture non-empty selected text without
showing Charon or taking source focus **on a proved macOS adapter**", and
`docs/platform-support.md` records modifier capture and selected-text
acquisition as **Not implemented** on Linux X11, Linux Wayland, and Windows.
The operator wants Linux, Windows, and macOS support; today those platforms
get only the visible composer and the `CmdOrCtrl+Shift+Space` reveal — the
headline capture job is macOS-only. The Rust architecture is ready for it:
`PlatformCapturePort` (`capture/coordinator.rs:14-24`) already abstracts
`input_monitoring_state`, `accessibility_state`, `start`, `request_permission`,
`selected_text`, and the Linux/Windows adapters are stubs
(`capture/platform/linux.rs`, `windows.rs`) returning `Unsupported`. The
double-Shift state machine (`capture/gesture.rs`) is platform-neutral and
well tested. What is missing is a *decision* on what each OS can honestly
support, under the same privacy ceiling as ADR 0009/0010, and evidence.

## Current state

- `apps/desktop/src-tauri/src/capture/platform/mod.rs` — `create()` picks the
  adapter by `target_os`; the macOS adapter (`macos/{listener,accessibility,pasteboard,permissions}.rs`)
  implements: passive CGEvent tap for unmodified double-Shift → pure gesture
  state machine → AX ladder → bounded single synthetic Cmd+C with pasteboard
  snapshot/change-count/timeout/restore.
- `apps/desktop/src-tauri/src/capture/platform/linux.rs` — detects
  `LinuxWayland`/`LinuxX11` from `WAYLAND_DISPLAY`/`XDG_SESSION_TYPE`; all
  capabilities `Unsupported`.
- `apps/desktop/src-tauri/src/capture/platform/windows.rs` — all `Unsupported`.
- `apps/desktop/src-tauri/tests/capture_contract.rs` — coordinator contract
  (denied/unsupported paths, DTO serialization incl. `LinuxWayland`).
- ADR 0009 (public accessibility ladder), ADR 0010 (bounded Copy fallback),
  ADR 0008 (macOS permissions), `docs/PRIVACY.md` (clipboard transient
  disclosure). `docs/platform-support.md` "Current support state" table.
- Cargo deps are exactly pinned; adding a crate needs an explicit decision
  (`AGENTS.md`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass (must stay green; the spike lives in a scratch branch) |
| Prototype (Windows host) | `cargo run` in a scratch crate | see Step 2 |
| Prototype (Linux host) | `cargo run` in a scratch crate | see Step 3 |

## Scope

**In scope**:
- `docs/adr/0015-linux-windows-capture-adapters.md` (draft, status *Proposed*)
- `docs/platform-support.md` (evidence table rows for the spike results)
- A scratch branch `spike/033-capture-adapters` with throwaway prototypes under
  `apps/desktop/src-tauri/spikes/` (never merged)

**Out of scope**:
- Any change to `main`'s Rust source, capabilities, permissions, or UI.
- Shipping either adapter.

## Git workflow

- Branch: `spike/033-capture-adapters` (prototype), `codex/033-capture-adr` (ADR + docs only)
- Commit message (ADR branch): `docs(adr): propose linux and windows capture adapters`
- Do NOT push, or open a PR, unless the operator instructed it.

## Steps

### Step 1: Write down the platform options and constraints (desk research, ≤1 day)

For each OS, fill a table in the ADR draft with: modifier-listener mechanism,
selected-text acquisition mechanism, permission model, Wayland/X11 caveats,
signed-build/consent requirements, and how it maps onto the existing
`PlatformCapturePort` and ADR 0009/0010 bounds. Starting points (verify
against current official docs; do not trust this list blindly):

- **Windows**: passive modifier listener via a low-level keyboard hook
  (`SetWindowsHookExW(WH_KEYBOARD_LL)`, message loop on a dedicated thread —
  observe only, never swallow); selection via UI Automation
  (`IUIAutomation` → focused element → `TextPattern`/`TextPattern2`
  `GetSelection`), with ADR 0010-style bounded fallback: `Ctrl+C` via
  `SendInput` to the unchanged foreground window, clipboard sequence number
  (`GetClipboardSequenceNumber`) as the change-count analogue, snapshot/
  restore of text formats only, timeouts. No OS permission prompt exists;
  disclose in Preferences. Consider elevated windows (UIPI blocks hooks/
  input into elevated processes) as a documented no-op.
- **Linux X11**: passive listener via XRecord or `XInput2` raw events (X11
  only); selection via AT-SPI2 (`atspi` D-Bus: focused accessible → text
  interface `get_selection`), fallback: the **PRIMARY** selection
  (`XConvertSelection`/`xclip`-style read) is available without any synthetic
  key — note it is *not* the clipboard and may be preferable to a synthetic
  Ctrl+C; if a synthetic Copy is still needed, `XTest` and CLIPBOARD
  ownership change as change-count.
- **Linux Wayland**: no global passive key listening for ordinary clients;
  options are compositor-specific (GNOME/KDE global shortcuts portal
  `org.freedesktop.portal.GlobalShortcuts` — supports **shortcuts**, not
  modifier-only sequences), `wlr-` protocols on wlroots compositors, or
  evdev with `input` group membership (privileged; likely a no-go for the
  privacy posture). AT-SPI2 still works on Wayland for selection. Conclusion
  candidate: Wayland supports the *portal global shortcut* → reveal composer,
  and possibly "capture selection on shortcut" via AT-SPI/PRIMARY, but **no
  double-Shift** — state that honestly.

**Verify**: the ADR draft contains one table per OS with citations (URLs) and an explicit "not possible / not acceptable" row where applicable.

### Step 2: Windows prototype (Windows host required — STOP if none is available)

In the scratch crate: (a) low-level keyboard hook that feeds `gesture.rs`'s
state machine (copy the module) and logs only "gesture fired" (no keycodes,
no text); (b) UIA `TextPattern` selection read from the focused element in
Notepad, Edge, VS Code, Word, a UWP app; (c) bounded Ctrl+C fallback with
clipboard sequence-number guard and restore, timing measurements; (d)
behaviour against an elevated window and a UWP app. Record a matrix like
`docs/platform-support.md`'s macOS one (pass/fail per app + path used).

**Verify**: matrix filled in the ADR draft; no content or keycodes logged (grep the prototype for `println!` and confirm only markers).

### Step 3: Linux prototype (X11 and Wayland sessions — STOP if none available)

Same shape: (a) X11 XRecord/XInput2 passive double-Shift → gesture machine;
(b) AT-SPI2 selection read (GTK4, Qt, Firefox, Chromium, Electron); (c)
PRIMARY-selection read as fallback (no synthetic key); (d) on Wayland
(GNOME + KDE + one wlroots): portal GlobalShortcuts registration for
`Ctrl+Shift+Space`, AT-SPI2 read on shortcut, and confirmation that no
passive double-Shift path exists without privileged input access.

**Verify**: matrix filled; Wayland row states plainly which gesture is possible.

### Step 4: Draft ADR 0015 and update the ledger

ADR 0015 (Proposed) must decide, per OS: gesture supported (double-Shift /
shortcut-only / none), acquisition ladder order (accessibility first; PRIMARY
or bounded Copy fallback), permission/disclosure text, what remains
`Unsupported`, and the physical matrix required before any claim. Include
open questions (elevated windows, IMEs that use Shift-Shift, Wayland portal
availability by distro, antivirus heuristics on keyboard hooks, signed-build
requirements). Update `docs/platform-support.md` with a "Spike 033 evidence"
section (dates, hosts, results). Propose the follow-up build plans (one per
OS) with effort estimates.

**Verify**: ADR file exists with status Proposed; `plans/README.md` status row updated to `AWAITING OPERATOR: Windows and Linux X11/Wayland hosts for physical spike evidence and ADR 0015 decision`.

## Test plan

- No production tests change. The prototypes carry their own logging-free
  smoke checks. `cargo test` on `main` remains untouched.

## Done criteria

- [ ] `docs/adr/0015-linux-windows-capture-adapters.md` drafted with per-OS options, decision proposal, and open questions
- [ ] Evidence matrices for Windows and Linux (X11 + Wayland) recorded, or the row states which host was unavailable
- [ ] `docs/platform-support.md` updated with spike evidence, no support claim
- [ ] Prototype code lives only on the scratch branch
- [ ] `plans/README.md` status row for 033 updated

## STOP conditions

- No Windows or Linux host is available — finish Step 1 + the ADR draft's
  desk-research part and mark `AWAITING OPERATOR: hosts`.
- A viable path requires privileged input access, a private API, clipboard
  history, OCR, or screen capture — record it as rejected in the ADR; do not
  prototype it.
- The operator has already decided that Linux/Windows stay composer-only —
  close this plan as `REJECTED` with that reference.

## Maintenance notes

- If ADR 0015 is accepted, each OS becomes its own build plan following the
  macOS pattern (adapter behind `PlatformCapturePort`, contract tests, physical
  matrix, `docs/platform-support.md` promotion, Help copy from Plan 023).
- Keep the double-Shift gesture machine platform-neutral; adapters only feed
  normalized events.
