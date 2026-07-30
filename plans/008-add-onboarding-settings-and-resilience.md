# Plan 008: Add onboarding, settings, permissions, diagnostics, and resilience UX

> **Executor instructions**: Follow every step and verification gate. Stop on
> any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: inspect `/settings`, root onboarding state, native
> preference storage, platform capability reporting, and Workspace health UI.
> Expected state: shell placeholders plus functional capture/copy modules, with
> no comprehensive settings persistence. Stop if preferences or diagnostics
> already collect note content or absolute paths.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 006 and 007
- **Category**: direction, security, dx
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

A local native app still needs clear consent, recoverable setup, and transparent
capabilities. The user must understand where files live, why macOS may request
Accessibility, what works on their Linux session, and whether update checks make
a network request. Settings and diagnostics should reduce support cost without
leaking prompt content or hiding platform limitations.

## Current state

- Theme and locale persist in the WebView; native shortcut/window/workspace state
  has no unified preference schema.
- CaptureCoordinator reports runtime capabilities and Workspace reports health.
- `/settings` and first-run/no-workspace states are placeholders.
- Privacy contract forbids analytics, telemetry, crash upload, content logging,
  and automatic external communication except explicit update checks.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust preferences | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked preferences` | all schema/atomic tests pass |
| UI settings | `bun run test:desktop -- onboarding settings diagnostics` | all targeted tests pass |
| Bindings | `bun run bindings:check` | exit 0 |
| Quality | `bun run check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |

## Suggested executor toolkit

- Use `shadcn` for Field, Tabs, Dialog, AlertDialog, Kbd, Badge, Empty, and toast.
- Use `web-design-guidelines` for the final settings/onboarding accessibility audit.
- Use `apple-design` for onboarding/dialog continuity, anchored origins,
  interruption behavior, and accessibility preference fallbacks.
- Re-read `docs/PRIVACY.md` and `docs/platform-support.md`.

## Scope

**In scope**:

- `apps/desktop/src-tauri/src/preferences/mod.rs`, `model.rs`, `storage.rs`, `error.rs`
- `apps/desktop/src-tauri/src/ipc/preferences.rs`,
  `apps/desktop/src-tauri/src/ipc/diagnostics.rs`,
  `apps/desktop/src-tauri/src/ipc/mod.rs`, `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/tests/preferences_contract.rs`
- `apps/desktop/src/bindings/preferences.ts`,
  `apps/desktop/src/bindings/diagnostics.ts` (generated)
- `apps/desktop/src/lib/ipc/preferences-client.ts`, `diagnostics-client.ts`
- `apps/desktop/src/features/onboarding/onboarding-dialog.tsx`, `workspace-step.tsx`,
  `privacy-step.tsx`, `shortcut-step.tsx`, `onboarding-state.ts`
- `apps/desktop/src/features/settings/settings-screen.tsx`, `general-settings.tsx`,
  `appearance-settings.tsx`, `shortcut-settings.tsx`, `privacy-settings.tsx`,
  `workspace-settings.tsx`, `diagnostics-panel.tsx`
- `apps/desktop/src/features/recovery/workspace-health-banner.tsx`,
  `recovery-dialog.tsx`, `external-change-dialog.tsx`
- `apps/desktop/src/routes/settings.tsx`, `apps/desktop/src/routes/__root.tsx`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `docs/PRIVACY.md`, `docs/platform-support.md`, `README.md`
- Tests beside the frontend files above

**Out of scope**:

- Analytics, telemetry, crash upload, content/path logging, cloud settings sync,
  updater signing/endpoints, launch-at-login, OS notifications, and automatic
  permission prompts on first render.

## Git workflow

- Branch: `codex/008-settings-resilience`
- Commits: `feat(core): add native preferences`,
  `feat(settings): add onboarding and capability controls`,
  `feat(recovery): add safe workspace recovery UX`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a small versioned native preferences module

Store `preferences.json` atomically in Tauri's app config directory. Schema v1
contains last Workspace path, fallback accelerator, onboarding completion,
update-check preference defaulting false until Plan 012 has a signed endpoint,
and non-content UI preferences needed before WebView initialization. Keep locale
and theme in their existing validated store unless there is one proved source-of-
truth strategy; do not duplicate them silently.

Expose read/update/reset typed commands. Validate accelerators through the
CaptureCoordinator before commit. Paths may be used internally but are redacted
from display/log exports unless the user explicitly reveals them. Add migration,
corrupt-file backup, concurrent update, and atomic failure tests.

**Verify**: run Rust preferences command -> create/read/update/migrate/corrupt/
atomic-failure tests pass; generated bindings are current.

### Step 2: Build progressive first-run onboarding

Show onboarding only when no valid Workspace is open. Keep it short and skippable
until a directory is required:

1. Explain local-only files and choose/create a Workspace.
2. Show the standard fallback shortcut and test button.
3. On macOS only, explain exact Accessibility benefits before a user clicks
   Request; denial is not a dead end.
4. Confirm privacy, theme, and language choices.

Never request permissions on mount. If reopening the last Workspace fails, keep
the path private and offer Choose another, Retry, or Inspect recovery details.
On completion, focus the New note action and provide a short keyboard hint that
can be dismissed permanently.

Onboarding step changes use the shared surface profile with a stable container,
directionally symmetric enter/exit, and no layout bounce. Back during a forward
transition reverses from the current presentation value. Permission results,
focus changes, and validation feedback occur with semantic state, never at an
animation callback. Reduced motion uses instant step changes plus a restrained
crossfade.

**Verify**: `bun run test:desktop -- onboarding` -> fresh, returning, missing directory,
permission denied, unsupported platform, locale switch, and resume tests pass.

### Step 3: Implement settings by user task, not technical subsystem

Build sections for General, Appearance & language, Capture shortcuts, Workspace
& backups, Privacy & updates, and Diagnostics. Use FieldGroup and semantic
descriptions. The shortcut recorder must reject reserved/invalid accelerators,
show a conflict before saving, re-register atomically, and always provide Reset.
Display double Shift as a capability badge with platform-specific explanation,
not a checkbox when unsupported.

Workspace change warns about unsaved drafts and closes the old watcher only after
the new workspace validates. Theme and language changes preview immediately and
persist only valid values. Update checks remain disabled with explanatory copy
until Plan 012 configures signed artifacts.

**Verify**: `bun run test:desktop -- settings` -> validation, conflict, rollback, reset,
capability states, workspace-switch cancellation/failure/success, themes, and
locales pass.

### Step 4: Add recovery and external-change journeys

Map Workspace health issues to specific UI:

- external note change: refresh automatically if no local draft; otherwise show
  compare/reload/keep-draft options without overwriting either copy;
- incomplete recoverable transaction: show old/new revision summary and the
  deterministic Workspace recommendation;
- corrupt manifest or missing file: keep last valid snapshot read-only and offer
  backup restore or choose another Workspace;
- unsupported schema: block writes and identify required app upgrade.

All destructive recovery actions require preview and confirmation. Never render
raw filesystem exception strings. Provide Reveal in file manager only as an
explicit user action if a minimal safe Tauri API is available; otherwise show a
copy-path button that discloses exactly what will be copied.

Dialogs/sheets originate from their invoking control or affected workspace
region and return along the same path. Rapid cancel/reopen/retry must remain
interruptible and must not duplicate commands, trap stale focus, or lock input.

**Verify**: `bun run test:desktop -- recovery external-change` -> every state, dirty
draft branch, cancel, success, failure, and focus return pass.

### Step 5: Provide privacy-safe diagnostics

Create a diagnostics snapshot containing app/version, OS/session type, feature
capability states, Workspace schema/revision/counts, watcher status, last typed
error codes, and dependency/build identifiers. Exclude note bodies, titles,
clipboard contents, selected text, raw absolute paths, usernames, environment,
and arbitrary logs. Redact Workspace path to basename plus stable one-way marker
only if necessary to distinguish sessions.

Render it before export and require explicit Copy diagnostics. Copy uses a
separate typed command or the write-only clipboard boundary and is never sent
over a network. Add a fixture containing obvious secrets/content and assert none
appear in serialized output.

**Verify**: `bun run test:desktop -- diagnostics && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked diagnostics` -> redaction fixture and copy preview pass.

### Step 6: Harden native app lifecycle

Use single-instance to focus the existing main or capture window. Restore only
safe main-window size/position with bounds checking; never restore the capture
window as visible. On quit, flush pending Workspace writes, stop watcher/global
listeners, and persist preferences. On unexpected window close, preserve drafts
and allow reopen from the platform-supported app lifecycle.

**Verify**: manual `bun run tauri:dev` smoke starts a second instance, switches
Workspace, closes/reopens, and quits with one watcher/listener and no lost saved
data; automated lifecycle units pass.

## Test plan

- Rust tests for preference schema, migration, atomicity, corrupt backup, and
  diagnostics redaction.
- Component tests for all onboarding/settings/recovery/capability states.
- Interaction tests reverse step/dialog motion mid-flight and assert final focus,
  state, and exactly-once side effects in normal and reduced-motion modes.
- Accessibility checks for field labeling, step announcement, dialog focus,
  destructive confirmation, and keyboard-only shortcut recording.
- Manual lifecycle and permission-denial smoke on each available platform.
- Verification: all commands in the table exit 0.

## Done criteria

- [ ] First run gets from privacy promise to one saved note without hidden consent.
- [ ] Preferences are versioned, atomic, validated, and content-free.
- [ ] Shortcut conflict/re-registration has rollback and reset.
- [ ] Capability UI is honest for macOS, X11, Wayland, and Windows.
- [ ] Recovery never overwrites a dirty draft without a user decision.
- [ ] Diagnostics are previewed, local, and proven free of content/raw paths.
- [ ] Single-instance and lifecycle cleanup preserve data/listener uniqueness.
- [ ] All tests/quality checks pass and this plan is `DONE`.

## STOP conditions

- A settings feature requires storing prompt content outside the Workspace.
- Diagnostics cannot prove exclusion of content, clipboard, selected text, and paths.
- Permission APIs prompt automatically before an explicit user action.
- Workspace switching can close the old runtime before the new one validates.
- Lifecycle cleanup can lose an acknowledged successful save.

## Maintenance notes

- Add new diagnostic fields through an allowlist, never by serializing application
  state wholesale.
- Platform explanations are product copy and must be updated when ADR 0002 or
  the tested matrix changes.
- Keep update checks visibly disabled until Plan 012 has signing and privacy text.
