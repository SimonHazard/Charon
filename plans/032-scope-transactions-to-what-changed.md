# Plan 032: Scope Workspace transactions to what changed, and move IPC work off the main thread

> **Executor instructions**: This is a design-first plan. Follow it in order:
> Steps 1-4 are safe, independent improvements; Step 5 is the large change and
> must not start until Step 1's characterization tests are green. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/src/ipc apps/desktop/src-tauri/tests apps/desktop/src/app/workspace-context.tsx apps/desktop/src/lib/ipc/workspace-client.ts docs/ARCHITECTURE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (P1 for Steps 1-3, which are cheap and immediately felt)
- **Effort**: L (Step 5), S for each of Steps 1-4
- **Risk**: HIGH for Step 5 (crash-recovery invariants); LOW for Steps 1-4
- **Depends on**: `plans/025-open-unhealthy-workspaces-and-fix-migration-guard.md` (shares `mod.rs`/`recovery.rs`; land 025 first)
- **Category**: perf / correctness
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Reading `recovery.rs` shows that **every** command — including each 650 ms
autosave while typing — does the following, regardless of what changed:

- `commit_with_hook` calls `current_attachment_bytes` for the previous *and*
  the next manifest, loading every attachment in the Workspace into memory
  (`recovery.rs:95-97`, `:392-409`);
- staging writes `previous/` and `next/` copies of every Note body and every
  attachment blob into `backups/<tx>/`, each with `write_synced` (fsync)
  (`recovery.rs:107-131`);
- `apply_state` rewrites and renames **every** Note `.md` and **every**
  attachment file in the target manifest (`recovery.rs:275-317`), then removes
  the backup tree.

Cost is O(total Workspace bytes) per command with thousands of fsyncs; a
Workspace with a few hundred MB of attachments makes each keystroke-autosave
copy all of it twice. Attachment import buffers up to 20×100 MiB in memory
(`mod.rs:483-513`), then `current_attachment_bytes` clones it. All of this
runs on the **main thread**: every workspace/clipboard/preferences command is a
synchronous `#[tauri::command] pub fn` (only `workspace_choose_directory` is
`async`), and Tauri 2 runs non-async commands on the main thread — the window
stops painting during a large import or open. The same design multiplies
Windows sharing-violation exposure (many renames per command) and Linux inotify
traffic (every commit rewrites every file under the watched root).

Related smaller defects: events queued by `reconcile_external_changes` are
dropped when the command then fails (`with_workspace` only emits on `Ok`);
`events` is unbounded and each holds a full snapshot; the watcher's batch
channel is unbounded and only drained on IPC calls; subdirectory fsyncs are
missing after renames into `attachments/<note>/`, `backups/<tx>/{previous,next}/`,
and `backups/migration-v1-v2/notes/`; each command ships the full snapshot
twice (command result + `workspace://changed` event).

## Current state

- `apps/desktop/src-tauri/src/workspace/recovery.rs` — `commit_with_hook`
  (`:78-180`), `TransactionRecord { transaction_id, previous_revision, next_revision, state }`
  (`:23-28`), `write_manifest_copy`/`write_body_copies`/`write_attachment_copies`
  (`:410-490`), `write_record` (`:510-522`), `apply_state` (`:268-340`),
  `recover_incomplete` (`:190-240`, decides by comparing the on-disk manifest to
  `previous`/`next` copies), `replace_manifest` (`:253-264`, the commit point).
- `apps/desktop/src-tauri/src/workspace/mod.rs` — `execute` (`:97-165`),
  `prepare_attachment_import` (`:478-513`), `reconcile_external_changes`
  (`:271-412`), `events: Vec<WorkspaceChangedEvent>` (`:43`, `take_events` `:189`).
- `apps/desktop/src-tauri/src/workspace/watch.rs:21` unbounded `mpsc::channel`
  for batches; `drain()` only from reconcile.
- `apps/desktop/src-tauri/src/ipc/workspace.rs` — sync commands at `:47,59,71,84,99,111,123,136,148`;
  `with_workspace` (`:266-281`) emits nothing on `Err`; `emit_pending` (`:320-324`).
  `ipc/clipboard.rs:12` and `ipc/preferences.rs:35,40,52` also sync.
- `apps/desktop/src-tauri/tests/workspace_contract.rs` — real-FS contract tests
  incl. `every_interrupted_phase_recovers_to_one_complete_revision` (grep the
  name; it is the safety net for Step 5). No test constructs a `Workspace`
  with `start_watching()` and a command together (`grep start_watching` →
  only `ipc/workspace.rs:167`).
- Frontend: `apps/desktop/src/app/workspace-context.tsx:93-135` applies the
  command result snapshot and also listens on `workspace://changed`
  (`:243-253`); both carry full snapshots.
- `docs/ARCHITECTURE.md` "Workspace layout and durability": "A multi-file
  command is one Workspace transaction with enough recovery information to
  finish or roll back after interruption"; permanent-delete cleanup guarantee.

Conventions: keep the manifest rename as the single commit point; keep
`FailingWorkspaceStorage`/`StorageFailure` and `MigrationFailure` fault
injection working; every new file operation goes through `WorkspaceStorage`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Clippy/fmt | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` | exit 0 |
| Interruption matrix only | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --test workspace_contract` | pass |
| Frontend (Step 6) | `bun run typecheck && bun run test:desktop` | pass |
| Native (Step 2) | `bun run tauri:dev` | UI stays responsive during a 50 MB attachment import |

## Scope

**In scope**:
- `apps/desktop/src-tauri/src/workspace/{recovery.rs,mod.rs,watch.rs,command.rs,storage.rs}`
- `apps/desktop/src-tauri/src/ipc/{workspace.rs,clipboard.rs,preferences.rs,capture.rs}` (async attribute + emit-on-error)
- `apps/desktop/src-tauri/tests/*.rs` (new `workspace_watch_contract.rs`, extended interruption tests)
- `apps/desktop/src/app/workspace-context.tsx`, `apps/desktop/src/lib/ipc/workspace-client.ts` (Step 6 only)
- `docs/ARCHITECTURE.md` (transaction description)

**Out of scope**:
- Portability fixes (Plan 021), open robustness (Plan 025), attachment picker
  provenance (Plan 027 Step 6).
- Changing the on-disk Workspace layout or schema version.
- A body-less list projection (recorded as follow-up).

## Git workflow

- Branch: `codex/032-scoped-transactions`
- Commit per step, messages: `test(workspace): characterize watcher and command interplay`, `perf(ipc): run workspace commands off the main thread`, `fix(workspace): fsync renamed subdirectories and emit events on error`, `perf(workspace): stage and apply only changed files per transaction`, `perf(ipc): stop double-shipping snapshots`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterization tests for watcher + command interplay (safety net)

Create `apps/desktop/src-tauri/tests/workspace_watch_contract.rs` with a
helper that creates a real temp Workspace, calls `start_watching()`, and
polls `snapshot()` with a bounded loop (like `watch.rs:187-196`, ≥2 s deadline,
explicit panic on timeout). Cover: (a) a command's own writes do not advance
the revision on the next `snapshot()`; (b) an external body edit advances it
exactly once and `take_events()` yields one event; (c) a stray `notes/x.md`
yields `ImportCandidate` and is not adopted; (d) deleting a known body yields
`MissingNote` and the last snapshot survives; (e) an external edit racing an
in-flight `execute` yields `StaleRevision` on the stale command. Also add a
test asserting the current byte-cost baseline for later comparison: count
files under `backups/` created during one `SetNoteStatus` on a 3-note, 2-
attachment Workspace (use `FailingWorkspaceStorage::Sync` hook or a listing
right after staging via `open_with_storage_failure(..., StorageFailure::Manifest)`
so the transaction stays on disk).

**Verify**: `cargo test ... --locked --test workspace_watch_contract` → pass (all new tests green against current code).

### Step 2: Run IPC commands off the main thread

Mark every `#[tauri::command]` in `ipc/workspace.rs`, `ipc/clipboard.rs`,
`ipc/preferences.rs`, and `ipc/capture.rs` (except those already `async`) as
`#[tauri::command(async)]`, keeping the bodies synchronous (no `.await` while a
`std::sync::MutexGuard` is held — the compiler enforces this since the guard is
not `Send`). Confirm `AppHandle`/`State` usage compiles. Keep the existing test
`workspace_chooser_remains_async_for_the_native_dialog_event_loop`.

**Verify**: `cargo clippy ... -D warnings && cargo test ... --locked` → pass; native: import a ~50 MB file while moving the window — it keeps repainting.

### Step 3: Small durability and event fixes

- `recovery.rs`: after the attachment renames for a note, `sync_dir(&format!("attachments/{}", note.id))`;
  at the end of staging, `sync_dir` each `{tx}/previous`, `{tx}/next`, and their
  `attachments` subdirs; `migration.rs::stage_original`: `sync_dir(&format!("{MIGRATION_DIR}/notes"))`.
- `ipc/workspace.rs::with_workspace`: emit pending events after the closure
  **regardless** of `Ok`/`Err` (restructure to capture the result, then
  `emit_pending`, then return). Do the same in `create_capture_note`'s
  `Ok(false)` path and in `ipc/clipboard.rs` after `resolve_request`.
- `mod.rs`: cap `events` to the newest entry (each holds a full snapshot; only
  the newest is useful) — `push` replaces.
- `watch.rs`: replace the unbounded batch channel with an
  `Arc<Mutex<BTreeSet<PathBuf>>>` plus an `overflow` flag (fold when the set
  exceeds, e.g., 10 000 paths → set overflow, clear the set); `drain()` returns
  the set and, when overflow was set, a sentinel that forces one full
  `load_state` pass in reconcile.

Add tests: events emitted on a `StaleRevision` failure (unit test in
`ipc/workspace.rs` using `Workspace::in_memory()` + a fake emitter if needed,
or assert `take_events()` is empty after `with_workspace`-style handling);
watcher overflow yields a full-reload marker.

**Verify**: `cargo test ... --locked` → pass, including Step 1 tests.

### Step 4: Bound attachment import memory

Change `prepare_attachment_import` to stream each source into a staged temp
file under `attachments/<note>/.charon-<tx>-<uuid>.tmp` (through a new
`WorkspaceStorage::copy_external_regular(source, relative_tmp)` that reuses
`read_external_regular`'s validation and size/mtime revalidation) and pass
staged **paths**, not bytes, to the transaction; `apply_state` renames the
staged file into place. Keep `in_memory_with_attachment_sources` working by
having the memory storage implement `copy_external_regular`. Enforce an
aggregate per-command byte budget (sum of source sizes ≤ 20 × 100 MiB is the
theoretical max; add a `MAX_IMPORT_BATCH_BYTES` constant of e.g. 512 MiB and a
typed error) so a single command cannot exhaust memory or disk unnoticed.

**Verify**: `cargo test ... --locked` → pass (extend the attachment tests to assert no `Vec<u8>` of the full file is held: e.g. import a 100 MiB sparse file in a `#[ignore]`d test, or assert via the API shape); interruption tests still pass.

### Step 5: Stage and apply only the changed set (the large change)

Design (write it into `docs/ARCHITECTURE.md` before coding):

- `commit_with_hook` computes a `ChangeSet { bodies: Vec<note_id>, attachments_added: Vec<relative_path>, attachments_removed: Vec<relative_path>, notes_removed: Vec<note_id> }`
  by diffing previous vs next manifests/bodies.
- Staging writes `previous/` copies **only** for files in the change set that
  exist today, and `next/` copies only for files that will change; the
  `TransactionRecord` gains the change set (versioned field, `serde(default)`)
  so `recover_incomplete` knows exactly which files to finish or roll back.
  Files outside the change set are never touched by `apply_state`.
- `recover_incomplete` keeps deciding by comparing the on-disk manifest to
  `previous`/`next` manifest copies, then applies/rolls back only the recorded
  change set. Records written by older builds (no change set) must still
  recover: treat a missing change set as "full" (current behaviour).
- The permanent-delete guarantee is unchanged: deleted bodies/attachments are in
  the change set, their `previous/` copies are removed with the backup tree
  after commit, and `DeletionCleanupRequired` still triggers if that removal
  fails.
- Self-write suppression: cache the bytes of the last manifest this process
  wrote; in `reconcile_external_changes`, when only `charon.workspace.json`
  changed, compare bytes first and skip `load_state` when identical (content-
  based, so a genuine external manifest edit in the same window is still
  adopted).

Implement behind the Step 1 tests plus the existing
`every_interrupted_phase_recovers_to_one_complete_revision` matrix, extended
with per-command cases (status toggle, tag edit, body edit, attachment add,
attachment remove, delete) × each `TransactionState`/`StorageFailure` hook.
Then re-run the Step 1 byte-cost baseline test and assert the new count is
bounded by the change set (e.g. a status toggle stages ≤ 2 manifest copies + 0
bodies + 0 attachments).

**Verify**: `cargo test ... --locked` → all pass; the cost assertion proves the reduction; `cargo clippy -D warnings` → exit 0.

### Step 6: Stop shipping the snapshot twice

Tag `WorkspaceChangedEvent` with `origin: "command" | "external"` (ts-rs; run
`bun run bindings:generate`), emit only `external` events over
`workspace://changed`, and let the command result be the sole channel for a
command's own effect. Update `workspace-context.tsx` to keep applying command
results as today and events for external changes; keep the monotonic revision
guard. Adjust `test/workspace-fixture.ts`/tests accordingly.

**Verify**: `bun run bindings:check` → exit 0; `bun run typecheck && bun run test:desktop` → pass; Chromium e2e → pass; Step 1 test (b) still sees exactly one external event.

## Test plan

- Step 1: 5 watch/command tests + 1 cost baseline.
- Step 3: 2 tests. Step 4: attachment streaming tests. Step 5: extended
  interruption matrix (≥6 command kinds × existing hooks) + cost bound.
- Step 6: frontend event tests.

## Done criteria

- [ ] `tests/workspace_watch_contract.rs` exists and passes
- [ ] All workspace/clipboard/preferences/capture commands are `async` (or `command(async)`); native responsiveness confirmed
- [ ] Subdirectory fsyncs added; events emitted on error paths; `events` bounded; watcher batches bounded
- [ ] Attachment import streams to staged files; batch byte budget enforced
- [ ] Transactions stage/apply only the change set; recovery converges for old and new records; cost assertion passes
- [ ] `workspace://changed` carries only external changes; frontend still converges
- [ ] `docs/ARCHITECTURE.md` describes the change-set transaction
- [ ] All Cargo gates and `bun run bindings:check`, `bun run typecheck`, `bun run test:desktop`, Chromium e2e pass
- [ ] `plans/README.md` status row for 032 updated

## STOP conditions

- Any existing interruption/recovery test fails at Step 5 and you cannot
  explain the exact sequence — stop; do not adjust the assertion.
- Making a command `async` requires holding a `MutexGuard` across an await
  (compile error `Send`) — restructure to drop the guard first; if impossible,
  leave that command sync and report.
- The `TransactionRecord` versioning cannot stay backward-compatible with
  records already on disk (older builds) — stop and report; recovery of an old
  record must never lose data.

## Maintenance notes

- After this plan, the remaining per-command cost is validation passes
  (`validate` runs 4-5× per command); measure before removing any — it is
  defense-in-depth on the persistence boundary.
- Follow-up: a body-less snapshot projection for list rendering (bodies on
  demand) — coordinate with Plan 031's search index.
- Plan 021's Windows retry-around-rename concern shrinks a lot once commits
  touch only changed files; revisit a bounded retry only if Windows evidence
  shows sharing violations.
