# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- On 2026-10-02 every remaining queued plan (batches B-F: 039 and 042-062) was
  implemented together (branch `charon-v0.2`) together
  with inline Markdown drawings (ADR 0021); its thematic commits prepare v0.2.0 and await the operator's native
  tests before release.
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
  experimental double Shift and use `Alt+Shift+Space` for composer focus. Both
  composer shortcuts are defaults; ADR 0025 lets the user change the shortcut
  outside Wayland. Wayland uses a portal-assigned composer shortcut and never
  claims a modifier-only gesture.
- The repository is public. Contributions use pull requests, Simon Hazard is
  the principal maintainer, and protected `main` updates deploy the static site.

## Active queue

| Plan | Title | What it does | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 038 | Follow the OS appearance and paint before the webview loads | Adds a System appearance default (new ADR amending ADR 0012), a pre-paint canvas colour, and a window `backgroundColor` | P1 | M | — | IN PROGRESS: PR #64, awaiting operator test |
| 040 | Build the Lavender token foundation | Lavender ramp, extended contrast fixture, per-theme floating/modal shadows, type/weight/space scales outside Tailwind namespaces, selection and caret polish | P1 | M | — | IN PROGRESS: PR #65, awaiting operator test |
| 041 | Apply the accent and polish components | New ADR allowing paint-only feedback transitions; Lavender composer submit; transitioned hover/pressed/selected states; one CSS press implementation | P1 | M | 040 | IN PROGRESS: PR #66, awaiting operator test |
| 044 | Accept multi-line Markdown in the composer | Auto-growing textarea with a WebKit fallback, Enter creates, Shift+Enter newline, IME guard kept, UX contract amended | P1 | M | 041 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test |
| 042 | Give row actions immediate feedback | Sequence-safe optimistic status with check-in cue, in-place copy confirmation, busy tag removal and close | P1 | M | 041 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: status check uses the same 120 ms opacity/scale swap as the copy icon (Step 5 contract) instead of the surface spring; one Tag removal at a time |
| 043 | Keep toasts off the composer and reduced-motion safe | Top-anchored toast stack with flipped swipe, travel token, reduced-motion exit crossfade | P2 | S | — | IN PROGRESS: prepared on charon-v0.2, awaiting operator test |
| 045 | Acknowledge a captured Note | Content-free success status with the Note id (queued, not single-slot), shelf-only announcement, scroll, and fading Lavender tint | P1 | M | 041 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: a clipboard-restoration warning follows every capture outcome (ADR 0010), not only success; an unidentifiable new Note stays silent rather than reporting a false failure; the shelf requests one Workspace refresh when the acknowledged Note is not yet in the snapshot (capture while Charon is focused); the scroll targets the Note's live index and is skipped while an editor is open or a text field has focus; Step 5 native smoke left to the operator |
| 052 | Retire the per-update macOS permission notice | Drops the install-dialog regrant warning once ADR 0018 signing keeps TCC grants | P1 | S | ADR 0018 PR | REJECTED: on 2026-10-02 the operator returned macOS releases to Tauri's ad-hoc identity (ADR 0027 supersedes ADR 0018 before any signed release); the per-update notice stays and its removal was reverted |
| 053 | Keep drafts safe when Windows installs an update | Re-checks drafts right before install, explicit "Close and install" on NSIS, relaunch after install | P1 | S | 052 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the NSIS close notice also shows in the install dialog, whose action becomes "Close and install" once the download finishes (Preferences offers the same button); a macOS/AppImage download that finishes with a dirty draft waits at `downloaded` and installs on its own once drafts are clean; starting a download still requires clean drafts; Windows native update test left to the operator |
| 054 | Align the Tauri configuration with official guidance | Minimal capability (drop clipboard, add resources close), release size profile, `removeUnusedCommands`, Linux build on ubuntu-22.04 with a glibc check, Vite dev settings, unused JS plugin removed | P2 | M | ADR 0018 PR | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the local macOS release build and `Charon.app` size comparison are left to the operator (baseline: 15,377,520-byte binary from the 2026-09-23 default-profile build); the Step 6 smoke runs on a release build because `removeUnusedCommands` applies only to `tauri build`; the glibc step matches `GLIBC_[0-9][0-9.]*` and the checker also pins its name; `bun remove` refreshed the stale workspace version in `bun.lock` |
| 046 | Close the keyboard and search fluidity gaps | Scroll expanded editor into view, Escape clears search, debounced result count, Home/End, row Cmd+C, editor Cmd+S, Help rows | P2 | M | 042 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: PageUp/PageDown also get a Help row (maintenance rule); Help now opens focused on its own surface and scrolls (capped at `100dvh - 6rem`) because the Notes section no longer fits 400 by 480; row Cmd+C fires only on the row button itself without Shift/Alt/repeat/IME and swaps the icon instantly; editor Cmd+S ignores keys from portaled dialogs (drawing, Attachment removal); a whitespace-only query announces no count; Step 5 native check left to the operator |
| 047 | Hoist the update dialog and restyle the language select | Test-first dialog focus/progress fix; themed Base UI Select | P2 | S | 041 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the Step 1 test failed first (Cancel closed Preferences), so the dialog was hoisted and Preferences made controlled; the dialog keeps plan 053's behaviour (its action does not close it); the Select also joins the reduced-transparency, increased-contrast and keyboard-modality fallbacks; the axe test also scans the open Select list; `docs/UX.md` no longer calls the language control native |
| 049 | Make Done and expanded row states legible | Visible Tag chips on Done rows, title-only strike, `aria-expanded` and a useful Edit click on expanded rows | P2 | S | 041, 042 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the editor id comes from an exported `noteEditorId()`; in Preview, Edit focuses the Write tab (marked `data-note-editor-tab="write"`) without switching tabs; `docs/UX.md` also describes the reported expanded state and the Edit focus move; VoiceOver pass left to the operator |
| 050 | Exit transient surfaces faster than they enter | Adds an exit duration token (110ms vs 160ms in) to Tooltips, Popovers, dialogs and Select; same path, amended UX timing | P3 | S | 041, 047 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: UX change approved 2026-09-23; the token also covers the drawing `Dialog` primitive and the e2e also checks the Delete dialog; a keyboard-closed Popover unmounts with no exit state (0s), so the e2e records the keyboard-dismissed Tooltip (0s) and probes the Popover cascade; the reduced-motion entrance stays as found (150ms, see report) because entrance timing is out of scope; the icon-swap sentence was reworded to drop "symmetric exit" |
| 056 | Give icon-only controls consistent Tooltips | Tooltip inventory and rule, missing/wrong Tooltips fixed, tooltip-only help made reachable, `data-slot` override bug fixed | P1 | M | 041, 050 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the plan's recommendations taken for every operator question (row titles lose their native `title`; Tag chips are named "Show notes tagged …"; the three ⓘ explanations become hover/click/tap Popover toggletips; the Attachment remove button gets its intended 44px through the restored Button slot); a Tooltip no longer claims Escape, so one Escape closes a focused control's Tooltip and the Preferences, editor, or drawing dialog behind it (plan 050's e2e updated); the inventory also covers Draw, Edit drawing, every drawing tool, Help's Notes section, the language Select, the copy check, and "Close and install"; the drawing dialog's Undo/Redo/Clear were never disabled (the prop reached only the Tooltip) and now are; the info-button CSS is keyed on its class alone (Biome specificity order) and the toggletip gains an increased-contrast border; VoiceOver, touch, and 200% text checks left to the operator |
| 057 | Show version and open-source links in Preferences | Quiet About section: version, MIT, repository and CONTRIBUTING links opened only on click | P3 | S | 047 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: no LICENSE or CODE_OF_CONDUCT links (MIT named in text only); the opener scope gains exactly the repository and CONTRIBUTING URLs in both pinned capability lists, and the `theme-contract.test.ts` case is renamed "…resource, and GitHub link commands" (plan 054 had already replaced clipboard with resources); the existing Releases button keeps its ignored rejection; the e2e records requests from before page load; the `tauri:dev` click (system browser opens once, Preferences stays open) is left to the operator |
| 058 | Make the Markdown help match the Preview | Examples tested against the safe renderer, unsupported syntax marked, front-matter hiding bug fixed | P3 | S | — | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: footnotes stay undocumented; no live rendered example; the Draw line (ADR 0021) stays after the local-Preview line and is tested (Draw output is one `svg` code block that Preview draws without unsafe elements); hint and subtitle CSS use the `--type-2xs`, `--type-sm` and `--weight-strong` tokens instead of raw sizes; the e2e also checks the "Not rendered" heading and that opening the help makes no request |
| 051 | Fade the Note list at clipped scroll edges | New ADR narrowing "no gradients" to allow one alpha mask; fades only the edge that clips content, no scroll listener, contrast/transparency fallbacks | P3 | S | 046 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: ADR 0022 (approved 2026-09-23); `docs/UX.md` also describes the fade under Motion and materials; the e2e measures the focused row surface (not only its button) against the 12/16px fades in both directions and fails without the scroll padding; Step 4 in headless Chromium at 20,000 Notes (3 s wheel scroll, two rounds): frames over 34 ms 4 and 4 with the mask vs 2 and 5 without, no frame over 50 ms with the mask, so no long frames attributable to it; Light/Graphite at 400×480 and 480×720 (with an expanded editor) checked visually; a window resize that changes no visible range can leave the fade stale until the next list render (accepted lag); WebKitGTK scrolling smoothness left to the operator |
| 039 | Keep Charon running when its macOS window is closed | macOS close hides (including with an open editor), Dock reopens, capture stops on exit; persists only size/position/maximized | P2 | M | — | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the main window is shown as the first `setup` statement and a failed show fails setup, so Charon never runs with only a hidden window; `RunEvent` handling uses two `matches!` checks rather than a `match` so no lint differs on Windows/Linux where the Reopen arm is compiled out; on Windows/Linux an open drawing with unsaved strokes keeps the window open on close behind its existing discard prompt (on macOS it survives the hide), and `docs/UX.md` says so; the existing close tests now render Windows capabilities explicitly; Step 4 partly verified headlessly on macOS with the session locked (launch from hidden shows the window, no panic, a second launch exits 0 and keeps the first window on screen, the final frame is identical with `visible` true or false); close/hide, Dock reopen, `Cmd+Q`, dirty close, capture after hide, and "no jump" are unverified natively |
| 055 | Harden the IPC trust boundary | App-manifest command ACL, single-use Workspace folder token, IPC argument contract test | P3 | M | 054, 045 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: the folder chooser returns `{ token }` without a display name because Preferences already re-reads the remembered folder name and nothing would read it; folder tokens use a sibling map (never interchangeable with Attachment tokens) with the shared single-use helpers and 5-minute TTL, and a rejected token consumes nothing; tauri-build writes the app-manifest permission files to `src-tauri/permissions/autogenerated/`, now gitignored as build output; the argument contract test reads each command's argument keys from its Rust signature and also pins the three event subscriptions; both pinned capability lists keep the 3-URL opener scope; the folder-switch smoke is left to the operator |
| 048 | Test motion behaviour | Interruption, reduced-motion, keyboard and status-dot e2e; drops standing `will-change` and a dead rule | P2 | M | 041, 042, 043 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: CDP slow motion cannot drive Motion's animations (Motion starts and samples them on the wall clock while CDP slows only the document timeline), so the interruption, typing and keyboard tests run at normal speed and the close fires from inside the page on the first frame the entrance is a quarter visible (about 60 ms); the plan's `≤ o₀ + 0.05` bound is replaced by: the peak stays below 0.95, the exit reverses once and fades over several frames, and no frame changes faster than the spring over the elapsed time plus a 0.1 velocity carry (ADR 0005's velocity hand-off legitimately carries opacity 0.1-0.2 past the closing value); the editor opens with its caret at the start, so the typed `x` is checked as the exact new body; the reduced-motion tests are one list (row editor, status check, Preferences popover, Delete confirmation, drawing dialog), each slowed by CDP on entrance and on exit (exit after a reload) and checked for identity transforms, no travel while visible, and opacity-only animations of 120 ms (exit 120 ms for Motion, 100 ms for CSS surfaces); three defects the tests exposed are fixed: reduced-motion transient entrances ran Tailwind's 150 ms default instead of the 120 ms token (`motion-reduce:[transition-property:opacity]` in the six transient primitives including the toast, pinned by a unit test, `docs/UX.md` sentence amended), the exiting editor jumped 7 px sideways because AnimatePresence `popLayout` kept its inline margin, and the drawing dialog mounted already open so it never played its entrance; STOP check: 20 alternating 3 s wheel-scroll rounds at 20,000 Notes in headless Chromium gave 166 frames over 34 ms without `will-change` vs 164 with it (11 vs 18 over 50 ms), so it was removed outright; WebKit cannot slow animations through CDP, so the five list tests skip there |
| 059 | Keep Charon running in the tray on close | Opt-in background mode with a menu-bar/notification-area menu and explicit Quit; new ADR and a native spike first | P2 | L | 039 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: ADR 0023 accepted with honest spike evidence (native tray rows unverified); default off; Linux unavailable this release (Cargo enables `tray-icon` for macOS/Windows targets only, no probe, no `recommends`); app icon glyph as is (no template); Quit saves an open editor, then blocks and reveals on composer text, a failed save, or a drawing with unsaved strokes |
| 060 | Notify when a capture creates a Note | Opt-in, content-free system notification; click-to-open only where the spike proves it; new ADR first | P2 | M-L | 045 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: ADR 0024 accepted with honest spike evidence (native display rows unverified); Option A only on every platform (official `tauri-plugin-notification` =2.4.0, click keeps the platform default, no Note targeting); default off; 2 s rate limit; also when visible but unfocused; offered wherever double Shift can create a Note (not Wayland); Linux allowed with daemon errors ignored; persistent "cannot verify" permission line; toggle labels "Enable/Disable capture notifications" to match the sibling toggles |
| 061 | Let users change the composer shortcut | One user-chosen reveal/composer accelerator with rollback and reset (double Shift fixed, Wayland shows the portal's choice); new ADR narrowing a PRODUCT non-goal | P2 | M | — | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: ADR 0025 accepted with honest spike evidence (a throwaway `global-hotkey` probe showed macOS accepts system-held combinations such as `Cmd+Space`, so conflicts are undetectable there; one `tauri dev` run drove change, no-op, refusals, and reset through the real plugin on the main thread without storing anything; key-press delivery, relaunch persistence, Windows, and X11 unverified); the plan's rules and reserved list as proposed, plus F1-F20 only on macOS (its backend maps no key beyond); Wayland `ConfigureShortcuts` deferred; the recorder pre-screens the two-modifier floor and keeps recording with a hint, shows held modifiers on key down, leaves on Tab or blur, and Escape cancels without closing Preferences; every composer press is now handled on the main thread (X11 and the portal post to it) because the X11 backend registers on the same thread that delivers presses; Preferences reset also restores the default accelerator; a Wayland session keeps but ignores a choice stored by an X11 session; `defaultShortcut` stays in the DTO as the value Reset restores |
| 062 | Keep formatting from captured HTML | Opt-in macOS Copy-fallback HTML converted to Markdown with plain-text fallback; amends ADR 0010; spike first | P3 | L | 045 | IN PROGRESS: prepared on charon-v0.2, awaiting operator test — decisions: ADR 0026 accepted with honest spike evidence (real Copy payloads, parity rate, and fidelity unverified natively; no clipboard was read); opt-in, default off, Experimental, macOS only; the converter is Charon's own on `html5ever =0.38.0`, already in Cargo.lock (no new package; `htmd` would add two crates and walk recursively, `dom_query`'s serializer copies `javascript:`/`data:` URLs), with a measured upper bound of +0.57 MiB on the macOS binary and a p95 of about 11 ms at the 1 MiB cap in release; HTML is read only from a single-item payload; parity is stricter than the plan's letters-and-digits rule (word and line boundaries must match too) and Markdown that adds no formatting keeps the plain text; images become their alt text (as in Chromium's plain copy) instead of disappearing, forms and buttons keep their visible text (only value-bearing controls are dropped), and `hidden` elements are dropped; tables become GFM only when simple, otherwise the whole capture stays plain; `b`/`i` whose inline style mentions font-weight/font-style stay plain (Google Docs wrapper); bounds are checked between 4 KiB parser chunks (nodes, depth, time) after hostile nesting showed html5ever's depth-linear scope scans; the converter is injected into the transaction so tests prove the order read string, read HTML, restore, convert; toggle labels "Enable/Disable formatting" to match the sibling toggles; Step 10 native smoke left to the operator |

Recommended order: 038 → 040 → 041 → 044 → 042 → 043 → 045 → 052 → 053 → 054 → 046 → 047 → 049 → 050 → 056 → 057 → 058 → 051 → 039 → 055 → 048 → 059 → 060 → 061 → 062.
[`RUNBOOK.md`](RUNBOOK.md) chains this queue in six batches with pull
requests and operator test gates: A+B release as `0.2.0`, C+D as `0.3.0`, and
the backlog features (E: 059-060, F: 061-062) as proposed `0.4.0` and `0.5.0`.
Plans 038, 041 and 051 created ADRs 0019, 0020 and 0022. Plans 038, 040, 041,
045 and 047 overlap the operator's macOS-permission work (Preferences,
messages, `app.css`, `docs/UX.md`), which landed in PR #61.

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
052 retired the in-app notice. On 2026-10-02, before any signed release, the
operator returned to Tauri's ad-hoc identity (ADR 0027): plan 052 is rejected,
the notice stays, and ADR 0018 plus `docs/RELEASING.md` keep the self-signed
path on record. An audit against the official Tauri v2
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
- **Preferences container.** Seven sections (Appearance, Language, Notes
  folder, Capture, Background, Updates, About) in one 400x480 popover; a
  dedicated panel would need the UX contract amended.
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
