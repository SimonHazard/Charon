# Plan 003: Build the deep local Workspace module and typed IPC boundary

> **Executor instructions**: Follow every step and verification gate. Stop on
> any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: because planning happened before the first commit,
> run `git status --short` and inspect `apps/desktop/src-tauri/src`,
> `apps/desktop/src/bindings`, and the
> Tauri capability files. They should contain only the Plan 002 smoke scaffold.
> If domain or filesystem code already exists, stop and reconcile it with the
> Current state and ADR 0001 before editing.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/002-scaffold-pinned-desktop-toolchain.md`
- **Category**: direction, migration, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

Local files are the product's trust boundary. A shallow set of filesystem
wrappers would scatter validation, ordering, recovery, and conflict rules across
Tauri commands and React. One deep Workspace module makes those invariants
testable, keeps the UI unprivileged, and gives external Markdown edits a safe,
predictable reconciliation path.

## Current state

- ADR 0001 defines Rust as the only filesystem and domain mutation authority.
- Plan 002 has a minimal Tauri shell and typed frontend, but no workspace schema,
  commands, watcher, recovery, or generated IPC types.
- Canonical workspace layout is:

  ```text
  <workspace>/
    charon.workspace.json
    notes/<note-uuid>.md
    backups/<transaction-id>/...
  ```

- Note Markdown is user content. Metadata lives in the manifest so arbitrary
  Markdown remains valid and portable.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust format | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` | exit 0 |
| Rust lint | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace` | all Workspace tests pass |
| Type generation | `bun run bindings:check` | generated TS is current, exit 0 |
| Frontend typecheck | `bun run typecheck` | exit 0 |
| Full check | `bun run check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |

## Suggested executor toolkit

- Use `improve-codebase-architecture` to preserve a deep module rather than
  adding entity repositories or one-file command wrappers.
- Review `docs/ARCHITECTURE.md` and `docs/adr/0001-local-workspace.md` before
  coding.

## Scope

**In scope**:

- `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/workspace/mod.rs`
- `apps/desktop/src-tauri/src/workspace/model.rs`
- `apps/desktop/src-tauri/src/workspace/command.rs`
- `apps/desktop/src-tauri/src/workspace/storage.rs`
- `apps/desktop/src-tauri/src/workspace/recovery.rs`
- `apps/desktop/src-tauri/src/workspace/watch.rs`
- `apps/desktop/src-tauri/src/workspace/error.rs`
- `apps/desktop/src-tauri/src/ipc/mod.rs`,
  `apps/desktop/src-tauri/src/ipc/workspace.rs`
- `apps/desktop/src-tauri/tests/workspace_contract.rs`
- `apps/desktop/src/bindings/workspace.ts` (generated)
- `scripts/check-bindings.ts`
- `package.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `docs/ARCHITECTURE.md` and ADR 0001 only for implementation clarifications

**Out of scope**:

- React note UI, quick capture, clipboard formatting, shortcuts, charts,
  settings UI, sync, encryption, collaborative editing, and arbitrary external
  directories outside the user-selected Workspace.
- Generic `Repository<T>`, `Service<T>`, or frontend filesystem APIs.

## Git workflow

- Branch: `codex/003-workspace-core`
- Commits: `feat(core): add workspace domain`,
  `feat(core): add atomic workspace storage`,
  `feat(ipc): expose typed workspace commands`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define persisted and IPC models separately

In `model.rs`, define private persisted schema v1 and public DTOs. Use UUID v4
strings, RFC 3339 UTC timestamps, integer sort keys, `open|done` status, and
nullable `completedAt`/`trashedAt`. The manifest contains `schemaVersion`,
`workspaceId`, `revision`, `sections`, and note metadata. Each note body is read
from `notes/<id>.md` and appears only in `WorkspaceSnapshot`/`NoteDto`.

Represent domain commands as one tagged `WorkspaceCommand` enum with create,
rename/reorder/delete section; create/update/move/reorder/set-status/trash/
restore/permanently-delete note; merge notes; and batch variants. Every mutating
command includes `expectedRevision`. Use `ts-rs` derives for public DTOs and
commands, not persisted structs.

Define `WorkspaceError` variants for invalid path, invalid manifest, unsupported
schema, validation, stale revision conflict, I/O, recovery required, and not
found. Map them to stable IPC error codes plus localized-message keys, never raw
filesystem details intended for UI display.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::model` -> serialization round trips and invalid-domain cases pass.

### Step 2: Implement one deep Workspace interface

In `workspace/mod.rs`, expose only the application operations needed by IPC:
create/open a directory, return a snapshot, execute a `WorkspaceCommand`, start
or stop watching, and report health. Keep parsing, file paths, validation,
transaction planning, migrations, and reconciliation private.

Add two storage adapters in `storage.rs`:

- `RealWorkspaceStorage` for production, rooted at one canonicalized directory.
- `MemoryWorkspaceStorage` for deterministic unit tests.

The storage abstraction exists only to test the complete Workspace behavior. Do
not expose per-entity repositories. Reject `..`, symlink escapes, mismatched note
IDs/filenames, duplicate IDs, missing sections, invalid timestamps, and oversized
manifest/note payloads. Set documented v1 limits, for example 10 MiB per note
and 100,000 active notes, and test the boundary values.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::command` -> happy paths and all validation failures pass for the memory adapter.

### Step 3: Make multi-file commands crash recoverable

In `recovery.rs`, implement a transaction protocol under
`backups/<transaction-id>/`:

1. Validate the full command and build the next manifest in memory.
2. Write staged note bodies and a transaction record, flush files, and fsync the
   transaction directory where supported.
3. Rename note files into place.
4. Write and atomically rename `charon.workspace.json` last.
5. Mark the transaction committed, then retain a bounded recovery backup.

On open, inspect incomplete transactions and deterministically roll forward or
restore the previous manifest. Never guess when both sides are corrupt; return
`recovery_required` with the backup location. Prune backups by count and age
only after a successful commit. Merge, batch completion, batch trash, undo, and
permanent deletion must all use the same transaction path.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::recovery` -> injected failures at every transaction phase recover to either the complete old or complete new revision, never a mixed snapshot.

### Step 4: Reconcile external file edits

Use `notify 8.2.0` behind `watch.rs`. Debounce bursts and ignore the module's own
transaction paths. A valid external edit to `notes/<id>.md` increments the
in-memory revision and emits one `workspace://changed` event. Manifest changes
are reparsed and fully validated before replacement. Unknown Markdown files are
reported as import candidates, not silently adopted. Deleted or corrupt known
files produce a health issue and keep the last valid snapshot until the user
chooses recovery.

Guarantee one watcher per open Workspace and shut it down before switching
directories or exiting. Tests use a temporary real directory because watcher
behavior cannot be proved by the memory adapter.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::watch` -> external edit, burst coalescing, self-write suppression, deletion, and shutdown tests pass without sleeps longer than a bounded poll timeout.

### Step 5: Expose a small typed Tauri boundary

Add Tauri commands in `ipc/workspace.rs`: choose directory, create, open,
snapshot, execute, close, and health. Store one synchronized Workspace runtime
in managed Tauri state. Keep command handlers thin: deserialize, call Workspace,
map error, emit snapshot/revision event.

Generate `apps/desktop/src/bindings/workspace.ts` from Rust DTOs in a deterministic test or
`xtask`-style command. Add `bindings:generate` and `bindings:check`; the latter
generates into a temporary directory and diffs without rewriting. React imports
only generated types and an app-owned IPC client added in a later plan.

Tighten `default.json`: the frontend gets dialog access only for choosing a
directory and no broad fs plugin scope. Custom commands remain the access path.

**Verify**: run Type generation, Frontend typecheck, Rust lint, and Rust tests from the command table -> all exit 0.

## Test plan

- Unit tests cover every command, stable ordering, timestamp/status invariants,
  batches, merge, undo payloads, schema version rejection, migrations, traversal,
  symlinks, payload limits, and stale-revision conflicts.
- Contract tests run the same command suite against memory and real storage.
- Failure-injection tests cover every transaction boundary.
- Watcher tests cover external modification, self-write suppression, invalid
  manifest, deletion, coalescing, and clean shutdown.
- IPC serialization snapshots prove Rust/TS tagged-union compatibility.
- Verification: Full check command exits 0 and `bindings:check` reports no diff.

## Done criteria

- [ ] Rust owns all workspace I/O and domain mutation.
- [ ] Manifest and note files remain human-readable and portable.
- [ ] Multi-file operations are recoverable across injected crashes.
- [ ] Stale revisions return a typed conflict instead of overwriting.
- [ ] External changes produce one validated event or a health issue.
- [ ] Generated TS types are current and checked in CI-ready scripts.
- [ ] No broad frontend filesystem capability or generic repository exists.
- [ ] All command, adapter, recovery, watcher, clippy, format, and type checks pass.
- [ ] This plan's row in `plans/README.md` is `DONE`.

## STOP conditions

- The selected filesystem cannot provide same-directory atomic rename for the
  manifest and no tested recovery protocol can compensate.
- A required command would allow a path outside the canonical Workspace root.
- Rust/TS generation requires an unstable Git dependency or TypeScript legacy
  compiler API.
- Watcher tests remain flaky after two bounded-event fixes.
- Implementing this plan appears to require React UI or platform shortcut code.

## Maintenance notes

- Review transaction ordering and path canonicalization as security-critical.
- Every future persisted-field change needs a migration fixture from every older
  schema version and a matching generated DTO review.
- Do not expose storage adapters through IPC; they are internal test seams.
