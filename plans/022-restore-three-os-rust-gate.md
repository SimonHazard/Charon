# Plan 022: Restore an automatic three-OS Rust verification gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- .github/workflows scripts/check-workflows.ts README.md plans/LAUNCH.md docs/RELEASING.md docs/TESTING.md docs/platform-support.md apps/desktop/src-tauri/Cargo.toml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (CI/docs only)
- **Depends on**: `plans/021-make-workspace-persistence-portable.md` (a Windows `cargo test` job cannot be green before 021)
- **Category**: dx / verification baseline (cross-platform)
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

The Rust core is never compiled, linted, or tested on Windows by any automatic
gate, and Linux runs only on the `quality.yml` Ubuntu job. Commit `e1e63c5`
("refactor(ui): simplify the unified note shelf") removed the earlier
macOS/Linux/Windows matrix from `quality.yml`, and `docs/RELEASING.md` lost the
paragraph that explained Windows tests were compile-only because of "unresolved
Windows path, directory-sync, and watcher semantics" (commit `a4c6069`).
Plans 014 and 015 still describe a three-OS matrix that no longer exists.
`scripts/check-workflows.ts` now actively forbids `strategy:`, `macos-15`, and
`windows-2025` inside `quality.yml`, so the gate must live in its own workflow
and be registered in that policy script.

Separately, the `Quality` workflow on `main` failed on its last three pushes
(runs 31745805826, 31752310692, 31899062049 — each ended within 4–24 s with no
readable job logs from this environment), so the routine gate is currently red
for a reason the operator must inspect first.

Also missing: a pinned Rust toolchain (`-D warnings` on floating `stable` can
turn `main` red without any repo change), and README prerequisites for Linux
and Windows contributors (the apt list exists only inside CI YAML).

## Current state

- `.github/workflows/quality.yml:34` — `runs-on: ubuntu-24.04`, one job; Rust
  steps at `:58-60` (`cargo fmt --check`, `cargo clippy ... -D warnings`,
  `cargo test --locked`).
- `.github/workflows/review-builds.yml:4` — `workflow_dispatch:` only; 3-OS
  matrix (`macos-15`, `ubuntu-24.04`, `windows-2025`) that runs `tauri-action`
  (build only, no tests).
- `.github/workflows/release.yml` — macOS-only jobs.
- `scripts/check-workflows.ts:28-83` — asserts `quality.yml` fragments;
  `:66-70` requires exactly one `runs-on:`; `:71-82` forbids `strategy:`,
  `macos-15`, `windows-2025`, WebKit in `quality.yml`. `:85-104` asserts
  `review-builds.yml`; `:106-150` asserts `site-deploy.yml`. Files are selected
  with `.filter((file) => file.endsWith('.yml'))` (line 4).
- All Rust jobs use `dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable resolved 2026-08-09`
  with no `toolchain:` input; there is no `rust-toolchain.toml`.
- `apps/desktop/src-tauri/Cargo.toml:10` — `rust-version = "1.77.2"` (matches
  `tauri` 2.11.5 exactly; never exercised by CI).
- `README.md:61-62` — "Requirements: Bun 1.3.12, Rust/Cargo, Node.js 22.12 or
  newer for Astro, and the platform prerequisites for Tauri 2." No OS lists.
- Linux apt prerequisites duplicated in `quality.yml:51` and
  `review-builds.yml:44`:
  `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
- `docs/RELEASING.md:22-30` describes the quality workflow as desktop-only
  Chromium journeys and never mentions Windows tests.
- `plans/015-automate-builds-and-releases.md` "Current state" says quality runs
  Rust format/Clippy on macOS, Linux, and Windows — stale.

Conventions: every `uses:` must be a 40-char SHA with a trailing `# comment`
(policy enforced by `check-workflows.ts:10-14`); `permissions: contents: read`
at top level; `step-security/harden-runner` first step; `Swatinem/rust-cache`
for Cargo; `timeout-minutes` and `concurrency` on every workflow.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Workflow policy | `bun scripts/check-workflows.ts` | prints "verified N workflow files ..." |
| Rust gate (local host) | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Toolchain check | `rustc --version` | matches the pinned channel |
| Trigger the new workflow | `gh workflow run portability.yml` (only if the operator authorizes CI runs) | run visible in `gh run list --workflow=portability.yml` |

## Scope

**In scope**:
- `.github/workflows/portability.yml` (create)
- `scripts/check-workflows.ts` (register the new workflow; accept `.yaml` too)
- `rust-toolchain.toml` at `apps/desktop/src-tauri/` (create)
- `.github/workflows/quality.yml`, `release.yml`, `review-builds.yml` (add `toolchain:` input only)
- `README.md`, `plans/LAUNCH.md` (prerequisites section), `docs/RELEASING.md`,
  `docs/TESTING.md`, `docs/platform-support.md` (describe the gate)
- `plans/015-automate-builds-and-releases.md` and `plans/014-close-rapid-capture-quality-gaps.md` — only the one stale sentence each about the CI matrix (add "(restored by Plan 022)")

**Out of scope**:
- Any Rust source (Plan 021 owns the code fixes; if the Windows job fails on
  something 021 missed, record it and STOP).
- Signing, bundling, releases (Plans 015 and 024).
- Playwright/WebKit CI (deliberately kept out of routine CI by policy).

## Git workflow

- Branch: `codex/022-three-os-rust-gate`
- Commit message: `ci: restore the three-os rust verification gate`
- Do NOT push, dispatch, or open a PR unless the operator instructed it.

## Steps

### Step 0: Have the operator inspect the red `Quality` runs on `main`

The last three `Quality` runs on `main` failed within seconds. This plan cannot
read their job logs. Ask the operator to open
`https://github.com/SimonHazard/Charon/actions/workflows/quality.yml`, record
the failing step (likely candidates: Actions minutes/spending limit on the
private repo, an action resolving no toolchain, or runner provisioning), and
fix or note it. **STOP if the cause is a repo-level setting you cannot change**;
continue with the steps below in either case because they are independent.

### Step 1: Pin the Rust toolchain

Create `apps/desktop/src-tauri/rust-toolchain.toml`:

```toml
[toolchain]
channel = "<current stable, e.g. 1.91.0 — read `rustc --version` and use exactly that>"
components = ["rustfmt", "clippy"]
```

Add `with: toolchain: <same version>` to every `dtolnay/rust-toolchain` step in
`quality.yml`, `release.yml` (both jobs), and `review-builds.yml`, keeping the
existing SHA and comment. Do not change `rust-version` in `Cargo.toml`.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` still passes locally; `grep -c "toolchain:" .github/workflows/*.yml` → 4 (quality 1, release 2, review-builds 1).

### Step 2: Create `.github/workflows/portability.yml`

```yaml
name: Portability

on:
  pull_request:
    paths:
      - '.github/workflows/portability.yml'
      - 'apps/desktop/src-tauri/**'
  push:
    branches: [main]
    paths:
      - '.github/workflows/portability.yml'
      - 'apps/desktop/src-tauri/**'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: portability-${{ github.ref }}
  cancel-in-progress: true

jobs:
  rust:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-15, windows-2025]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: step-security/harden-runner@b09bb98e06d4d774595224525879c09bc6e98c40 # v2.20.1
        with:
          egress-policy: audit
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable resolved 2026-08-09
        with:
          toolchain: <same version as Step 1>
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2
        with:
          workspaces: apps/desktop/src-tauri
      - run: cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
      - run: cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings
      - run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Ubuntu is intentionally not in this matrix because `quality.yml` already runs
the identical Rust steps on `ubuntu-24.04`; state that in a YAML comment. Note
that `harden-runner` does not support Windows runners in every version — if the
step fails on `windows-2025`, condition it with `if: runner.os != 'Windows'`
and record the reason in the file.

**Verify**: `bun scripts/check-workflows.ts` → passes (the SHA/permission checks apply to the new file automatically).

### Step 3: Register the new workflow in the policy script

In `scripts/check-workflows.ts`:

1. Change line 4 to accept both extensions:
   `.filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))`.
2. After the `review-builds.yml` block, add a `portability.yml` block that
   fails when the file is missing and asserts these fragments:
   `matrix:`, `os: [macos-15, windows-2025]`, `permissions:\n  contents: read`,
   `cancel-in-progress: true`, `timeout-minutes: 30`,
   `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings`,
   `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`.
3. Also assert `security.yml` exists (it is currently unregistered) with
   fragments `schedule:` and `permissions:\n  contents: read`.

Model the new block on `:85-104`.

**Verify**: `bun scripts/check-workflows.ts` → "verified 6 workflow files ..."; temporarily rename `portability.yml` and rerun → fails with the missing-file message; restore.

### Step 4: Document prerequisites and the gate

- `README.md` "Develop": add a short "Platform prerequisites" list — macOS:
  Xcode Command Line Tools; Linux (Debian/Ubuntu): the exact apt list from
  `quality.yml:51`; Windows: Microsoft C++ Build Tools (MSVC), WebView2 Runtime
  (preinstalled on Windows 11), and Rust `x86_64-pc-windows-msvc`. Link to
  <https://v2.tauri.app/start/prerequisites/>.
- `plans/LAUNCH.md` "Prerequisites": same list or a link to the README section.
- `docs/RELEASING.md` (near lines 22-30): one paragraph — `Portability` runs
  fmt/Clippy/tests on macOS and Windows for every `src-tauri` change; `Quality`
  covers Linux; none of this is release evidence for a platform.
- `docs/TESTING.md` "Local gates": mention that CI additionally runs the Rust
  suite on Windows and macOS.
- `docs/platform-support.md`: in the Linux/Windows rows, replace "Pinned Tauri
  implementation compiles" with "Rust core builds and its tests pass in CI on
  <OS> (Plan 022); physical evidence still required".
- Plans 014/015: fix the one stale sentence each about the CI matrix.

**Verify**: `grep -n "libwebkit2gtk-4.1-dev" README.md` → 1 match; `git diff --stat` shows only in-scope files.

### Step 5: First run and triage

If the operator authorizes it, dispatch the workflow (`gh workflow run
portability.yml`) or push the branch. If the Windows job fails:
- on a compile error or a test failure inside `apps/desktop/src-tauri/src` →
  STOP and report the exact test names (they belong to Plan 021 follow-up);
- on `harden-runner` incompatibility → apply the `if:` guard from Step 2;
- on a toolchain-resolution error → recheck Step 1's `toolchain:` input.

**Verify**: `gh run list --workflow=portability.yml --limit 1` → `success` on both matrix legs.

## Test plan

- `bun scripts/check-workflows.ts` passes and fails when the new workflow is
  removed (Step 3 verify).
- Both `Portability` matrix legs green once (Step 5).
- No Rust or JS test changes are expected.

## Done criteria

- [ ] `.github/workflows/portability.yml` exists with the macOS + Windows matrix and the three Cargo steps
- [ ] `apps/desktop/src-tauri/rust-toolchain.toml` pins an exact channel; every `dtolnay/rust-toolchain` step passes `toolchain:`
- [ ] `bun scripts/check-workflows.ts` exits 0 and now covers `portability.yml` and `security.yml`
- [ ] README/LAUNCH list Linux and Windows prerequisites
- [ ] `docs/RELEASING.md`, `docs/TESTING.md`, `docs/platform-support.md` describe the gate honestly (no platform support claim)
- [ ] One `Portability` run is green on both legs, or the failure is recorded in the status row with the exact test names
- [ ] `plans/README.md` status row for 022 updated

## STOP conditions

- `check-workflows.ts` fragments for `quality.yml` no longer match the live
  file (someone changed the routine gate).
- The Windows leg fails inside Rust source — that is Plan 021 territory; report
  the exact failing tests instead of editing Rust here.
- The operator has not authorized any CI run and Step 5 cannot be executed —
  finish Steps 1-4, mark the plan `AWAITING OPERATOR: first Portability run`.

## Maintenance notes

- Keep `Portability` limited to Cargo steps; JS/Playwright stay in `quality.yml`
  by policy (cost control).
- When the Rust toolchain is bumped, update `rust-toolchain.toml` and the four
  `toolchain:` inputs together; `check-workflows.ts` does not compare them —
  consider a small assertion if drift recurs.
- Plan 015 should reuse this matrix shape for release builds instead of
  re-deriving it.
