# Plan 014: Close release quality against exact GitHub candidate artifacts

> **Executor instructions**: This is a release-quality closure plan, not a
> feature plan. Run it only after Plan 017 is DONE. Invoke
> `web-design-guidelines`, `apple-design`, `vercel-react-best-practices`, and
> `thermo-nuclear-code-quality-review` after deterministic tests pass. Fix only
> reproduced failures with regression tests. Platform code signing is not a
> completion criterion: macOS uses Tauri's configured ad-hoc identity, Windows
> is unsigned, and the evidence must state those limits plainly. Tauri updater
> signatures belong to Plan 015 and do not replace OS trust. Stop on every STOP
> condition and update the index only after the full gate passes twice.
>
> **Drift check (run first)**:
> `git diff --stat 7294773..HEAD -- package.json bun.lock apps packages scripts docs .github plans/README.md`
> Plans 016 and 017 are expected to change desktop presentation and media.
> Reconcile their final compact-state matrix before running this plan. Stop if
> a P1 journey lacks a deterministic layer or if a release claim exceeds the
> current exact artifact evidence.

## Status

- **Priority**: P1
- **Effort**: L automation review plus XL physical matrix
- **Risk**: HIGH
- **Depends on**: `plans/017-align-compact-shelf-features.md`
- **Category**: tests, performance, security, release
- **Planned at**: commit `7294773`, 2026-08-11

## Why this matters

The repository now has substantial automated quality coverage, but browser
fixtures cannot prove native Accessibility, global shortcuts, pasteboard races,
real filesystem durability, native file pickers, OS assistive technology, or
installation behavior. The former plan remained blocked on paid Apple signing
and an undefined “signed candidate.” The operator has explicitly rejected paid
Apple and Windows certificates.

The honest release gate is therefore the exact artifact that GitHub Actions will
publish: ad-hoc-signed on macOS, unsigned on Windows, and ordinary unsigned
packages on Linux. Those artifacts can still be tested rigorously, but the
evidence and public copy must preserve Gatekeeper, SmartScreen, permission
continuity, and platform-support limitations. Plan 015 later adds a distinct
Tauri cryptographic signature for update packages.

## Current state

- `package.json` exposes `bun run verify:release`, which orders bindings, lint,
  typecheck, unit tests, builds, E2E, privacy, performance, workflow policy,
  Rust formatting, Clippy, and Rust tests.
- `.github/workflows/quality.yml` runs desktop frontend/browser validation and a
  macOS/Linux/Windows Rust matrix; Windows Rust tests are compile/Clippy-only.
- `.github/workflows/review-builds.yml` can build manual unsigned macOS, Linux,
  and Windows review artifacts, but it is not the final GitHub Release path.
- `apps/desktop/e2e/release.spec.ts` covers core shelf journeys. Plans 016-017
  must extend it for the 400-520px compact matrix and complete feature states.
- `docs/TESTING.md` documents automated budgets and native-only protocols.
- `docs/RELEASE_CHECKLIST.md` still requires a “Signed macOS” row that conflicts
  with the operator's distribution posture and must become exact-candidate
  evidence.
- `docs/platform-support.md` still gates release advertising on a stable
  Developer ID identity. Plan 015 must accept a new ADR before that contract can
  change; this plan records evidence without silently superseding it.
- `apps/desktop/src-tauri/tauri.conf.json:52-55` uses the ad-hoc macOS
  pseudo-identity `-`. It is not an Apple-authenticated Developer ID identity.

## Artifact trust model

Keep these terms distinct in code, docs, tests, and review:

| Mechanism | What it proves | What it does not prove |
| --- | --- | --- |
| GitHub Release and SHA-256 manifest | Artifact is the reviewed file attached to an immutable version/tag | Publisher identity to macOS/Windows |
| macOS ad-hoc code signature | Bundle integrity/coherence for the built app | Apple Developer identity, notarization, stable Gatekeeper/TCC reputation |
| Unsigned Windows installer | Nothing beyond GitHub/manifest provenance | Authenticode identity or SmartScreen reputation |
| Tauri updater signature, Plan 015 | Update metadata/package was signed by the app's configured updater key | Apple notarization, Authenticode, or first-install trust |

No test result may collapse these mechanisms into the phrase “signed app.” Use
the exact mechanism instead.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Frozen install | `bun install --frozen-lockfile` | exit 0 with Bun 1.3.12 |
| Frontend | `bun run test` | all desktop/site unit tests pass |
| Browser | `bun run test:e2e` | compact journeys pass in Chromium/WebKit |
| Accessibility | `bun run test:a11y` | zero serious/critical violations |
| Performance | `bun run test:perf` | documented production budgets pass |
| Privacy | `bun run check:privacy` | no Note/clipboard/source-path/secret leak |
| Bindings | `bun run bindings:check` | generated DTOs current |
| Workflow policy | `bun run check:workflows` | immutable action/permission policy passes |
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 on a supported host |
| Aggregate | `bun run verify:release` | every automated gate passes twice from clean processes |
| macOS local candidate | `APPLE_SIGNING_IDENTITY=- bun run tauri:build -- --bundles app,dmg` | app/DMG builds with ad-hoc identity and no Apple credential |
| Signature truth | `codesign --verify --deep --strict <Charon.app> && codesign -dv --verbose=4 <Charon.app>` | verification passes and evidence identifies ad-hoc, not Developer ID |
| Diff | `git diff --check && git status --short` | only intended evidence/test fixes changed |

The executor must use exact explicit artifact paths when running platform tools;
never paste a broad glob into a destructive command.

## Scope

**In scope**:

- Existing test/release scripts and deterministic fixtures
- Missing tests for compact-state or exact-candidate regressions
- `docs/TESTING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASING.md`, and
  `docs/platform-support.md` only for evidence terminology that does not change
  an accepted platform contract
- An evidence manifest or `docs/MANUAL_ACCEPTANCE.md`
- Existing product source only for a reproduced failing gate with a regression test
- `plans/README.md` after every done criterion passes

**Out of scope**:

- GitHub Release workflow redesign, updater dependencies/config/UI, key
  generation, site release links, or ADR changes; Plan 015 owns them
- Apple Developer ID, notarization, Windows Authenticode, certificate purchase,
  store distribution, or wording that implies those exist
- New product features, hierarchy, routes, cloud services, broad visual redesign,
  or weakening performance/privacy/accessibility gates
- Publishing, tagging, pushing, installing, or promoting a platform claim
  without explicit operator authority

## Git workflow

- Branch: `codex/014-exact-candidate-quality`
- Commits are one proved `test:`, `fix:`, `perf:`, or evidence documentation
  unit at a time.
- Do not push, tag, publish, install, or open a pull request unless separately
  authorized.

## Steps

### Step 1: Reconcile the automated gate with Plans 016-017

Review every aggregate subcommand and compact E2E state. Ensure the release gate
actually includes bindings, lint/typecheck, unit, production builds, desktop and
site tests, compact E2E/Axe, privacy, performance, workflow policy, Rust format,
Clippy, and Rust tests. Keep timing-sensitive performance outside shared PR CI
if the recorded method shows runner contention.

Add missing deterministic coverage only where Plans 016-017 left an explicit
gap. Mutation-test the aggregate by making each subgate fail in an isolated
temporary/disposable context and confirming `verify:release` returns nonzero;
do not commit mutations.

**Verify**: `bun run verify:release` passes once; each subgate has proved
failure propagation; no test is skipped/only and no threshold was relaxed.

### Step 2: Rewrite the manual checklist around exact candidates

Replace platform-signature assumptions in `docs/RELEASE_CHECKLIST.md` and the
manual evidence template with precise rows:

- record version, commit, artifact name, byte size, SHA-256, target OS/arch,
  GitHub Actions run, and builder image;
- macOS: record ad-hoc `codesign` details, Gatekeeper/quarantine result, exact
  manual-open path required by the OS, TCC grant/regrant behavior, and explicit
  absence of Developer ID/notarization;
- Windows: record exact unsigned state, SmartScreen warning/flow, installer
  format, WebView2 behavior, and explicit absence of Authenticode;
- Linux: record package format, checksum, desktop environment, dependencies,
  install/launch result, and explicit signature posture;
- distinguish updater-package signature fields as “not configured until Plan
  015” rather than calling platform artifacts signed.

An empty evidence field is not a pass. Use `PASS`, `FAIL`, `BLOCKED`, or
`N/A: <justification>` only.

**Verify**: documentation search finds no active requirement for a paid
certificate in this plan and no sentence equates Tauri updater signing with OS
code signing.

### Step 3: Build and identify exact local/review candidates

Run the frozen install and aggregate gate. Build the available host candidate
with the same Tauri configuration intended for GitHub. Record hashes and
identity. For macOS, prove the bundle is ad-hoc and exercise the actual
download/quarantine/manual-open path where operator authority permits. For
Linux/Windows, use review workflow artifacts when available and record unsigned
state rather than reusing browser evidence.

Do not promote a local debug build as a release candidate. Do not install or
download artifacts without explicit operator authorization; prepare the exact
commands and evidence fields, then stop at the manual boundary if absent.

**Verify**: each available candidate is uniquely identified and no artifact is
described as Developer ID, notarized, Authenticode, or trusted by the OS.

### Step 4: Run the native product matrix

Against the exact candidate, repeat:

- macOS AppKit, WebKit, Chromium/Electron/Codex, editor, PDF, secure/blocked/
  canvas, rich clipboard, timeout, restoration failure, concurrent write,
  permission denial, restart, and exactly-one Note capture cases;
- portable shortcut, composer, search/status, Selection, editor, Tags,
  20-Attachment/long-name/import/remove states, copy, Delete, Workspace chooser,
  and restart on each available platform;
- VoiceOver macOS, Orca Linux, and Narrator Windows where applicable;
- compact window matrix from Plans 016-017, including 400x480 and effective
  360px at 200%;
- offline launch and network observation with updater still absent.

Record limitations per exact artifact. macOS permission continuity after an
ad-hoc rebuild/update is evidence, not an assumption. Standard Linux/Windows
claims remain unpromoted until their own rows pass.

**Verify**: every applicable P1 manual row has evidence; failures return to the
owning plan with a regression test rather than being waived here.

### Step 5: Review quality and close the plan

Run the strict maintainability review last. Fix only concrete release-blocking
findings with tests. Then run `bun run verify:release` twice from separate clean
processes without changing code or thresholds between runs.

Review the complete diff for secrets, private paths, synthetic content, raw
colors, generated files, unsupported claims, and unrelated user changes. Set
Plan 014 to `DONE` only when every automated gate and applicable exact-candidate
row passes. A platform may remain unsupported without blocking release of other
truthfully labeled artifacts.

**Verify**: both aggregate runs pass; evidence manifest is complete; diff review
passes; index status is truthful.

## Test plan

- Automated: every existing release subgate plus compact feature coverage from
  Plans 016-017, twice from clean processes.
- Artifact identity: immutable name/hash/version/run/OS/arch and exact trust mechanism.
- Native macOS: full capture, permissions, clipboard race, focus, restart, and
  ad-hoc TCC continuity matrix.
- Standard Linux/Windows: install/launch, shortcut/composer, Workspace, editor,
  Tags, Attachments, copy, Delete, accessibility, and OS warning evidence.
- Cross-cutting: offline privacy, compact widths/zoom, themes/locales, reduced
  preferences, real filesystem and native picker behavior.

## Done criteria

- [ ] `bun run verify:release` passes twice from clean processes.
- [ ] Every aggregate subgate demonstrably fails the aggregate when broken.
- [ ] Compact E2E/Axe/performance/privacy coverage from Plans 016-017 is included.
- [ ] Manual checklist identifies exact artifacts and separates GitHub, ad-hoc, unsigned, and Tauri-updater trust.
- [ ] macOS evidence states ad-hoc identity and absence of Developer ID/notarization.
- [ ] Windows evidence states unsigned/SmartScreen posture and absence of Authenticode.
- [ ] Every applicable native product/accessibility row has dated evidence or a truthful platform limitation.
- [ ] No paid certificate or unsupported platform claim is required to close this plan.
- [ ] No release, tag, push, install, or platform promotion occurred without authority.
- [ ] Plan 014 is `DONE` in `plans/README.md` only after its criteria pass.

## STOP conditions

Stop and report back if:

- Any test shows data loss, orphan Attachment bytes, surviving completed-delete
  content, source-path leakage, clipboard overwrite, false capture, or focus theft.
- A serious/critical accessibility issue or compact overflow remains.
- Passing requires a disabled test, ignored advisory, hidden platform warning,
  threshold relaxation, or calling an unsigned/ad-hoc artifact “signed.”
- Native testing requires installation/download/publication authority that was
  not granted; prepare the matrix and stop at the boundary.
- The exact ad-hoc macOS artifact cannot run the manual composer safely; do not
  claim the enhanced capture path as a workaround.
- Release verification remains flaky after two method corrections.
- An accepted platform-signing contract must change before evidence wording can
  be truthful; leave that change to Plan 015's ADR gate.

## Maintenance notes

- Re-run this exact-candidate matrix for every release candidate, even when the
  Tauri updater signature stays unchanged.
- Never shorten “ad-hoc code signature” to “signed macOS release” in public copy.
- Treat OS warnings and TCC permission continuity as release behavior, not
  documentation trivia.
- A future paid certificate can raise a platform trust tier only through a new
  evidence pass and contract update; it is not part of the current roadmap.
