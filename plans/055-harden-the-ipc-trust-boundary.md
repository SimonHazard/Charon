# Plan 055: Harden the IPC trust boundary — command ACLs, a Workspace folder token, and an IPC argument contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src-tauri/build.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc/workspace.rs apps/desktop/src-tauri/capabilities/main.json apps/desktop/src/lib/ipc apps/desktop/src/app/workspace-context.tsx apps/desktop/src/app/window-config.test.ts apps/desktop/src/app/theme-contract.test.ts apps/desktop/src/bindings scripts/check-ipc-commands.ts docs/ARCHITECTURE.md && git status --short -- apps/desktop scripts docs`
> (without `..HEAD` the diff includes uncommitted edits). Plans 039, 045 and
> 054 touch `lib.rs`, the capability and its pinned tests; that is expected
> drift. Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition.

## Status

- **Priority**: P3 (defence in depth; no known exploit)
- **Effort**: M
- **Risk**: MED (IPC contract and bindings change)
- **Depends on**: 054 (capability file), 045 (capture IPC changes)
- **Category**: security
- **Planned at**: commit `242d51e`, 2026-09-23 (Tauri best-practice audit)

## Why this matters

Tauri's security model treats the webview as less trusted than Rust: data
crossing the boundary must be strictly defined and checked
(<https://v2.tauri.app/security/> "Trust Boundaries"), and by default every
registered custom command is callable from every window unless the app
manifest scopes it (<https://v2.tauri.app/security/capabilities/>). Charon's
14 custom commands are all implicitly allowed, and `workspace_open_or_create`
opens or creates a Workspace at any path string React sends, while
Attachments already use short-lived opaque tokens. Nothing checks the
argument names the TypeScript clients send to Rust
(<https://v2.tauri.app/develop/tests/mocking/> "IPC Requests").

## Current state

- `apps/desktop/src-tauri/build.rs`: `fn main() { tauri_build::build() }`.
- `apps/desktop/src-tauri/src/lib.rs:30-45` registers the 14 commands in
  `tauri::generate_handler![…]`.
- `apps/desktop/src-tauri/src/ipc/workspace.rs`:
  - `workspace_choose_directory` (~line 45) returns `Option<String>` (the raw
    picked path) to React;
  - `workspace_open_or_create(app, path: String, runtime)` (~line 135) calls
    `open_or_create_workspace(&PathBuf::from(path))` and remembers it;
  - `register_attachment_sources` / `consume_attachment_sources` (~lines
    86-131) implement single-use UUID tokens with a TTL
    (`ATTACHMENT_SOURCE_TTL`) — the pattern to reuse.
- `apps/desktop/src/lib/ipc/workspace-client.ts:29-31`:
  `chooseDirectory: () => invoke<string | null>('workspace_choose_directory')`,
  `openOrCreate: (path) => invoke<WorkspaceSnapshot>('workspace_open_or_create', { path })`.
- `scripts/check-ipc-commands.ts` compares command names only.
- AGENTS.md: React never reads or writes Workspace files directly; Rust owns
  the Workspace boundary; no compatibility abstractions or wrapper layers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Bindings | `bun run bindings:generate && bun run bindings:check && bun run ipc:check` | exit 0 |
| Unit | `bun run --cwd apps/desktop test` | pass |
| Full | `bun run check` | exit 0 |

## Scope

**In scope**: files in the drift-check list, plus
`apps/desktop/src/lib/ipc/ipc-contract.test.ts` (new).

**Out of scope**: the isolation pattern (README "Direction"), plugin
permissions (Plan 054), Workspace storage semantics.

## Git workflow

- Branch: `codex/055-harden-ipc-boundary`
- Commits: `fix(desktop): scope custom commands through the app manifest`,
  `fix(workspace): open a picked folder only through a single-use token`,
  `test(ipc): pin command argument names`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: App manifest command ACL

`build.rs`: `tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[/* the 14 names from generate_handler! */])))`.
Add the generated `allow-<command>` identifiers to `main.json` and to both
pinned permission lists. Extend `window-config.test.ts` to assert the
`allow-*` set equals the `generate_handler!` names (read `lib.rs` like
`scripts/check-ipc-commands.ts` does).

**Verify**: `cargo test … --locked` → pass; `bun run --cwd apps/desktop test -- src/app` → pass.

### Step 2: Workspace folder token

`workspace_choose_directory` registers the picked folder under a single-use
token (reuse the Attachment token map and TTL, or a sibling map with the same
helpers) and returns `{ token, displayName }` (display name only, never the
full path) — or `null` when cancelled. `workspace_open_or_create` accepts
`{ token }` only and rejects an unknown or expired token with the existing
`InvalidPath` error. Regenerate bindings; update `workspace-client.ts` and its
callers in `workspace-context.tsx`. `workspace_bootstrap_default` is unchanged.

**Verify**: new Rust tests: a token opens the folder once, a reused or expired
token fails, a raw path is rejected by the type; bindings commands → exit 0.

### Step 3: IPC argument contract

New `src/lib/ipc/ipc-contract.test.ts` using `mockIPC` and `clearMocks` from
`@tauri-apps/api/mocks`: for every client method, assert the command name and
the exact argument keys sent (`{ command }`, `{ request }`, `{ permission }`,
`{ token }`, …).

**Verify**: `bun run --cwd apps/desktop test -- src/lib/ipc` → pass.

### Step 4: Contract

`docs/ARCHITECTURE.md`: one sentence each for the command ACL and the folder
token.

**Verify**: `bun run check` → exit 0.

## Test plan

- Command ACL equality test, Rust token tests, IPC argument contract test.
- Native smoke (batch operator test): choose another notes folder in
  Preferences and reopen Charon; it opens the chosen folder.

## Done criteria

- [ ] `bun run check` exits 0; Rust tests pass; bindings checks pass
- [ ] `grep -n "path: String" apps/desktop/src-tauri/src/ipc/workspace.rs` → no `workspace_open_or_create` match
- [ ] `apps/desktop/src/lib/ipc/ipc-contract.test.ts` exists and passes
- [ ] `plans/README.md` status row updated

## STOP conditions

- `tauri_build::AppManifest::commands` is unavailable in the pinned
  `tauri-build`: report the version and the actual API.
- The Preferences folder flow needs the full path in React for display or
  memory: report which surface and why, rather than returning the path.

## Maintenance notes

- Every new custom command must be added to `generate_handler!`, the app
  manifest list and the capability; the equality test enforces it.
