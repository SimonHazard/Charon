# Plan 036: Compile and lint the Rust core on macOS and Windows in the Quality workflow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d0efa57..HEAD -- .github/workflows/quality.yml .github/workflows/release.yml scripts/check-workflows.ts scripts/check-workflows.test.ts docs/TESTING.md apps/desktop/src-tauri/Cargo.toml scripts/check-message-keys.ts package.json apps/desktop/messages/en.json apps/desktop/messages/fr.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d0efa57`, 2026-09-21

## Why this matters

The Rust capture adapters are `cfg(target_os)`-gated: `src/capture/platform/macos/*`
and `src/capture/platform/windows/*` are only compiled on their OS. The only
pull-request check runs on `ubuntu-24.04`, so a compile error in the macOS
adapter (the primary platform) merges green and is discovered only when a
version bump triggers the release matrix. Because the release workflow refuses
to reuse a version once its tag exists, that leaves `main` at a bumped version
with no publishable release. `docs/TESTING.md` still claims the check happens.
Three small hygiene items ride along: the declared `rust-version` is fiction,
the release build does not pass `--locked`, and Rust error message keys are not
checked against the Paraglide catalog.

## Current state

- `.github/workflows/quality.yml` — one job `desktop` on `ubuntu-24.04`. Rust
  steps (lines 40-42):

```yaml
      - run: cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
      - run: cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings
      - run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

  Toolchain setup used there (lines 24-31, reuse verbatim):

```yaml
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable resolved 2026-08-09
        with:
          toolchain: 1.91.0
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2
        with:
          workspaces: apps/desktop/src-tauri
```

- `.github/workflows/release.yml` build job — matrix `macos-15` / `ubuntu-24.04` /
  `windows-2025`; the build step is
  `run: bun run --cwd apps/desktop tauri:build -- --bundles "$BUNDLE_TARGETS"` (no `--locked`).
- `scripts/check-workflows.ts` + `scripts/check-workflows.test.ts` — a
  regression test that parses the workflow YAML and asserts structure (pinned
  action SHAs, arm64 runner assertion, etc.). Read both before editing YAML;
  the test suite is run by `bun run test:release` and `bun run check:workflows`.
- `apps/desktop/src-tauri/Cargo.toml:11` — `rust-version = "1.77.2"`;
  `apps/desktop/src-tauri/rust-toolchain.toml` pins `channel = "1.91.0"`.
- `docs/TESTING.md` — states "Compile/clippy-check the full app for both Linux
  and Windows with the pinned Rust toolchain" and "Quality runs these checks on
  each pull request".
- Message keys: Rust emits `message_key` strings (e.g.
  `apps/desktop/src-tauri/src/capture/model.rs:80` `"capture_warning_clipboard_not_restored"`,
  `src/capture/error.rs`, `src/workspace/*`, `src/clipboard/*`, `src/preferences/*`).
  React resolves them with an untyped cast and a generic fallback
  (`apps/desktop/src/app/providers.tsx:105-110`, `note-editor.tsx:287-290`,
  `components/workspace-state.tsx:20-23`, `preferences-panel.tsx:225-229`).
  Catalog: `apps/desktop/messages/en.json`. Existing script pattern to copy:
  `scripts/check-ipc-commands.ts` (reads Rust source with `Bun.file`, regex-extracts
  names, throws on mismatch, prints a `verified …` line).
- Root scripts: `package.json` `"ipc:check": "bun scripts/check-ipc-commands.ts"`,
  `"check": "bun run lint && bun run typecheck && bun run test"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Workflow regression tests | `bun run test:release` | all pass |
| Workflow lint | `bun run check:workflows` | exit 0 |
| Rust (local macOS) | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Message-key guard (new) | `bun scripts/check-message-keys.ts` | prints `verified N message keys` |
| Full gate | `bun run check` | exit 0 |

## Scope

**In scope**:
- `.github/workflows/quality.yml`
- `.github/workflows/release.yml` (only add `--locked` to the build command)
- `scripts/check-workflows.ts`, `scripts/check-workflows.test.ts`
- `scripts/check-message-keys.ts` (create), `scripts/check-message-keys.test.ts` (create)
- `package.json` (add `messages:check` script and wire it into `check`)
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json` (add the
  missing Workspace health manifest message)
- `apps/desktop/src-tauri/Cargo.toml` (`rust-version` only)
- `docs/TESTING.md`

**Out of scope**:
- `security.yml`, `site-deploy.yml`.
- Adding Playwright/Bun steps to the new OS jobs (Linux keeps the full suite).
- Any Rust source change.

## Delivered changes

- Added the `rust-portability` Quality matrix for `macos-15` and
  `windows-2025`, with pinned Rust 1.91.0, Clippy `-D warnings`, and locked
  tests; the existing Linux desktop job keeps the full application gate.
- Locked the release `tauri build` cargo arguments and aligned Cargo's
  declared `rust-version` with `rust-toolchain.toml`.
- Added the Rust message-key catalog guard and regression tests, wired it into
  `test:release` and `check`, and added the missing Workspace-health manifest
  message in English and French. The guard explicitly excludes the Rust-only
  codes `workspace_unavailable` and `workspace_unknown`.
- Updated `docs/TESTING.md` and workflow regression assertions to describe and
  enforce the three-OS Quality boundary.

## Git workflow

- Branch: `codex/036-three-os-quality-gate`
- Commits: `ci(quality): compile the rust core on macos and windows`,
  `chore(desktop): align rust-version and lock the release build`,
  `test(i18n): guard rust message keys against the catalog`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `rust-portability` matrix job to `quality.yml`

Add a second job after `desktop`:

```yaml
  rust-portability:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-15, windows-2025]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 25
    steps:
      - uses: step-security/harden-runner@b09bb98e06d4d774595224525879c09bc6e98c40 # v2.20.1
        with:
          egress-policy: audit
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable resolved 2026-08-09
        with:
          toolchain: 1.91.0
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2
        with:
          workspaces: apps/desktop/src-tauri
      - run: cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings
      - run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Note `tauri-build` needs the frontend dist only for `tauri build`, not for
`cargo clippy/test` of the library crate; the existing Linux job already runs
these commands without a frontend build, so the same holds here. `harden-runner`
supports macOS and Windows runners only in audit mode; if `check-workflows.ts`
enforces harden-runner on every job and it fails on non-Linux, drop the
harden-runner step from this job and record why in the YAML comment.

Update `scripts/check-workflows.ts`/`.test.ts` to assert that `quality.yml`
contains a job whose matrix includes both `macos-15` and `windows-2025` and
runs `cargo clippy … -D warnings`.

**Verify**: `bun run test:release && bun run check:workflows` → all pass.

### Step 2: Align `rust-version` and lock the release build

- `Cargo.toml:11`: `rust-version = "1.91.0"` (the pinned toolchain; the true
  floor is unknown and pinning to the toolchain is the honest statement).
- `release.yml` build step: `bun run --cwd apps/desktop tauri:build -- --locked --bundles "$BUNDLE_TARGETS"`.
  Check `tauri build --help` locally (`bunx tauri build --help` in `apps/desktop`)
  to confirm the flag is forwarded to cargo; if it is not accepted, use
  `--` forwarding per the help output and add a workflow-test assertion for
  the chosen form.

**Verify**: `cargo metadata --manifest-path apps/desktop/src-tauri/Cargo.toml --format-version 1 --no-deps | grep '"rust_version":"1.91.0"'` → one match; `bun run test:release` → pass.

### Step 3: Add the message-key guard

Create `scripts/check-message-keys.ts`:

- Walk `apps/desktop/src-tauri/src/**/*.rs` (use `node:fs/promises` `readdir`
  with `recursive: true`).
- Extract message-key contexts from `message_key` assignments, error tuples,
  and the `CaptureWarning::message_key` method; exclude the Rust-only codes
  `workspace_unavailable` and `workspace_unknown`.
- Load `apps/desktop/messages/en.json`; fail with the list of keys missing from
  the catalog. Print `verified N message keys` on success.
- Add `scripts/check-message-keys.test.ts` (model after
  `scripts/check-release-version.test.ts`) that runs the extractor on a fixture
  string and on the real tree.
- `package.json`: `"messages:check": "bun scripts/check-message-keys.ts"`, add
  the test file to `test:release`, and append `&& bun run messages:check` to
  `check`.

**Verify**: `bun scripts/check-message-keys.ts` → `verified … message keys`; temporarily add a fake key to a `message_key` assignment in a Rust fixture, rerun the extractor test → fails naming it; revert.

### Step 4: Make `docs/TESTING.md` true

Rewrite the paragraph about cross-OS compilation to describe the new job:
Quality compiles and clippy-checks the Rust core on Linux, macOS, and Windows
on every pull request; physical OS matrices remain non-gating under ADR 0016.

**Verify**: `grep -n "macOS, and Windows" docs/TESTING.md` → one match; `bun run check` → exit 0.

## Test plan

- `scripts/check-workflows.test.ts`: new assertion for the portability matrix.
- `scripts/check-message-keys.test.ts`: fixture with one missing key fails,
  real tree passes.
- Verification: `bun run test:release` → all pass including the new tests.

## Done criteria

- [x] `bun run check` exits 0 (now includes `messages:check`)
- [x] `quality.yml` has a job running on both `macos-15` and `windows-2025` with clippy `-D warnings`
- [x] `Cargo.toml` `rust-version` equals the `rust-toolchain.toml` channel
- [x] `release.yml` build command contains `--locked`
- [x] `docs/TESTING.md` no longer claims a Linux-only workflow checks Windows
- [x] No files outside the in-scope list are modified
- [x] `plans/README.md` status row updated

## STOP conditions

- `check-workflows.ts` rejects the new job for a reason you cannot satisfy
  with a pinned SHA already present in the file (do not introduce new actions).
- `tauri build` does not accept `--locked` in any form: leave the release
  workflow untouched and report.
- The message-key regex produces false positives from Rust identifiers that are
  not message keys: narrow the regex to `message_key`/`messageKey` contexts and
  report the list you excluded.

## Maintenance notes

- Two more CI runners per PR (~5-10 min each with cache). If cost matters,
  add `paths:` filters so the portability job runs only when
  `apps/desktop/src-tauri/**` changes.
- Reviewer: confirm the harden-runner decision on non-Linux runners is documented in the YAML.
