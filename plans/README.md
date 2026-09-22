# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- A protected merge to `main` automatically builds and publishes Apple Silicon
  macOS, Linux, and Windows Tauri releases only when the four manifests contain
  one new consistent version. The workflow creates the matching `vX.Y.Z` tag
  after
  every platform succeeds.
- The signed in-app updater uses public GitHub Release assets. Checks are
  default-off until enabled; install and restart remain explicit and draft-safe.
- Deterministic version, compilation, privacy, data-safety, updater-signature,
  and release-asset checks remain. Exhaustive physical certification is not a
  release gate; operator use and user reports drive patch releases.
- macOS keeps double Shift and `Cmd+Shift+Space`. Windows and Linux X11 implement
  experimental double Shift and use `Alt+Shift+Space` for composer focus. Wayland
  uses a portal-assigned composer shortcut and never claims a modifier-only gesture.
- The repository is public. Contributions use pull requests, Simon Hazard is
  the principal maintainer, and protected `main` updates deploy the static site.

## Active queue

| Plan | Title | What it does | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 015 | Publish automatic Tauri releases and integrated updates | Automatic three-OS release on a new manifest version plus signed updater | P1 | M | — | IN PROGRESS: implementation ready; first versioned merge pending |
| 035 | Show the registered composer shortcut on every platform | Adds a pure accelerator formatter, renders formatted `activeShortcut` in Help and Preferences, and covers Windows, X11, Wayland, macOS, and localized labels | P1 | S | — | DONE |
| 036 | Compile and lint the Rust core on macOS and Windows in Quality | Adds a macOS/Windows clippy+test matrix, aligns `rust-version`, locks the release build, guards Rust message keys, and fills the missing localized Workspace-health message | P1 | S | — | DONE |
| 037 | Make the updater and installers honest per bundle type | Reports install kind, explains deb/rpm/MSI manual updates, warns macOS re-grant, drops tray/xdo Linux deps | P1 | M | 036 | DONE |
| 038 | Follow the OS appearance and paint before the webview loads | Adds a System theme default, pre-paint canvas colour, window `backgroundColor`, platform attribute | P1 | M | — | TODO |
| 039 | Keep Charon reachable across hide, close and relaunch | Persists only size/position/maximized; macOS close hides and Dock reopen restores | P2 | M | 036 | TODO |
| 040 | Build the Lavender token foundation | Lavender ramp, contrast checker, per-theme elevation, type/weight/space scales, selection/caret/scrollbar polish | P1 | M | 038 | TODO |
| 041 | Apply the accent and polish components | Lavender on composer submit, done check, active states; hover/pressed transitions; empty/skeleton/press fixes | P1 | M | 040 | TODO |
| 042 | Give row actions immediate feedback | Optimistic status with check-in cue, in-place copy confirmation, busy states for tag removal and close | P1 | M | 041 | TODO |
| 043 | Keep toasts off the composer and reduced-motion safe | Top-anchored toast viewport, travel token, reduced-motion e2e | P2 | S | — | TODO |
| 044 | Accept multi-line Markdown in the composer | Auto-growing textarea, Enter creates, Shift+Enter newline, IME guard kept | P1 | M | — | TODO |
| 045 | Acknowledge a captured Note | Content-free success status with Note id, announcement, scroll-to and decaying Lavender tint | P1 | M | 042, 043 | TODO |
| 046 | Close the keyboard and search fluidity gaps | Scroll expanded editor into view, Escape clears search, result count, Home/End, row Cmd+C, editor Cmd+S | P2 | M | 042 | TODO |
| 047 | Hoist the update dialog and restyle the language select | Dialog outside the popover with focus return; themed Base UI Select | P2 | S | 041 | TODO |
| 048 | Test motion behaviour and amend ADR 0005 | Interruption/reduced-motion e2e, ADR amendment for virtualizer and paint-only transitions, `will-change` cleanup | P2 | M | 041, 042, 043 | TODO |

Recommended order: 035 → 036 → 037 → 038 → 040 → 041 → 044 → 042 → 043 → 045 → 046 → 047 → 039 → 048.
035, 036, 038, 043 and 044 are independent and can run in parallel worktrees.

## Advisory audit of 2026-09-21

Plans 035-048 come from a read-only audit at commit `d0efa57` (standard
depth: cross-platform shell, UI/theme, motion, UX flows; the Rust Workspace
core, the site, and dependency/security categories were not re-audited).
Goals set by the operator: availability on Linux, macOS and Windows; the most
fluid experience; a premium UI built on Charon Lavender.

### Direction (options for the operator, not planned)

- **Animate the editor expansion height.** `docs/UX.md` deliberately snaps the
  row height so expansion never waits on layout motion. A measured-height
  animation (reserve the target height in the virtualizer, animate a wrapper)
  would read as "expand from the live row" but needs a UX/ADR amendment and a
  virtualizer measurement strategy; effort L.
- **Retint Graphite toward neutral graphite.** Dark surfaces are all
  prune-hued (`#211a2d`, `#2a2236`…), so Lavender has little room to pop.
  Identity decision; effort M after plan 040.
- **Delta command results.** Every Workspace command returns the full
  snapshot. A `changedNotes + revision` result would make writes feel local at
  20k Notes; IPC contract and bindings change; spike first. Effort L.
- **A generated keyboard cheat sheet** built from the UX keyboard contract and
  `activeShortcut`, in the Help popover. Effort M after 046.
- **Preferences container.** Five sections in one 400x480 popover; a dedicated
  panel would need the UX contract amended.
- **Drop MSI** to halve the Windows surface once 037 makes it honest.

### Findings considered and rejected

- Shadow or hover lift on Note rows: rejected by `docs/UX.md` ("row lift, hover shadow").
- Editor expansion "snaps": by design per `docs/UX.md`; see Direction.
- macOS Edit-menu shortcuts missing: Tauri installs a default macOS menu with
  undo/redo/cut/copy/paste; localizing it is optional polish, not a defect.
- Multi-monitor window restore and inner/outer size drift: handled by the
  window-state plugin.
- Search match highlighting: not worth it inside a virtualized list; the
  count announcement (046) covers orientation.
- Animating search results, tag chips or list entrances: rejected by the UX contract.
- Unsigned distribution, Apple Silicon-only macOS, no Wayland double-Shift,
  experimental Windows/X11 capture: decided in ADRs 0014-0017.

Status values are `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, and
`REJECTED: <reason>`.

## GitHub secrets and variables

Create a GitHub Actions environment named `release`, without a required reviewer,
and store exactly for the current unencrypted key:

- `TAURI_SIGNING_PRIVATE_KEY`: complete private updater key content.

Commit only the matching public key. Back up the private key outside Git;
losing it prevents existing installations from accepting later updates.

GitHub supplies `secrets.GITHUB_TOKEN`; do not create it. No GitHub Actions
variable is required. Do not create Apple, notarization, Authenticode, or paid
certificate secrets. macOS remains ad-hoc signed and Windows/Linux remain
unsigned under ADR 0014.

The unrelated `site-production` environment already contains
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Desktop release jobs never
receive those values.

## Plan lifecycle

One plan describes one bounded implementation. After its done criteria pass,
migrate any durable decision or milestone into docs/ADRs/history, remove its
live references, then delete the plan. Git history remains the detailed
archaeological record; do not create an execution-journal archive.
