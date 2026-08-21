# Plan 028: Repair the verification gates and reconcile stale documentation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- biome.json .github/workflows/security.yml scripts package.json apps/desktop/package.json apps/site/package.json README.md plans/LAUNCH.md docs/TESTING.md docs/RELEASE_CHECKLIST.md AGENTS.md apps/desktop/src-tauri/tests .github/dependabot.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (many small mechanical steps)
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tests / docs
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Several gates are red or hollow, and several documents are actively wrong:

- `bun run lint` (and therefore `bun run check` and `verify:release`) fails on
  any developer machine that has a `.claude/settings.local.json` (a local file
  hidden by the user's global gitignore) because `biome.json` neither excludes
  `.claude/` nor enables `vcs.useIgnoreFile`; it also excludes a
  `routeTree.gen.ts` that no longer exists.
- The weekly `security.yml` cannot pass: `bun audit` currently exits 1 (three
  high advisories, all build-path only: `js-yaml`, `nanoid`, `fast-uri`), and
  `check:privacy` runs without a build so `check-privacy.ts` throws `ENOENT` on
  `apps/desktop/dist`. `bun run check:privacy` in README/TESTING fails on a
  clean clone for the same reason.
- The privacy sentinel has two patterns that can never match
  (`selected text sentinel`, `clipboard sentinel` appear nowhere in the source),
  scans only macOS `/Users/` paths, and does not check the fixture strings that
  `docs/TESTING.md:26` promises are absent from the production bundle, nor
  network APIs.
- The three "privacy" Rust tests assert things the type system already
  guarantees; the actual content-stripping conversions in
  `workspace/error.rs:48-110` have no test.
- Nothing checks that the 14 command names in `apps/desktop/src/lib/ipc/*.ts`
  match Rust's `generate_handler!` list.
- No `cargo audit` runs in CI; no dependency update bot exists in an
  exactly-pinned repo; `engines.node` is declared only for the site.
- Docs drift: `RELEASE_CHECKLIST.md:20` gates on "three themes" (there are
  two, and the site has no theme control); `TESTING.md:52-55` claims LCP/INP/CLS
  gates that do not exist and a "150 rendered rows" gate that is a unit test;
  `AGENTS.md:114-115` lists "generated routes"; `README.md:61`/`LAUNCH.md:7`
  attribute Node ≥22.12 to Astro only (jsdom needs ≥22.22); `README.md`/`LAUNCH.md`/
  `TESTING.md` "Verify" recipes omit `bun run build` before `check:privacy`/`test:perf`.

## Current state

- `biome.json:3-16` — `files.includes` = `["**", "!**/.astro", "!**/dist", "!**/playwright-report", "!**/target", "!**/test-results", "!apps/desktop/src/routeTree.gen.ts", "!apps/desktop/src/paraglide", "!apps/desktop/project.inlang/cache", ...]`; no `vcs` block.
- `.github/workflows/security.yml:11-25` — steps: harden-runner, checkout,
  setup-bun, `bun install --frozen-lockfile`, `bun audit`,
  `bun scripts/check-workflows.ts`, `bun run check:privacy`; no `timeout-minutes`,
  no `concurrency`.
- `scripts/check-privacy.ts:3-12` — roots `apps/desktop/dist`, `apps/site/dist`;
  patterns: `/\/Users\/[A-Za-z0-9._-]+/u`, PEM header, `api_key|secret|token: "…"`,
  `/selected text sentinel/iu`, `/clipboard sentinel/iu`; `walk()` calls
  `readdir` with no existence guard.
- Fixture identifiers (from `apps/desktop/src/test/demo-workspace.ts` /
  `workspace-fixture.ts`): `Agent handoff`, `release-brief.pdf`,
  `charon:fixture-composer-focus` (verify by grep before using them).
- `apps/desktop/src-tauri/tests/capture_contract.rs:344-353`,
  `tests/preferences_contract.rs:8-17` — tautological privacy assertions;
  `src/workspace/error.rs:48-110` `From<WorkspaceError> for WorkspaceIpcError`
  drops `Validation(String)`, `NotFound(String)`, `Io` payloads (untested).
- `apps/desktop/src-tauri/src/lib.rs:31-50` `generate_handler![...]` (18
  names); `apps/desktop/src/lib/ipc/{workspace,capture,clipboard,preferences}-client.ts`
  contain `invoke<...>('name')` literals; `scripts/check-bindings.ts` diffs
  ts-rs types only.
- `package.json:34` `verify:release` chain (12 steps); `:24` `test:a11y` script
  (`playwright test --grep 'axe-clean'`) is referenced by no workflow or doc.
- `scripts/check-performance.ts:14-31` benchmarks a hand-written filter, not
  `apps/desktop/src/features/notes/search.ts` (Plan 031 fixes the gate itself;
  this plan only documents it honestly).
- `.github/` contains only `workflows/` — no `dependabot.yml`.
- `apps/site/package.json:6-8` `engines.node: ">=22.12.0"`; root and desktop
  have none; installed `jsdom@30.0.1` requires `>=22.22.2`.

Conventions: Bun scripts in `scripts/*.ts` (top-level `await`, throw on
failure, `console.log` summary), workflow steps SHA-pinned with comments,
docs in plain English matching `AGENTS.md` vocabulary.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Lint | `bun run lint` | exit 0 |
| Full JS gate | `bun run check` | exit 0 |
| Build both | `bun run build` | exit 0 (needed before privacy/perf) |
| Privacy | `bun run check:privacy` | "privacy scan passed for ..." |
| Perf | `bun run test:perf` | JSON summary |
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Workflow policy | `bun scripts/check-workflows.ts` | passes |
| Audit | `bun audit` | 0 vulnerabilities (after Step 3) |
| Cargo audit | `cargo audit` (installed locally: 0.22.1) | only unmaintained warnings |

## Scope

**In scope**:
- `biome.json`
- `.github/workflows/security.yml`, `.github/dependabot.yml` (create)
- `scripts/check-privacy.ts`, `scripts/check-ipc-commands.ts` (create), `package.json` (scripts, engines), `apps/desktop/package.json` (engines), `bun.lock` (via `bun update` for the three advisories only)
- `apps/desktop/src-tauri/tests/*_contract.rs` (privacy conversion tests)
- `README.md`, `plans/LAUNCH.md`, `plans/README.md` (line 29 wording), `docs/TESTING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASING.md`, `AGENTS.md` (one list item)

**Out of scope**:
- Changing what the perf gate measures (Plan 031).
- Any application code.
- Playwright config/CI project selection.

## Git workflow

- Branch: `codex/028-gates-and-docs`
- Commit message: `chore(repo): repair verification gates and reconcile docs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix Biome scope

`biome.json`: add `"vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }`;
add `"!**/.claude"` to `files.includes`; delete the `routeTree.gen.ts` line.

**Verify**: `bun run lint` → exit 0 even with `.claude/settings.local.json` present; `bun run check` → exit 0.

### Step 2: Make `check-privacy.ts` honest and complete

- Fail with a clear message when a root is missing:
  `throw new Error(\`privacy scan root missing: ${root} — run \`bun run build\` first\`)`.
- Replace the two dead sentinel patterns with fixture identifiers that must not
  ship (grep `apps/desktop/src/test` for the exact strings first; e.g.
  `Agent handoff`, `release-brief.pdf`, `charon:fixture-composer-focus`).
- Add path patterns for Linux and Windows homes:
  `/\/home\/[A-Za-z0-9._-]+/u`, `/[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+/u`.
- Add desktop-bundle network sinks: `/\bfetch\(/u`, `/XMLHttpRequest/u`,
  `/sendBeacon/u`, `/new WebSocket\(/u`, `/https?:\/\/(?!ipc\.localhost)/u`
  — but apply these **only to `apps/desktop/dist`** (the site legitimately
  contains `https://` links); implement a per-root pattern list.
  Run once and allowlist any false positive by exact string with a comment
  (React/Vite runtime may contain `fetch` in dead branches — inspect before
  allowlisting).

**Verify**: `bun run build && bun run check:privacy` → passes; `bun run check:privacy apps/nonexistent` → fails with the "root missing" message.

### Step 3: Make `security.yml` able to pass

- Add `timeout-minutes: 15` and a `concurrency` group.
- Insert `- run: bun run build` before `bun run check:privacy`.
- Bump the three transitive advisories with `bun update js-yaml nanoid fast-uri`
  (or `overrides` in root `package.json` if they are not direct deps), then
  `bun audit` → 0. Keep every direct dependency exactly pinned; only `bun.lock`
  and possibly an `overrides` block change.
- Add a `cargo audit` step: install via `cargo install --locked cargo-audit`
  after `Swatinem/rust-cache` (SHA-pinned actions only), run
  `cargo audit --file apps/desktop/src-tauri/Cargo.lock` **without** `--deny warnings`
  (unmaintained gtk3-rs transitives are Tauri's, not actionable).
- Register `security.yml` in `check-workflows.ts` if Plan 022 has not
  (fragments: `schedule:`, `permissions:\n  contents: read`, `bun run build`).

**Verify**: `bun audit` → "No vulnerabilities found" (or 0 high); `bun scripts/check-workflows.ts` → passes; `bun run build && bun run check:privacy` → passes.

### Step 4: Add the IPC command-name parity check

Create `scripts/check-ipc-commands.ts`: parse `apps/desktop/src-tauri/src/lib.rs`
for the `generate_handler![ ... ]` block and collect `ipc::<mod>::<name>`
names; parse `apps/desktop/src/lib/ipc/*.ts` for `invoke<...>('name'` and
`invoke('name'`; assert set equality both ways (report extras on each side).
Add `"ipc:check": "bun scripts/check-ipc-commands.ts"` to root `package.json`
and include it in `verify:release` right after `bindings:check`. It should
fail today if Plan 027 Step 3 has not yet removed the four unused commands —
in that case list them as **allowed extras** in a small array with a comment
referencing Plan 027, so the script passes now and Plan 027 removes the
allowlist.

**Verify**: `bun run ipc:check` → passes; temporarily rename one literal in `workspace-client.ts` → fails; restore.

### Step 5: Replace tautological privacy tests with real conversion tests

In `tests/workspace_contract.rs` (or a new `tests/ipc_error_contract.rs`),
table-drive `WorkspaceIpcError::from(...)` over every `WorkspaceError` variant
seeded with a marker (`Validation("MARKER-…")`, `NotFound("MARKER-…")`,
`Io(std::io::Error::other("MARKER-…"))`, `RecoveryRequired { backup_location: "backups/x" }`),
serialize with `serde_json::to_string`, and assert: `MARKER` never appears; the
`code`/`message_key` pairs are exactly the current strings. Do the same for
`CaptureIpcError`, `ClipboardIpcError`, `PreferencesIpcError` conversions.
Delete `capture_contract.rs:344-353` and `preferences_contract.rs:8-17` once
their replacements exist.

**Verify**: `cargo test ... --locked` → pass, ≥4 new tests; `grep -n "MARKER" apps/desktop/src-tauri/tests/*.rs` → only inside the new tests.

### Step 6: Dependabot and engines

Create `.github/dependabot.yml` with three ecosystems (`npm` at `/` with
`versioning-strategy: increase` so exact pins are rewritten, `cargo` at
`/apps/desktop/src-tauri`, `github-actions` at `/`), weekly, grouped
(`groups: { all: { patterns: ["*"] } }`), `open-pull-requests-limit: 5`.
Add `"engines": { "node": ">=22.22.2" }` to root and desktop `package.json`.
Mention in `docs/RELEASING.md` that the action SHA ledger is updated by
Dependabot PRs.

**Verify**: `bun install --frozen-lockfile` still passes; `cat .github/dependabot.yml` is valid YAML (`bunx yaml lint` if available, else visual).

### Step 7: Reconcile the docs

- `README.md` and `plans/LAUNCH.md` "Verify": insert `bun run build` after
  `bun run check`; state Node ≥22.22 for Astro/Vite/jsdom.
- `docs/TESTING.md`: same recipe fix; rewrite lines 52-55 into three
  sentences: enforced by `test:perf` (gzip cap, 20k search median — noting
  Plan 031 will make it measure the real function), enforced by the desktop
  unit suite (`note-list.test.tsx` <150 rows), design targets not gated
  (LCP/INP/CLS); mention `test:a11y` as a local convenience or delete the
  script (`package.json:24`, `apps/desktop/package.json:16`) — pick one.
- `docs/RELEASE_CHECKLIST.md:20` → "Site EN/FR, no-JS, media and link review"
  (+ a separate "Desktop Light/Graphite review" row if wanted).
- `AGENTS.md:114-115` → remove "generated routes".
- `plans/README.md`: confirm the "After Plan 020, Plan 014 …" wording (already corrected on 2026-08-17 when the index was updated; just verify).

**Verify**: `grep -n "three themes" docs/RELEASE_CHECKLIST.md` → none; `grep -n "generated routes" AGENTS.md` → none; `grep -n "After Plan 019" plans/README.md` → none.

## Test plan

- Step 2/3: `security.yml`-equivalent local sequence (`bun install`, `bun audit`,
  `bun scripts/check-workflows.ts`, `bun run build`, `bun run check:privacy`) passes.
- Step 4: parity script fails on a deliberate rename, passes otherwise.
- Step 5: new Rust conversion tests.

## Done criteria

- [ ] `bun run lint` passes with a `.claude/` directory present
- [ ] `bun audit` reports 0 high; `security.yml` has build + timeout + concurrency + cargo audit
- [ ] `check-privacy.ts` fails clearly on a missing root, scans Linux/Windows path shapes, fixture strings, and desktop network sinks
- [ ] `bun run ipc:check` exists and is in `verify:release`
- [ ] Privacy conversion tests replace the tautological ones
- [ ] `.github/dependabot.yml` exists; `engines.node` declared at root and desktop
- [ ] Docs no longer say "three themes", "generated routes", "After Plan 019", or claim LCP/INP/CLS gates; verify recipes include `bun run build`
- [ ] `plans/README.md` status row for 028 updated

## STOP conditions

- `bun update` for the advisories drags a direct dependency off its exact pin
  or changes a major — stop and report; use `overrides` instead if possible.
- The desktop bundle contains an unavoidable `fetch(` string from a dependency
  runtime that cannot be allowlisted narrowly — report rather than dropping the
  pattern.
- `verify:release` fails at a step unrelated to this plan.

## Maintenance notes

- Keep `check-privacy.ts` per-root pattern lists small and commented; add a
  pattern whenever `docs/PRIVACY.md` gains a promise.
- The IPC parity script must be updated when a command is added on either side
  — that is the point.
- Dependabot PRs still go through `quality.yml`; the exact-pin policy is
  preserved by `versioning-strategy: increase`.
