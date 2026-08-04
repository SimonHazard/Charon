# Plan 014: Close rapid-capture release quality gaps

> **Executor instructions**: This is a release gate, not a feature plan. Invoke
> `web-design-guidelines`, `apple-design`, `vercel-react-best-practices`, and
> `thermo-nuclear-code-quality-review` only after deterministic tests exist.
> Fix only evidence-backed failures with regression tests. Stop on every STOP
> condition. Update the index after the full gate passes twice.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- package.json bun.lock apps packages scripts docs plans/README.md`
> Every P1 dependency must be DONE. Stop if a current product path is placeholder,
> unexpectedly disabled, or missing a typed contextual failure state.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 009 through 013
- **Category**: tests, perf, security
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

Filesystem mutation, managed Attachment import, global capture, shared-element
editing, permanent deletion, agent-ready copy, and local preferences can pass
isolated unit tests while still losing drafts, leaving recovery copies, trapping
focus, leaking source paths, or regressing on another platform. This plan creates
one release-quality fixture system and proves the smaller product end to end
without resurrecting removed workflows.

## Current state

- Plans 003-007 contain strong Rust/unit/component coverage and a dated macOS
  physical capture matrix.
- There is no consolidated browser fake IPC, Playwright user journey suite, axe
  gate, bundle/privacy scan, performance budget, or release checklist.
- The old quality plan targeted Sections, Merge, Trash/Undo, CopyPresets,
  Insights, onboarding, and routes; those are no longer product behavior.
- Native macOS capture still needs a real signed-candidate manual protocol because
  browser fixtures cannot prove Accessibility, event tap, or pasteboard races.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend | `bun run test` | all desktop/site unit tests pass |
| Browser | `bun run test:e2e` | all journeys pass Chromium/WebKit |
| Accessibility | `bun run test:a11y` | zero serious/critical violations |
| Performance | `bun run test:perf` | all documented budgets pass |
| Privacy | `bun run check:privacy` | no note/clipboard/path/secret sentinel leak |
| Bindings | `bun run bindings:check` | generated DTOs current |
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Aggregate | `bun run verify:release` | every automated gate passes twice |

## Scope

**In scope**:

- Root test/release scripts/config and exact test dependencies
- Desktop browser fixtures/E2E/a11y/perf suites and fake IPC
- Site tests
- Scripts for bundle, secrets/privacy, translations, token/raw-color, asset,
  dependency and workflow-free release checks
- Existing product source only for a reproduced failing gate with a regression test
- `docs/TESTING.md`, `docs/RELEASE_CHECKLIST.md`, platform support, privacy
- `.gitignore`

**Out of scope**:

- New product features, hierarchy, routes, charting, cloud services, release
  workflows/signing/deployment, broad visual redesign, speculative abstractions

## Git workflow

- Branch: `codex/014-release-quality`
- Commits: one proved `test:`, `fix:`, or `perf:` unit at a time
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Build deterministic whole-app fixtures

Inject fake Workspace, clipboard, capture, and preference clients with revisions,
typed errors, events, deterministic clock, platform capabilities, cleanup-required
Delete, Tag/Attachment commands, and Workspace-switch rollback. Seed empty,
small, 20,000-Note, Tag-rich, managed-Attachment, dirty draft, conflict,
migration, cleanup failure, EN/FR, and all-theme fixtures. Never import Tauri at
browser module evaluation time; use synthetic non-secret content and paths.

**Verify**: `bun run test:desktop -- fake-ipc render-app` passes with zero real
Tauri invocation.

### Step 2: Cover the nine release journeys

Add Playwright projects at 1280x800 and 800x600 in Chromium/WebKit:

1. first launch uses `Documents/Charon`, manual Enter creates one Open Note;
2. body/Tag/Attachment-name search, exact Tag filter, Open/Done, keyboard
   navigation, status toggle;
3. row Actions and selection one/many, canonical `Copy as Markdown` including
   Tags/managed paths, permanent Delete cancel/confirm/cleanup retry;
4. row-to-editor expansion, Write/Preview, Tag add/remove/suggest, Attachment
   picker cancel/import/remove, autosave interleaving, dirty close, failure recovery;
5. simulated macOS AX-primary and bounded-Copy capture, no-op failures, no focus theft;
6. portable shortcut reveals and focuses composer without draft/duplicate Note;
7. compact Preferences theme/language/folder choose and failed-switch rollback;
8. Solarized/Light/Dark, EN/FR, reduced preferences, increased contrast, 200% zoom;
9. static site navigation/media/privacy/truthful downloads/no third-party request.

Assert accessible roles, names, focus, visible outcomes, and typed command count,
not internal component structure.

**Verify**: Browser command passes twice consecutively.

### Step 3: Add accessibility and motion gates

Run axe across every major desktop/site state/theme with zero serious/critical
violations. Directly test visible focus distinct from selection, virtual listbox
semantics, editor focus return, selection announcements, AlertDialog count and
irreversible wording, inline errors, theme/language groups, permission actions,
Tag-chip/remove semantics, Actions menu, Attachment picker/import/remove states,
and no hover-only control.

Review editor/filter/selection/preferences motion at normal and 0.25x speed:
first-frame response, current-value reversal, symmetric origin/return, exactly-once
side effects, no input lock, transform/opacity only, reduced-motion crossfade,
solid reduced-transparency fallback. Trace virtual rows to reject layout/paint
animation or transform conflicts.

Document VoiceOver macOS and Orca Linux manual protocols.

**Verify**: Accessibility command passes; release checklist contains manual rows
with owner/evidence fields.

### Step 4: Establish focused performance budgets

Measure and record reference host/method:

- body/Tag/Attachment-name search/filter over 20,000 Notes under 50ms median;
- selection range/dispatch under 16ms median;
- visible Note DOM rows under 150;
- row editor interactive within 200ms and no sustained layout/paint animation;
- manual composer command-to-acknowledged local write under 100ms median on temp storage;
- Attachment import streams with bounded memory at the 100 MiB file limit;
  record the peak-memory method and a generous regression threshold;
- direct AX dispatch under 100ms and bounded Copy under ADR 0010's 700ms bound;
- portable hidden-window composer interactive within 250ms;
- initial desktop JS gzip budget based on post-simplification measurement, with
  removed router/hotkey/cmdk code absent;
- site LCP <2.5s, INP <200ms, CLS <0.1 and no third-party request.

Use generous relative CI thresholds. Profile before optimizing and change source
only with a regression test.

**Verify**: Performance command passes twice and bundle report records package chunks.

### Step 5: Prove fault, privacy, deletion, and migration behavior

Automate transaction phase failures, v1 migration interruption/collision,
Attachment symlink/directory/special-file/traversal/inside-Workspace/too-large/
too-many/short-copy/orphan cases, permanent Note/Attachment Delete cleanup
failure/retry, disk/permission failure, corrupt manifest/preferences, stale
revision, watcher burst, clipboard denial/snapshot/timeout/restore/concurrent
write, duplicate listener, and Workspace-switch failure.

Scan built/log/test artifacts for sentinel note/clipboard/selection content,
absolute home paths, tokens/private keys, external brand-source paths, and legacy
Trash bodies. Allow an absolute managed Attachment path only inside the explicit
clipboard-payload assertion; prove it never enters logs, errors, or React
snapshots. Prove successful Delete leaves no active/transaction body or
Attachment bytes and the legacy archive contains only previously trashed v1 content.

Review Tauri capabilities and direct dependencies for least privilege and live
use. Check EN/FR parity and visible string literals.

**Verify**: Privacy, fault, dependency, i18n, bindings, raw-color, and asset checks pass.

### Step 6: Repeat native platform evidence and consolidate release command

On the release-candidate macOS artifact, repeat AppKit, WebKit, Chromium/Electron
including Codex, editor, PDF, secure/blocked/canvas, rich clipboard, timeout,
restoration failure, concurrent write, permission denial, restart, and exactly-one
Note matrix. Confirm source focus and no private API/Paste/arbitrary input.

On available Linux/Windows, test install/run or debug artifact standard shortcut,
composer focus/create, search/status/edit/Tag/Attachment/copy/delete, folder
choice and restart. Do not promote untested claims.

Add `verify:release` for bindings, lint/typecheck/unit/E2E/axe/privacy/i18n/asset/
bundle/perf/site/Rust/current-platform bundle. Run thermonuclear review last and
fix only concrete release-blocking maintainability issues with tests.

**Verify**: Aggregate passes twice from clean processes; no unexplained TODO,
FIXME, skipped/only test, `@ts-ignore`, dead-code allow, or removed-feature term
exists in release source.

## Test plan

- Steps 1-6 are the test plan; every P1 journey has a deterministic automated
  layer and native-only behavior has dated manual evidence.

## Done criteria

- [ ] Nine browser journeys pass twice in Chromium/WebKit.
- [ ] Axe has zero serious/critical violations and manual a11y rows exist.
- [ ] Motion is immediate, interruptible, origin-consistent, reduced-preference safe.
- [ ] Performance/bundle budgets pass with method and host recorded.
- [ ] Fault tests prove migration, safe Attachment import/removal, permanent
  deletion, switch rollback, copy-path containment, and capture races.
- [ ] Privacy scan finds no content, unintended paths, secrets, or external kit
  path in artifacts; managed paths appear only in the explicit clipboard fixture.
- [ ] macOS release candidate repeats the complete capture matrix.
- [ ] Standard Linux/Windows claims match evidence only.
- [ ] Site/static/metadata/media/network checks pass.
- [ ] Rust and aggregate gates pass twice; no release blocker remains.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- Any test shows data loss, orphan/staged Attachment bytes, surviving
  successful-delete transaction content, source-path leakage, newer clipboard
  overwrite, false capture trigger, focus theft, or unsupported claim.
- A serious/critical accessibility issue remains.
- Motion locks input, restarts from stale values, or animates virtual layout work.
- A P1 journey lacks both deterministic automation and a feasible manual gate.
- Release verification is flaky twice for different orders/processes.

## Maintenance notes

- Keep E2E on stable user outcomes and combinatorics in pure tests.
- Recalibrate timing budgets on recorded hosts; never silently relax them.
- Native capture retains a manual signed-artifact matrix until a reliable
  platform automation surface exists.
