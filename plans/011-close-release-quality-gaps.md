# Plan 011: Close desktop, site, accessibility, performance, and recovery quality gaps

> **Executor instructions**: Treat this as the release quality gate, not a place
> to expand features. Follow every verification command. Any STOP condition
> blocks Plan 012. Update this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**: inspect all prior plan statuses, test scripts,
> ignored files, platform matrix, and known TODO/FIXME markers. Every dependency
> must be `DONE`. Stop if any P1 behavior is placeholder, disabled unexpectedly,
> or lacks a typed error/recovery state.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 006, 007, 008, and 009; Plan 010 only when Insights is enabled
- **Category**: tests, perf, security
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

Desktop filesystem and global-input features can pass unit tests while still
losing drafts, trapping focus, leaking content, or failing on another OS. This
plan creates a layered release gate with deterministic browser IPC fixtures,
real-filesystem Rust tests, accessibility scans, performance budgets, and an
explicit manual platform protocol. It fixes only evidence-backed release gaps.

## Current state

- Feature plans have unit/component tests, but no single end-to-end fixture
  system, Playwright journey suite, axe gate, performance budget script, release
  checklist, or consolidated privacy scan.
- The Astro site has its own tests but has not yet passed the consolidated
  cross-workspace release gate or artifact privacy scan.
- macOS WebView cannot be driven by the same WebDriver route as Linux/Windows;
  the browser-mode app with fake IPC plus documented native smoke remains
  necessary.
- TanStack Charts is optional and must not weaken core release quality when off.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install axe | `bun add --dev --exact @axe-core/playwright@4.12.1` | lockfile updated, exit 0 |
| Frontend unit | `bun run test` | all pass |
| Browser E2E | `bun run test:e2e` | all journeys pass in Chromium and WebKit |
| Accessibility | `bun run test:a11y` | zero serious/critical violations |
| Performance | `bun run test:perf` | all documented budgets pass |
| Site | `bun --cwd apps/site run check && bun run build:site && bun run test:site` | all pass |
| Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | all pass |
| Rust lint | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Aggregate | `bun run verify:release` | every automated gate passes |

## Suggested executor toolkit

- Use `web-design-guidelines` for the final accessibility and interaction audit.
- Use `apple-design` for the final slow-motion, interruption, physicality,
  material, typography, and reduced-preference audit of the desktop app.
- Use `vercel-react-best-practices` for measured React performance fixes only.
- Use `thermo-nuclear-code-quality-review` after tests pass, and address only
  release-relevant high-confidence findings without changing architecture scope.

## Scope

**In scope**:

- `package.json`, `bun.lock`, `playwright.config.ts`, `vitest.config.ts`
- `apps/desktop/tests/fixtures/**`, `apps/desktop/tests/e2e/**`,
  `apps/desktop/tests/a11y/**`, `apps/desktop/tests/perf/**`
- `apps/site/tests/**`
- `apps/desktop/src/test/fake-ipc.ts`, `apps/desktop/src/test/render-app.tsx`,
  `apps/desktop/src/test/fixtures.ts`
- Existing `apps/desktop/src/**`, `apps/desktop/src-tauri/**`,
  `apps/site/src/**`, and `packages/theme/**` only for fixes directly demonstrated by a
  failing gate in this plan, with a regression test in the same change
- `scripts/check-bundle.ts`, `scripts/check-secrets.ts`,
  `scripts/check-translations.ts`
- `docs/RELEASE_CHECKLIST.md`, `docs/TESTING.md`,
  `docs/platform-support.md`, `docs/PRIVACY.md`
- `.gitignore`

**Out of scope**:

- New product features, cloud services, alternate architecture, visual redesign,
  changing domain semantics, release workflows, signing, and updater deployment.

## Git workflow

- Branch: `codex/011-release-quality`
- Commits: one per proved issue, using `test: ...`, `fix: ...`, or `perf: ...`
- Every fix commit includes its regression test. Do not push or open a PR unless instructed.

## Steps

### Step 1: Build deterministic app-level fixtures

Create an injected fake IPC implementation covering Workspace, clipboard,
capture, preferences, and diagnostics. It must model revisions, typed failures,
events, permission/capability states, and a deterministic clock. Seed small,
20,000-note, conflict, corrupt, external-change, recovery, EN/FR, and all-theme
fixtures. Browser builds must never import Tauri at module evaluation time.

Add `render-app.tsx` that mounts the real Router/providers with fake IPC. Keep
fixtures synthetic and obviously non-secret. Do not snapshot whole DOM trees;
assert roles, names, state, and domain calls.

**Verify**: `bun run test:desktop -- fake-ipc render-app` -> all fake contract tests pass and no real Tauri call occurs.

### Step 2: Add critical Playwright journeys

Configure Chromium and WebKit desktop projects at 1280x800; add a compact 800x600
project for layout-critical tests. Cover:

1. First run, choose Workspace, deny optional permission, create/edit a note.
2. Keyboard-only search, range/select-all-visible, bulk complete, trash, undo.
3. Merge preview/cancel/confirm/undo.
4. Copy each preset and preserve native textarea copy.
5. Capture open/prefill/save/dirty-close/retry with simulated capabilities.
6. Switch EN/FR and all three themes without losing a draft.
7. External conflict and crash-recovery decisions.
8. Optional Stats off; if on, accessible charts and isolated error fallback.
9. Astro site EN/FR navigation, three themes, real demo media, privacy, truthful
   download states, no-JS content, and no third-party request.

Test user-visible outcomes and emitted typed commands, not internal component
structure. Keep screenshots only for failures unless stable visual baselines are
deliberately approved.

**Verify**: Browser E2E command -> every project passes twice consecutively.

### Step 3: Add accessibility automation and manual protocol

Use `@axe-core/playwright 4.12.1` on every major desktop and site route/state/theme with zero
serious or critical violations. Add direct tests for dialog focus trap/return,
command palette, virtual-row focus, selection announcement, form errors, live
toast politeness, shortcut recorder, chart table alternative, reduced motion,
reduced transparency, increased contrast, 200% zoom, and no-color-only status.

Document manual VoiceOver on macOS and Orca on Linux protocol. Include full
keyboard journey and high-contrast checks. Fix the product code only when a test
or documented manual failure reproduces the issue.

**Verify**: Accessibility command exits 0; `docs/RELEASE_CHECKLIST.md` has an unchecked manual row per target until a human records evidence.

### Step 4: Establish measured performance budgets

Add deterministic benchmarks or test harnesses with generous regression budgets:

- derive/search/filter 20,000 notes under 50ms median on the reference dev host;
- selection range and command dispatch under 16ms median;
- visible DOM note rows under 150 at any scroll position;
- quick-capture window content interactive within 250ms after native show event
  on the reference macOS smoke build;
- Workspace single-note commit under 100ms median on local temp storage and no
  O(n) full-body rewrite beyond manifest cost;
- initial Notes JS gzip budget agreed and recorded; chart code absent when flag off.
- Astro home LCP < 2.5s, INP < 200ms, CLS < 0.1 on the documented Lighthouse
  profile; no client framework bundle and no third-party request before a click.

CI should use relative regression thresholds where absolute timing is unstable.
Profile first; use memoization or chunk changes only when the trace identifies a
real cost. Record host and method in `docs/TESTING.md`.

Add a desktop motion audit at normal speed and 0.25x slow motion. Verify press
feedback is visible in the first rendered frame, rapid open/close retargets from
the current value, no interaction waits on animation completion, and every
entrance/exit path is symmetric. Any direct manipulation must track the pointer
1:1, preserve measured release velocity, use visual-only resistance, and require
documented hysteresis. Trace representative interactions and fail the budget if
they animate layout/paint-heavy properties, add raw scroll listeners, create a
runaway render loop, or apply layout animation to virtual rows.

**Verify**: Performance command exits 0 twice; bundle script identifies route chunks and budgets.

### Step 5: Run fault, privacy, and content-safety audits

Automate transaction failure injection, disk-full/permission-denied simulation,
corrupt preferences/manifest, watcher burst, stale revision, clipboard denial,
listener registration conflict, and capture permission denial. Confirm no
acknowledged save disappears and last valid snapshots stay available.

Create `check-secrets.ts` to scan built/log/test artifacts for fixture sentinel
note content, clipboard content, selected text, absolute home paths, tokens, and
private-key headers across desktop and built site artifacts. Add
`check-translations.ts` for desktop Paraglide and site dictionary EN/FR parity and no
obvious visible string literals in feature TSX, allowing documented exceptions.
Review all Tauri capabilities against least privilege.

**Verify**: `bun run test:fault && bun run check:privacy && bun run check:i18n` -> exit 0; capability review is recorded in release checklist.

### Step 6: Consolidate the release gate and audit maintainability

Define `verify:release` to run frozen install check, generated bindings check,
typecheck, Biome, unit tests, Playwright, axe, privacy/i18n/bundle/performance
checks, Rust fmt/clippy/tests, and current-platform debug bundle. Document fast
inner-loop commands separately from the full gate.

Run the thermo-nuclear maintainability review. Reject speculative layer creation.
Fix only giant components, duplicated conditions, leaked adapter types, or module
boundary violations that are concrete and covered by tests. Ensure no TODO,
FIXME, skipped test, `only`, or unbounded ignore remains in release code.

**Verify**: Aggregate command exits 0; `rg -n "TODO|FIXME|\.only\(|\.skip\(|@ts-ignore|allow\(dead_code\)" apps packages 2>/dev/null` -> no unexplained release-code matches.

## Test plan

- The Steps section is the test plan. Every P1 user journey must exist at unit,
  component or E2E level appropriate to the boundary.
- Native global behavior additionally requires dated manual platform evidence.
- Run `verify:release` twice from clean processes to expose leaks/order coupling.

## Done criteria

- [ ] All prior P1 plan rows are `DONE`; optional Stats is either fully gated or green.
- [ ] Nine critical desktop/site Playwright journeys pass in Chromium/WebKit.
- [ ] Axe has zero serious/critical violations and manual protocols are documented.
- [ ] Apple-style motion audit proves immediate response, interruption,
  current-value/velocity continuity, symmetric paths, restrained materials, and
  reduced motion/transparency/contrast behavior.
- [ ] Performance/bundle budgets pass with recorded method and host.
- [ ] Fault injection proves recoverability and listener/watcher cleanup.
- [ ] Privacy scan finds no content, paths, secrets, or private keys in artifacts.
- [ ] EN/FR parity and generated bindings are current.
- [ ] Astro static output, metadata, real media, links, privacy, and Core Web Vitals pass.
- [ ] Rust fmt/clippy/tests and aggregate release verification pass twice.
- [ ] No release-blocking maintainability finding remains.
- [ ] This plan is `DONE` in the index.

## STOP conditions

- Any test demonstrates data loss, silent overwrite, clipboard/content logging,
  false global shortcut triggers, or an unsupported platform claim.
- The site advertises an unavailable download, emits a tracker request, uses fake
  product media, or diverges from the shared theme contract.
- A P1 user journey has no deterministic automated layer and no feasible manual gate.
- Accessibility has an unresolved serious/critical violation.
- Any animation locks input, restarts from stale endpoints, obscures focus/state
  in an accessibility mode, or causes sustained layout/paint work.
- Performance remediation would require changing persisted semantics or public IPC.
- The full gate is flaky twice for different test order/process runs.

## Maintenance notes

- Keep E2E focused on stable user outcomes; move combinatorics to pure unit tests.
- Timing budgets need periodic reference-host recalibration, not silent deletion.
- macOS native behavior always retains a manual smoke step until a reliable
  automation surface exists.
