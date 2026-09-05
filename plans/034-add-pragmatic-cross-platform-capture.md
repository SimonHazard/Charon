# Plan 034: Add pragmatic Windows and Linux capture shortcuts

> **Executor instructions**: Implement the smallest honest cross-platform
> extension of Charon's capture gesture. Keep the existing macOS adapter
> unchanged. Windows and Linux X11 target unmodified double Shift. Wayland uses
> a conventional portal/global shortcut because an ordinary client cannot
> observe a global modifier-only sequence. Preserve all local-only, focus,
> clipboard, and no-Paste guarantees.
>
> **Drift check (run first)**:
> `git diff --stat 07dbb48..HEAD -- apps/desktop/src-tauri/src/capture apps/desktop/src-tauri/src/lib.rs apps/desktop/src apps/desktop/messages docs plans/README.md`
> ADRs 0015 and 0016 own the accepted platform and validation decisions. Stop if
> the active contracts no longer match this plan.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction, cross-platform, privacy
- **Planned at**: commit `07dbb48`, 2026-09-05

## Why this matters

The current capability model reports modifier capture and selected-text
acquisition as unsupported on Windows and Linux. The operator wants the same
memorable double-Shift gesture where public platform APIs permit it, without
turning a side project into a certification programme or weakening Charon's
input and clipboard boundaries.

## Platform target

| Runtime | Capture gesture | Acquisition | Composer shortcut |
| --- | --- | --- | --- |
| macOS | existing double Shift | existing AX then bounded Copy | `Cmd+Shift+Space` |
| Windows | double Shift | bounded UI Automation; bounded Copy only if ADR 0010-equivalent preservation is implementable | `Alt+Shift+Space` |
| Linux X11 | double Shift | bounded AT-SPI, then bounded PRIMARY | `Alt+Shift+Space` |
| Linux Wayland | unavailable as a global modifier-only sequence | none from double Shift; optional bounded AT-SPI only from an explicit shortcut if implemented safely | `Alt+Shift+Space` through the portal/global shortcut path |

`Alt+Shift+Space` is provisional until the operator confirms that “replace Cmd
with Alt” meant this exact combination. Do not implement a bare Alt or double-Alt
gesture: Alt is platform/menu input and would create avoidable collisions.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture` | all capture tests pass |
| Rust checks | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Bindings | `bun run bindings:check` | exit 0 |
| Desktop | `bun run typecheck && bun run test:desktop` | exit 0 |
| Privacy | `bun run check:privacy` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**:

- platform implementations under `apps/desktop/src-tauri/src/capture/`
- capture registration/wiring in `apps/desktop/src-tauri/src/lib.rs`
- existing capture capability DTOs only where a real platform state needs it
- Help/Preferences shortcut and capability copy in desktop source/messages
- focused unit and contract tests
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/UX.md`,
  `docs/platform-support.md`, and `plans/README.md`

**Out of scope**:

- Privileged helpers, Windows UIAccess/elevation, Linux input-group/evdev
  access, compositor-private Wayland protocols, key swallowing, Paste, OCR,
  screen capture, clipboard-history monitoring, or content logging.
- A configurable shortcut catalogue.
- Exhaustive application/desktop certification matrices.
- Rewriting the existing macOS capture adapter.

## Git workflow

- Branch: `codex/034-cross-platform-capture`
- Commit: `feat(capture): add pragmatic windows and linux shortcuts`
- Do not push or open a pull request unless the operator explicitly authorizes it.

## Steps

### Step 1: Lock the shared shortcut semantics

Reuse the existing pure double-Shift gesture machine for Windows and X11. The
native adapters emit only normalized Shift press/release events and never raw
content or general key logs. Ensure repeated Shift, intervening keys, long holds,
layout changes, start/stop, and duplicate listener registration have deterministic
tests.

Register and display the resolved composer shortcut per platform. Registration
failure leaves the visible composer usable and reports a content-free capability
error.

**Verify**: pure tests cover gesture recognition and exact platform shortcut
labels without running a native host.

### Step 2: Implement the Windows adapter

Use the public low-level keyboard hook on a dedicated thread, forward only the
events required by the shared state machine, chain every unhandled event, and
unhook on shutdown.

For acquisition, attempt a bounded focused UI Automation selection. Elevated,
protected, empty, timed-out, or unsupported targets are no-ops. Add an ADR
0010-equivalent Ctrl+C fallback only if the complete clipboard snapshot,
sequence guard, foreground guard, bounded timeout, and conditional restoration
can be implemented without weakening the existing contract; otherwise ship UIA
only and let unsupported applications fall back to the composer.

**Verify**: Windows-targeted compilation and unit tests pass; the adapter never
requests UIAccess or elevation.

### Step 3: Implement the Linux X11 adapter

Choose the smallest maintained public event mechanism compatible with the
checked toolchain and ADR 0015. Forward only Shift events into the shared gesture
machine and never consume them.

Read a bounded focused selection through AT-SPI, then use a bounded X11 PRIMARY
request when available. Do not synthesize Ctrl+C in the first X11 version.
Missing buses, owners, selections, or timeouts are no-ops with the composer
remaining available.

**Verify**: Linux-targeted compilation and unit tests pass; no evdev, XTest Copy,
or privileged input path exists.

### Step 4: Keep Wayland honest and functional

Detect Wayland and leave modifier-only capture unsupported. Register
`Alt+Shift+Space` through the available Tauri/portal global-shortcut path to
reveal Charon and focus the composer. If the portal or registration is absent,
show the exact fallback state without retry loops or background probing.

Do not add a compositor-specific double-Shift implementation. An explicit
shortcut-triggered AT-SPI selection attempt may be added only if it stays
bounded and does not expand this plan materially; otherwise defer it.

**Verify**: capability tests distinguish X11 from Wayland and never advertise
double Shift on Wayland.

### Step 5: Document and hand off live validation

Update Help, Preferences, and platform support with precise behavior. Label new
Windows/X11 paths experimental until normal user use establishes compatibility.
Provide a short issue template/checklist capturing OS/session, application,
expected behavior, actual behavior, and whether focus/clipboard changed. Never
ask users to include selected content or clipboard data.

Run the commands above. Native use by the operator and users is follow-up
feedback, not a blocking release matrix.

**Verify**: docs and UI agree; automated checks pass; no unsupported Wayland
claim exists.

## Test plan

- Pure gesture and capability-state tests on the development host.
- Cross-compilation or GitHub runner compilation for Windows and Linux.
- Focused adapter tests with mocked public API boundaries.
- Normal live use by the operator/users after release; reported failures become
  ordinary patch issues rather than retroactive release failures.

## Done criteria

- [ ] macOS behavior is unchanged.
- [ ] Windows and X11 route double Shift through the shared gesture machine.
- [ ] Windows/X11 acquisition fails closed and preserves focus/clipboard rules.
- [ ] Wayland does not claim double Shift and offers the explicit composer shortcut.
- [ ] Shortcut copy is platform-accurate in English and French.
- [ ] No privileged input, Paste, content logging, or broad clipboard monitoring
  was introduced.
- [ ] Deterministic checks pass; exhaustive physical certification is not required.

## STOP conditions

- The operator intended a shortcut other than `Alt+Shift+Space`.
- A Windows/X11 implementation requires privileged input, key swallowing,
  clipboard-history monitoring, or a weaker Copy transaction.
- The selected native dependency is abandoned, unpinned, or materially widens
  the binary/network surface.
- Wayland support would require evdev or a compositor-private protocol.

## Maintenance notes

Keep platform capability reporting more conservative than release availability.
User feedback may promote or narrow an experimental adapter, but it must never
silently widen Charon's privacy or input-injection boundary.
