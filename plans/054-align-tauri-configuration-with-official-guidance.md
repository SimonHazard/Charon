# Plan 054: Align the Tauri configuration with the official v2 guidance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src-tauri/capabilities/main.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/desktop/package.json apps/desktop/vite.config.ts apps/desktop/src/app/window-config.test.ts apps/desktop/src/app/theme-contract.test.ts .github/workflows/release.yml scripts/check-workflows.ts scripts/check-workflows.test.ts docs/platform-support.md docs/RELEASING.md && git status --short -- apps/desktop .github scripts docs`
> (without `..HEAD` the diff includes uncommitted edits). The signing PR (ADR
> 0018) and plans 038, 039 and 040 touch `tauri.conf.json`, the two config
> tests, `release.yml` and the checker; that is expected drift. Compare the
> "Current state" excerpts against the live code; any other mismatch is a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (release artifacts change)
- **Depends on**: the signing PR (ADR 0018); run before the `0.2.0` release
- **Category**: tech-debt (platform)
- **Planned at**: commit `242d51e`, 2026-09-23 (Tauri best-practice audit)

## Why this matters

An audit of Charon against the official Tauri v2 documentation found six
configuration gaps. None is a visible bug today, but together they widen the
webview's permissions beyond what the app uses, leave updater resources
unreleasable, ship larger binaries than necessary, raise the Linux glibc floor
to Ubuntu 24.04, and make Vite watch the multi-gigabyte Rust `target/`
directory. Each fix is a documented Tauri recommendation.

## Current state

- `apps/desktop/src-tauri/capabilities/main.json` grants
  `clipboard-manager:allow-write-text`, but no frontend code imports
  `@tauri-apps/plugin-clipboard-manager` or invokes `plugin:clipboard-manager|*`;
  the real write is the Rust command `clipboard_compose_and_write`
  (`src/clipboard/adapter.rs`). Its description also claims "explicit text
  clipboard writes". Guidance: expose only the permissions your commands need
  (<https://v2.tauri.app/learn/security/using-plugin-permissions/>), since
  capabilities limit a compromised frontend
  (<https://v2.tauri.app/security/capabilities/>).
- The same capability has no `core:resources:allow-close`, so
  `update.close()` in `src/features/updates/update-context.tsx` (~lines 89 and
  125, errors swallowed) is refused by the ACL and downloaded update bytes stay
  in memory until quit (<https://v2.tauri.app/reference/acl/core-permissions/>).
- Two tests pin the permission list: `src/app/window-config.test.ts:44-62`
  ("grants only the named webview permissions used by the shelf") and
  `src/app/theme-contract.test.ts:255-272` ("allows only explicit event,
  window lifecycle, clipboard, and release-link commands").
- `apps/desktop/src-tauri/Cargo.toml` has no `[profile.release]`
  (<https://v2.tauri.app/concept/size/> "Cargo Configuration"). Background
  threads are joined with `let _ = thread.join()`
  (`capture/platform/macos/listener.rs`, `workspace/watch.rs`,
  `ipc/capture.rs`), so `panic = "abort"` would turn a contained worker panic
  into an app crash: do not add it.
- `tauri.conf.json` `build` has no `removeUnusedCommands`
  (<https://v2.tauri.app/concept/size/> "Remove Unused Commands"; it strips only
  plugin commands no capability allows; Charon's own `ipc::*` commands stay).
- `apps/desktop/vite.config.ts` `server` block (`host`, `port`, `strictPort`)
  has no `watch.ignored` and the config has no `clearScreen: false`
  (<https://v2.tauri.app/start/frontend/vite/>).
- `apps/desktop/package.json:31` depends on `@tauri-apps/plugin-dialog`, but
  `grep -rn "plugin-dialog" apps/desktop/src` finds nothing: the picker runs in
  Rust (`ipc/workspace.rs`, `app.dialog()`).
- `.github/workflows/release.yml` builds Linux artifacts on `os: ubuntu-24.04`.
  The deb, rpm and AppImage guides advise building on the oldest base you
  support, naming Ubuntu 22.04 / Debian 12
  (<https://v2.tauri.app/distribute/debian/> "Limitations"), and the official
  GitHub pipeline example uses `ubuntu-22.04`
  (<https://v2.tauri.app/distribute/pipelines/github/>). `scripts/check-workflows.ts`
  requires the fragment `'ubuntu-24.04'` (other jobs keep it).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Config tests | `bun run --cwd apps/desktop test -- src/app` | pass |
| Workflows | `bun test scripts/check-workflows.test.ts && bun run check:workflows` | pass |
| Full | `bun run check` | exit 0 |
| Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Release build (macOS) | `bun run --cwd apps/desktop tauri:build -- --bundles app` | exit 0 |

## Scope

**In scope**: files in the drift-check list, plus `bun.lock` regenerated by
`bun remove`.

**Out of scope**: the isolation pattern and command-level ACLs (Plan 055),
updater installer-specific keys for deb/rpm/MSI (README "Direction"), code
signing (ADR 0018), any runtime behaviour change.

## Git workflow

- Branch: `codex/054-align-tauri-configuration`
- Commits: `fix(desktop): grant only the webview permissions in use`,
  `perf(desktop): add a size-focused release profile and strip unused plugin commands`,
  `ci(release): build Linux artifacts on ubuntu-22.04`,
  `chore(desktop): align the Vite dev server with Tauri guidance`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capabilities

In `main.json`, remove `clipboard-manager:allow-write-text`, add
`core:resources:allow-close`, and change the description to "Named event,
window lifecycle and resource permissions; Workspace, Attachment picking,
clipboard and capture use custom Rust commands". Update both pinned lists and
the `theme-contract.test.ts` test title ("…window lifecycle, resource, and
release-link commands"). Keep the Rust clipboard plugin registered: the Rust
command uses it.

**Verify**: `bun run --cwd apps/desktop test -- src/app` → pass.

### Step 2: Unused JS plugin

`cd apps/desktop && bun remove @tauri-apps/plugin-dialog` (never hand-edit
`bun.lock`).

**Verify**: `grep -rn "plugin-dialog" apps/desktop/src apps/desktop/package.json` → nothing; `bun run check` → exit 0.

### Step 3: Size

`Cargo.toml`:

```toml
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

`tauri.conf.json` `build`: `"removeUnusedCommands": true`; add an assertion to
`window-config.test.ts`. Record `Charon.app` size before and after a local
release build in the commit body.

**Verify**: macOS release build → exit 0; `cargo test … --locked` → pass.

### Step 4: Linux build base

In `release.yml`, change only the Linux build matrix entry to
`os: ubuntu-22.04` (detect, gate and publish stay on 24.04). After the Linux
build, add a step that fails if the highest `GLIBC_` symbol version needed by
`apps/desktop/src-tauri/target/release/Charon` is above 2.35:
`objdump -T … | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1`. Add the fragment
`os: ubuntu-22.04\n            artifact: linux-x86_64` to `check-workflows.ts`
and a regression test that rejects `ubuntu-24.04` for that entry. State the
baseline in `docs/platform-support.md` ("Linux packages need glibc 2.35 or
newer: Ubuntu 22.04, Debian 12 and later") and `docs/RELEASING.md`.

**Verify**: `bun test scripts/check-workflows.test.ts && bun run check:workflows` → pass.

### Step 5: Vite dev settings

`vite.config.ts`: `clearScreen: false` at the top level and
`server.watch.ignored: ['**/src-tauri/**']`.

**Verify**: `bun run dev:desktop` starts and serves `http://127.0.0.1:1420/?fixture=demo`; stop it.

### Step 6: Native smoke (operator test list)

With `bun run tauri:dev` on macOS: drag the window, double-click the drag
region, open and close Preferences, open "Open GitHub Releases" from an
unsupported-install message if reachable, copy a Note, capture with the
composer shortcut. If `removeUnusedCommands` broke any of these, the
developer console shows "not allowed" errors. Delete
`apps/desktop/src-tauri/target/debug` afterwards.

## Test plan

- Updated capability pins, a `removeUnusedCommands` assertion, one new
  workflow regression test, and the release build.

## Done criteria

- [ ] `bun run check` exits 0; Rust tests pass; workflow tests pass
- [ ] `grep -n "clipboard-manager" apps/desktop/src-tauri/capabilities/main.json` → nothing; `grep -n "core:resources:allow-close" …` → one
- [ ] `grep -n "profile.release" apps/desktop/src-tauri/Cargo.toml` → one
- [ ] `grep -n "ubuntu-22.04" .github/workflows/release.yml` → one
- [ ] Step 6 recorded (or deferred to the batch operator test)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `libwebkit2gtk-4.1-dev` or another prerequisite is unavailable on
  `ubuntu-22.04`: report; do not add third-party apt sources.
- A native smoke action fails with an ACL "not allowed" error after
  `removeUnusedCommands`: remove that setting only and report.
- The release build takes more than 30 minutes on a hosted runner with the
  new profile: report the time; do not lower the timeout budget silently.

## Maintenance notes

- New JS plugin calls need their permission in `main.json` and in both pinned
  lists, or `removeUnusedCommands` strips them.
