# Plan 011: Close native lifecycle and documentation drift

> **Executor instructions**: Keep lifecycle behavior inside the existing Tauri/
> `CaptureCoordinator` boundary. Reuse the composer-ready handshake; do not
> execute JavaScript strings from Rust or create another window. Documentation
> may record only evidence that actually passed.

> **Drift check (run first)**:
> `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc/capture.rs apps/desktop/src apps/desktop/messages docs plans README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 010
- **Category**: native lifecycle, documentation, tests
- **Planned at**: `a0543d0bc9ba49d2eb21f631d5e76104a920fd58`, 2026-08-09
- **State**: TODO

## Why this matters

The single-instance plugin is registered with an empty callback, so reopening
Charon can appear to do nothing instead of revealing/focusing the existing app.
The active launch/index guidance was reconciled at planning time, but the long
hardening queue can make it drift again. Premium software needs coherent
lifecycle behavior and documentation that tells the truth about the compact
build, GitHub artifact distribution, separate Workers site hosting, platform
warnings, updater trust, blockers, and manual gates.

## Current state

- `apps/desktop/src-tauri/src/lib.rs:18` registers
  `tauri_plugin_single_instance::init(|_app, _args, _cwd| {})`.
- `ipc/capture.rs` already owns show/focus/composer-ready semantics for the
  portable shortcut and should remain the single owner.
- `plans/LAUNCH.md` now points to Product Plans 016, 017, 014, and 015; this plan
  must preserve that live dependency path after Advisor Plans 001-010 land.
- `docs/TESTING.md` has VoiceOver and Orca protocols but no Windows Narrator
  protocol or complete link to the final manual matrix.
- Hosting/release docs must keep Plan 009's Workers Static Assets site boundary
  separate from Plan 015's GitHub Releases artifacts and `/releases/latest`
  link, without claiming either deployment or release has happened.
- Distribution copy must distinguish macOS ad-hoc signing, Windows unsigned
  installers, checksums, and the Tauri updater signature.

## Commands

| Purpose | Command | Expected result |
|---|---|---|
| Native unit | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked single_instance` | lifecycle tests pass |
| Capture regression | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture` | shortcut/handshake tests pass |
| Desktop | `bun run test:desktop -- capture preferences shell` | focus request tests pass |
| Documentation scan | `rg -n "implemented through completed Plan 007|next prompt.*008|GitHub Pages|site is still a scaffold|current UI still shows the broad|signed installer/update/site|Developer ID|Authenticode" README.md docs plans advisor-plans` | every match is historical, an explicit rejection, or accurate trust disclosure |
| Aggregate | `bun run verify:release` | exit 0 once |

## Suggested skills

- `apple-design` for reveal/focus continuity and no-focus-theft review.
- `web-design-guidelines` for the added Narrator/keyboard manual protocol.

## Scope

**In scope**: single-instance reveal/focus/composer request, lifecycle testable
helper, localized UI feedback only if a contextual failure needs it, LAUNCH/
README/TESTING/platform/releasing/current-plan corrections, release-versus-site
boundary review, and removal of stale active instructions.

**Out of scope**: autostart, tray/menu bar app, multiple windows, arbitrary
argument/file handling, deep links, updater work, public deployment, or changing
platform support claims without physical evidence.

## Git workflow

- Branch: `codex/premium-loop`
- Exact commit: `fix(app): restore the existing window on relaunch`
- Do not push, install, deploy, or open a pull request.

## Steps

### Step 1: Extract one reveal-and-focus application action

Have the portable shortcut and single-instance callback call the same native
action: locate the main WebView window, unminimize/show it, focus it, and request
bottom-composer focus through `CaptureCoordinator`'s existing ready/pending
handshake. Keep repeated calls idempotent and content-free.

Do not route second-instance arguments or working directory into logs/UI. Do not
create an editor draft or Note.

**Verify**: mocked lifecycle tests cover hidden, minimized, visible, not-yet-ready,
ready, duplicate invocation, missing/destroyed window, and failed show/focus.

### Step 2: Preserve capture focus contracts

Confirm the single-instance path is only for explicit app launch/relaunch. It
must not alter selected-text capture: double Shift still creates at most one Note
without revealing/focusing Charon; the portable shortcut explicitly reveals and
focuses the composer.

**Verify**: capture regression tests distinguish all three triggers and count
window/composer/Note effects exactly once.

### Step 3: Physically smoke the lifecycle on the available host

Launch one native app, hide/minimize it, attempt a second launch, and confirm the
same process/window returns with composer focus and no draft/Note. Repeat while
visible and after Preferences/editor use. Record artifact identity and result,
but do not promote another platform from this host.

**Verify**: dated evidence is content-free and linked from platform support or
the final manual matrix.

### Step 4: Rewrite active launch and status documentation

Update `plans/LAUNCH.md` to the real scaffold/current branch, current Bun/Rust/
Astro/Workers commands, current compact product surface, and remaining physical
gates. Correct README, TESTING, SITE, RELEASING, platform support, Product Plan
015, and plan indexes only where active guidance is stale.

Keep two independent delivery tracks explicit: Advisor Plan 009 deploys static
site files to Cloudflare Workers; Product Plan 015 publishes application
artifacts and `latest.json` to GitHub Releases, and the site links directly to
GitHub `/releases/latest`. Do not add a browser GitHub API request. Describe the
Tauri updater signature as artifact verification only, not notarization,
Authenticode, or publisher reputation.

Keep historical completed plans unchanged unless a currently executable
instruction would send an executor to Pages or removed behavior. Never mark
Product Plans 011, 012, 014, or 015 `DONE` merely because automation passes;
their documented physical, exact-artifact, secret, and operator blockers remain
until evidence exists.

**Verify**: links/commands resolve, versions match manifests/ledger, Workers
replaces active Pages guidance, GitHub owns only release artifacts, and no
unsupported signing/updater/platform claim appears.

### Step 5: Add the final manual-protocol entry points

Link TESTING and RELEASE_CHECKLIST to Plan 012's generated
`docs/MANUAL_ACCEPTANCE.md`. Add a concise Narrator protocol alongside VoiceOver
and Orca, and name who records artifact IDs and evidence.

**Verify**: a second operator can find automated commands, launch commands,
platform limitations, and the full manual matrix from README without historical
plan knowledge.

## Done criteria

- [ ] Second launch reveals/focuses the existing main window and composer once.
- [ ] It creates no Note/editor and does not change selected-text capture focus.
- [ ] Lifecycle behavior is covered by deterministic native/frontend tests and a
  dated available-host smoke.
- [ ] LAUNCH/README/current docs describe the actual compact shelf, GitHub
  release target, separate Workers site target, and unsigned platform posture.
- [ ] Historical plan status is not falsely promoted.
- [ ] VoiceOver, Orca, and Narrator entry points link to the final matrix.
- [ ] Release gate passes once and the diff has no secrets/private paths.
- [ ] This plan and the index are `DONE` in the exact commit above.

## STOP conditions

- Reuse would move shortcut/permission ownership out of CaptureCoordinator.
- Second launch needs a new window, JavaScript evaluation, argument logging, or
  arbitrary input injection.
- Physical evidence contradicts the idempotent focus model twice.
- Documentation would need to claim a signed/deployed/supported state that lacks
  exact-artifact evidence.

## Maintenance notes

Keep every explicit reveal path on the same tested action. Update active docs in
the same change whenever hosting, release state, or launch commands change.
