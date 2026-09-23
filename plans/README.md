# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- A protected merge to `main` automatically builds and publishes Apple Silicon
  macOS, Linux, and Windows Tauri releases only when the four manifests contain
  one new consistent version. The workflow creates the matching `vX.Y.Z` tag
  after every platform succeeds. v0.1.0, v0.1.1, and v0.1.3 are published;
  v0.1.3 is the first Apple Silicon macOS release.
- The signed in-app updater uses public GitHub Release assets. Checks are
  default-off until enabled; install and restart remain explicit and draft-safe.
  deb, rpm, and MSI installations are told to update manually.
- Deterministic version, compilation, privacy, data-safety, updater-signature,
  and release-asset checks remain. Quality compiles and tests the Rust core on
  Linux, macOS, and Windows. Exhaustive physical certification is not a release
  gate; operator use and user reports drive patch releases.
- macOS keeps double Shift and `Cmd+Shift+Space`. Windows and Linux X11 implement
  experimental double Shift and use `Alt+Shift+Space` for composer focus. Wayland
  uses a portal-assigned composer shortcut and never claims a modifier-only gesture.
- The repository is public. Contributions use pull requests, Simon Hazard is
  the principal maintainer, and protected `main` updates deploy the static site.

## Active queue

| Plan | Title | What it does | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 038 | Follow the OS appearance and paint before the webview loads | Adds a System appearance default (new ADR amending ADR 0012), a pre-paint canvas colour, and a window `backgroundColor` | P1 | M | — | IN PROGRESS: PR #64, awaiting operator test |
| 040 | Build the Lavender token foundation | Lavender ramp, extended contrast fixture, per-theme floating/modal shadows, type/weight/space scales outside Tailwind namespaces, selection and caret polish | P1 | M | — | IN PROGRESS: PR #65, awaiting operator test |
| 041 | Apply the accent and polish components | New ADR allowing paint-only feedback transitions; Lavender composer submit; transitioned hover/pressed/selected states; one CSS press implementation | P1 | M | 040 | TODO: ADR approved 2026-09-23 |
| 044 | Accept multi-line Markdown in the composer | Auto-growing textarea with a WebKit fallback, Enter creates, Shift+Enter newline, IME guard kept, UX contract amended | P1 | M | 041 | TODO |
| 042 | Give row actions immediate feedback | Sequence-safe optimistic status with check-in cue, in-place copy confirmation, busy tag removal and close | P1 | M | 041 | TODO |
| 043 | Keep toasts off the composer and reduced-motion safe | Top-anchored toast stack with flipped swipe, travel token, reduced-motion exit crossfade | P2 | S | — | TODO |
| 045 | Acknowledge a captured Note | Content-free success status with the Note id (queued, not single-slot), shelf-only announcement, scroll, and fading Lavender tint | P1 | M | 041 | TODO |
| 052 | Retire the per-update macOS permission notice | Drops the install-dialog regrant warning once ADR 0018 signing keeps TCC grants | P1 | S | ADR 0018 PR | TODO |
| 053 | Keep drafts safe when Windows installs an update | Re-checks drafts right before install, explicit "Close and install" on NSIS, relaunch after install | P1 | S | 052 | TODO |
| 054 | Align the Tauri configuration with official guidance | Minimal capability (drop clipboard, add resources close), release size profile, `removeUnusedCommands`, Linux build on ubuntu-22.04 with a glibc check, Vite dev settings, unused JS plugin removed | P2 | M | ADR 0018 PR | TODO |
| 046 | Close the keyboard and search fluidity gaps | Scroll expanded editor into view, Escape clears search, debounced result count, Home/End, row Cmd+C, editor Cmd+S, Help rows | P2 | M | 042 | TODO |
| 047 | Hoist the update dialog and restyle the language select | Test-first dialog focus/progress fix; themed Base UI Select | P2 | S | 041 | TODO |
| 049 | Make Done and expanded row states legible | Visible Tag chips on Done rows, title-only strike, `aria-expanded` and a useful Edit click on expanded rows | P2 | S | 041, 042 | TODO |
| 050 | Exit transient surfaces faster than they enter | Adds an exit duration token (110ms vs 160ms in) to Tooltips, Popovers, dialogs and Select; same path, amended UX timing | P3 | S | 041, 047 | TODO: UX change approved 2026-09-23 |
| 056 | Give icon-only controls consistent Tooltips | Tooltip inventory and rule, missing/wrong Tooltips fixed, tooltip-only help made reachable, `data-slot` override bug fixed | P1 | M | 041, 050 | TODO: operator questions in the plan |
| 057 | Show version and open-source links in Preferences | Quiet About section: version, MIT, repository and CONTRIBUTING links opened only on click | P3 | S | 047 | TODO |
| 058 | Make the Markdown help match the Preview | Examples tested against the safe renderer, unsupported syntax marked, front-matter hiding bug fixed | P3 | S | — | TODO |
| 051 | Fade the Note list at clipped scroll edges | New ADR narrowing "no gradients" to allow one alpha mask; fades only the edge that clips content, no scroll listener, contrast/transparency fallbacks | P3 | S | 046 | TODO: ADR approved 2026-09-23 |
| 039 | Keep Charon running when its macOS window is closed | macOS close hides (including with an open editor), Dock reopens, capture stops on exit; persists only size/position/maximized | P2 | M | — | TODO |
| 055 | Harden the IPC trust boundary | App-manifest command ACL, single-use Workspace folder token, IPC argument contract test | P3 | M | 054, 045 | TODO |
| 048 | Test motion behaviour | Interruption, reduced-motion, keyboard and status-dot e2e; drops standing `will-change` and a dead rule | P2 | M | 041, 042, 043 | TODO |
| 059 | Keep Charon running in the tray on close | Opt-in background mode with a menu-bar/notification-area menu and explicit Quit; new ADR and a native spike first | P2 | L | 039 | TODO: ADR + spike gate |
| 060 | Notify when a capture creates a Note | Opt-in, content-free system notification; click-to-open only where the spike proves it; new ADR first | P2 | M-L | 045 | TODO: ADR + spike gate |
| 061 | Let users change the composer shortcut | One user-chosen reveal/composer accelerator with rollback and reset (double Shift fixed, Wayland shows the portal's choice); new ADR narrowing a PRODUCT non-goal | P2 | M | — | TODO: ADR + spike gate |
| 062 | Keep formatting from captured HTML | Opt-in macOS Copy-fallback HTML converted to Markdown with plain-text fallback; amends ADR 0010; spike first | P3 | L | 045 | TODO: ADR + spike gate |

Recommended order: 038 → 040 → 041 → 044 → 042 → 043 → 045 → 052 → 053 → 054 → 046 → 047 → 049 → 050 → 056 → 057 → 058 → 051 → 039 → 055 → 048 → 059 → 060 → 061 → 062.
[`RUNBOOK.md`](RUNBOOK.md) chains this queue in six batches with pull
requests and operator test gates: A+B release as `0.2.0`, C+D as `0.3.0`, and
the backlog features (E: 059-060, F: 061-062) as proposed `0.4.0` and `0.5.0`.
038 and 043 are independent and can run in parallel worktrees; 044 must not
run in parallel with 041. Plans 038, 041 and 051 each create one ADR and take
the next free number when they land. Plans 038, 040, 041, 045 and 047 overlap the
operator's macOS-permission work (Preferences, messages, `app.css`,
`docs/UX.md`), which lands in its own pull request before the queue starts.

## Advisory audit of 2026-09-21, reviewed on 2026-09-23

Plans 038-048 come from a read-only audit at commit `d0efa57` (standard
depth: cross-platform shell, UI/theme, motion, UX flows; the Rust Workspace
core, the site, and dependency/security categories were not re-audited).
Goals set by the operator: availability on Linux, macOS and Windows; the most
fluid experience; a premium UI built on Charon Lavender. Plans 035-037 shipped
in v0.1.3 and were removed.

On 2026-09-23 every remaining plan was re-verified against `242d51e` and the
working tree: drift checks now include uncommitted edits, stale line
references and wrong premises were corrected, contract changes were given
explicit ADR steps, and plan 048's ADR amendment moved to plan 041 Step 0 so
it lands before its first consumer. A browser review of the demo fixture
through the `emil-design-eng` lens added plan 049. The operator then asked for
plans 050 and 051, which amend two UX rules first listed below as rejected.

Also on 2026-09-23: ADR 0018 replaced macOS ad-hoc signing with a stable
self-signed identity (its own pull request, landed before the queue); plan
052 retires the now-false in-app notice. An audit against the official Tauri v2
documentation produced plans 053-055 and extended 039 (start hidden, show
after restore). The `docs/FEATURE_BACKLOG.md` ideas became plans 056-062;
059-062 each start with an ADR and a native spike that the operator approves.

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
- **Drop MSI** to halve the Windows surface; since v0.1.3 MSI installs are told
  to update manually, and the MSI is English-only (WiX default) while NSIS
  ships English and French.
- **Self-update deb, rpm and MSI installs.** `tauri-plugin-updater` 2.11.0
  looks up `{os}-{arch}-{installer}` keys first and can install deb, rpm and
  MSI packages; `latest.json` would need those entries, and deb/rpm installs
  need elevated rights. Product decision; effort M.
- **Tauri isolation pattern.** Tauri recommends it; Charon loads no remote
  content and bundles every script, so the benefit is limited to a compromised
  frontend dependency, at the cost of an isolation hook and asset. Revisit
  after plan 055.
- **Announce v0.1.3 on the site.** The homepage still names v0.1.0
  (`apps/site/src/content/site.ts`); bump the copy and its assertions together.

### Findings considered and rejected

- Shadow or hover lift on Note rows, a composer shadow, or a shadow on the
  expanded row: rejected by `docs/UX.md` ("no lift or shadow", solid composer).
- Editor expansion "snaps": by design per `docs/UX.md`; see Direction.
- A Lavender fill for the Done check: ADR 0012 keeps status neutral and
  Lavender distinct from status.
- An invisible window after Cmd+H then quit: the window-state plugin only
  shows on restore; plan 039 keeps flag restriction as hardening only.
- A platform attribute injected before paint: the `navigator.platform`
  fallback already runs on first render, and `userAgentData` would defeat the
  Windows e2e override.
- A separate contrast script: `theme-contract.test.ts` already checks WCAG pairs.
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

## Plan lifecycle

One plan describes one bounded implementation. After its done criteria pass,
migrate any durable decision or milestone into docs/ADRs/history, remove its
live references, then delete the plan. Git history remains the detailed
archaeological record; do not create an execution-journal archive.
