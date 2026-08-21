# Plan 025: Open unhealthy Workspaces with reported issues, and close two data-safety holes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/src/workspace/mod.rs apps/desktop/src-tauri/src/workspace/migration.rs apps/desktop/src-tauri/src/workspace/error.rs apps/desktop/src-tauri/src/ipc/workspace.rs apps/desktop/src-tauri/src/ipc/clipboard.rs apps/desktop/src-tauri/src/clipboard/error.rs apps/desktop/src-tauri/tests apps/desktop/src/app/workspace-context.tsx apps/desktop/src/features/notes/note-screen.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (open path and migration guard; every existing contract test must stay green)
- **Depends on**: none (independent of Plans 021-024; can run in parallel with them)
- **Category**: bug (correctness / data safety)
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Four defects, all confirmed by reading the code:

1. **A health issue locks the user out.** `ipc/workspace.rs::validate_candidate`
   refuses to open any Workspace whose `health.is_healthy` is false, and
   `load_state` marks the Workspace unhealthy for an `ImportCandidate` (any
   stray `.md` dropped into `notes/`) or a `MissingAttachment` (one attachment
   file deleted in Finder). Both are exactly the "contextual health issue"
   cases `docs/ARCHITECTURE.md` says must *not* block ("Invalid or deleted
   known files leave the last valid snapshot in place and create a contextual
   health issue; unknown Markdown remains an explicit import decision"). The
   domain layer opens fine (`tests/workspace_contract.rs` proves reopen with a
   missing attachment); only the IPC layer refuses. Result: dropping one file
   into the folder makes Charon unable to open the user's Notes at next launch,
   and the health UI that would explain it never renders.
2. **A missing or invalid Note file aborts `open`.** `load_state` `?`-propagates
   `storage.read("notes/<id>.md")` and body validation errors, so one lost file
   (sync conflict, manual delete while Charon is closed) makes the whole
   Workspace unopenable — even though `MissingNote`/`InvalidNote` health kinds
   exist and are handled by the reconcile path.
3. **Migration can delete a user-owned archive.** `migration.rs` only stops on
   an existing `legacy-trash-v1/` when there are trashed v1 Notes
   (`if !trashed.is_empty() && storage.exists(LEGACY_ARCHIVE)?`), and
   `rollback_staged_migration` deletes `legacy-trash-v1/` unconditionally. The
   architecture contract says an existing archive path stops migration before
   mutation and the archive is preserved forever.
4. **Copy collapses every Workspace error into "unavailable".**
   `impl From<WorkspaceIpcError> for ClipboardIpcError` discards the code, so a
   `stale_revision` on Copy (the one error Copy is expected to produce when the
   collection moved) reaches the UI as `workspace_unavailable` and the
   frontend's existing refetch-on-stale path never runs.

Bonus (tiny): when a permanent-Delete cleanup is blocked, `execute` returns
`DeletionCleanupRequired { transaction_id: "pending" }`, which the IPC layer
turns into a nonexistent `backups/pending` location, and `execute` never
retries the cleanup itself (only `snapshot`/`health` do).

## Current state

- `apps/desktop/src-tauri/src/ipc/workspace.rs:184-199`:
  ```rust
  fn validate_candidate(workspace: &mut Workspace) -> Result<WorkspaceSnapshot, WorkspaceIpcError> {
      let snapshot = workspace.snapshot()?;
      let health = workspace.health()?;
      if !health.is_healthy {
          return Err(crate::workspace::WorkspaceError::Validation(
              "candidate Workspace has unresolved health issues".to_owned(),
          ).into());
      }
      for note in &snapshot.notes { for attachment in &note.attachments {
          workspace.canonical_managed_path(&attachment.relative_path)?; } }
      Ok(snapshot)
  }
  ```
  Called from `replace_workspace` (`:162-182`), which every open path uses.
  `workspace_bootstrap` (`:71-81`) returns the remembered path's error with no
  fallback.
- `apps/desktop/src-tauri/src/workspace/mod.rs:575-630` — `load_state`:
  reads every body with `storage.read(&path)?`, rejects oversize/non-UTF-8 with
  `?`, then builds `issues` for `ImportCandidate` and `MissingAttachment`
  (`storage.read(&attachment.relative_path).is_err()` reads whole files) and
  returns `WorkspaceHealth { is_healthy: issues.is_empty(), ... }`.
- `mod.rs:97-106` — `execute` returns `DeletionCleanupRequired { transaction_id: "pending" }`
  when `self.cleanup_blocked`; `:142-147` sets `cleanup_blocked = true` after
  a `DeletionCleanupRequired` from `commit`; `snapshot()` (`:90-95`) and
  `health()` (`:183-187`) call `retry_cleanup_if_needed()`, `execute` does not.
- `apps/desktop/src-tauri/src/workspace/model.rs:130-137` —
  `WorkspaceHealthIssueKind { MissingNote, MissingAttachment, InvalidNote, InvalidManifest, ImportCandidate, RecoveryRequired }`.
- `apps/desktop/src-tauri/src/workspace/migration.rs:159-166` and `:268-286`
  (excerpts in "Why this matters"). `migration.json` is written at `:261-264`
  and never read.
- `apps/desktop/src-tauri/src/clipboard/error.rs:59-63`:
  ```rust
  impl From<WorkspaceIpcError> for ClipboardIpcError {
      fn from(_: WorkspaceIpcError) -> Self { ClipboardError::WorkspaceUnavailable.into() }
  }
  ```
  `ClipboardIpcError { code, message_key }` has no revision fields.
  `ipc/clipboard.rs:22-31` raises `StaleRevision` inside `resolve_request`.
- `apps/desktop/src/app/workspace-context.tsx:113-121` — the frontend refetches
  on `code === 'stale_revision'`; `note-screen.tsx` maps clipboard error codes
  to messages (`:118-125`).
- Tests: `tests/workspace_contract.rs` (real FS; e.g. `:196-206` reopen with a
  deleted attachment; `:570-591` archive collision with trashed notes),
  `mod.rs`/`recovery.rs`/`migration.rs` unit tests, `ipc/workspace.rs` tests
  (`:326-445`) using `Workspace::in_memory()`.

Conventions: typed `WorkspaceError` → content-free `WorkspaceIpcError`
(`code`, `message_key`, optional revisions/location); health issues carry
`message_key` strings from `messages/*.json` (`workspace_health_*`); tests use
`tempfile::tempdir()`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | all pass |
| Clippy/fmt | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` | exit 0 |
| Bindings | `bun run bindings:check` | exit 0 (required if any `#[derive(TS)]` type changes) |
| Frontend | `bun run typecheck && bun run test:desktop` | pass |

## Scope

**In scope**:
- `apps/desktop/src-tauri/src/ipc/workspace.rs` (`validate_candidate`, `workspace_bootstrap`)
- `apps/desktop/src-tauri/src/workspace/mod.rs` (`load_state`, `execute` cleanup retry, quarantine set)
- `apps/desktop/src-tauri/src/workspace/migration.rs` (guard + rollback)
- `apps/desktop/src-tauri/src/clipboard/error.rs`, `apps/desktop/src-tauri/src/ipc/clipboard.rs`
- `apps/desktop/src-tauri/tests/workspace_contract.rs`, `tests/clipboard_contract.rs`
- `apps/desktop/src/bindings/*.ts` only via `bun run bindings:generate` if a DTO changes
- `apps/desktop/src/features/notes/note-screen.tsx` — only if the clipboard error code mapping needs a `stale_revision` branch
- `apps/desktop/messages/en.json`, `fr.json` — only if a new `workspace_health_*` / clipboard message key is needed

**Out of scope**:
- Transaction/backup design (`recovery.rs`) — Plan 032.
- Any UI redesign of the health surface; reuse the existing health list.
- Portability fixes (Plan 021).

## Git workflow

- Branch: `codex/025-open-unhealthy-workspaces`
- Commit message: `fix(workspace): open workspaces with health issues and guard the legacy archive`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterize the lockout with failing tests

Add to `tests/workspace_contract.rs` (or `ipc/workspace.rs` tests) three
tests that currently **fail**:

- `open_reports_import_candidate_instead_of_refusing`: create a Workspace with
  one Note, drop `notes/stray.md`, then call the IPC-level open path
  (`replace_workspace` is private — call `validate_candidate` if it can be made
  `pub(crate)`, or test through `Workspace::open` + `health()` and assert the
  new blocking classification function from Step 2 returns "not blocking").
- `open_reports_missing_attachment_instead_of_refusing`: same with a deleted
  attachment file.
- `open_reports_missing_note_body`: delete `notes/<id>.md` for a known Note and
  assert `Workspace::open` succeeds, `health()` lists `MissingNote` for that id,
  and `snapshot()` still lists the Note (with an empty body placeholder — see
  Step 3).

**Verify**: `cargo test ... --locked open_reports` → the three tests fail for the expected reasons.

### Step 2: Classify blocking vs reportable health issues at the IPC boundary

In `ipc/workspace.rs`, replace the blanket `is_healthy` gate:

```rust
fn blocks_open(issue: &WorkspaceHealthIssue) -> bool {
    matches!(issue.kind, WorkspaceHealthIssueKind::InvalidManifest | WorkspaceHealthIssueKind::RecoveryRequired)
}
...
let health = workspace.health()?;
if health.issues.iter().any(blocks_open) {
    return Err(WorkspaceError::Validation("candidate Workspace cannot be opened safely".to_owned()).into());
}
```

Keep the `canonical_managed_path` loop but make it tolerant: skip attachments
whose id is listed as `MissingAttachment` in `health.issues` (they are already
reported) instead of failing the open. In `workspace_bootstrap`, when opening
the remembered path fails, fall through to `workspace_bootstrap_default` only
if the error is `InvalidPath`/`Io` (folder gone); otherwise return the error.

**Verify**: the first two tests from Step 1 pass; `cargo test ... --locked` → all pass.

### Step 3: Make `load_state` degrade per Note instead of aborting

In `mod.rs::load_state`, replace `storage.read(&path)?` and the two `?`
validations with per-Note handling: on `NotFound` push
`WorkspaceHealthIssue { kind: MissingNote, resource_id: Some(id), message_key: "workspace_health_missing_note" }`;
on oversize/non-UTF-8 push `InvalidNote` with `"workspace_health_invalid_note"`;
insert an empty `String` body for that id so `manifest.validate(&bodies)` still
holds, and collect the ids into a `quarantined: HashSet<String>` returned
alongside health. Store it on `Workspace` and, in `execute`, reject
`UpdateNote`/`SetNoteTags`/`ImportNoteAttachments`/`SetNoteStatus` targeting a
quarantined id with `WorkspaceError::Validation("note body is unavailable")`
(deletion may still be allowed — decide and test). Ensure `apply_state`
(recovery.rs) never writes the placeholder body: the simplest guard is to
refuse *all* mutating commands while any Note is quarantined except
`DeleteNote` of a quarantined Note, and to clear quarantine on the next
successful `reconcile_external_changes` that re-reads the file. Check whether
`workspace_health_missing_note`/`workspace_health_invalid_note` keys already
exist in `messages/en.json` (grep); add EN/FR if missing.

Also replace the whole-file read in the `MissingAttachment` check
(`storage.read(&attachment.relative_path).is_err()`) with an existence/regular-
file check only (add a `stat`-style method to `WorkspaceStorage` if needed, or
reuse `exists` + `canonical_managed_path`). This is a small but real cost cut
(every open and every command re-read all attachment bytes).

**Verify**: the third Step 1 test passes; `cargo test ... --locked` → all pass; `grep -n "storage.read(&attachment.relative_path)" apps/desktop/src-tauri/src/workspace/mod.rs` → no matches.

### Step 4: Fix the migration guard and rollback

In `migration.rs`:
- Move the archive check before the `trashed` filter and make it unconditional:
  `if storage.exists(LEGACY_ARCHIVE)? { return Err(WorkspaceError::LegacyArchiveCollision); }`.
- Record in `migration.json` whether this migration created the archive
  (`{"from":1,"to":2,"createdArchive":true|false}`) in `stage_original`; read
  it in `rollback_staged_migration` and remove `LEGACY_ARCHIVE` only when
  `createdArchive` is true. If `migration.json` is missing/unreadable during
  rollback, **do not delete** the archive.

Add a contract test: v1 Workspace with zero trashed Notes + pre-existing
`legacy-trash-v1/README.md` → `Workspace::open` returns
`LegacyArchiveCollision` and the archive file is untouched. Add a second test
using `open_with_migration_failure(..., MigrationFailure::BeforeArchiveCreation)`
(or the closest existing hook) with a pre-existing archive to assert rollback
leaves it in place.

**Verify**: `cargo test ... --locked migration` → all pass including the two new tests; the existing `:570-591` collision test still passes.

### Step 5: Pass Workspace error codes through Copy

In `clipboard/error.rs`, replace the blanket conversion: map
`WorkspaceIpcError.code` `"stale_revision"` → `ClipboardIpcError { code: "stale_revision", message_key: "workspace_error_stale_revision" }`,
`"not_found"` → `"note_not_found"`/existing key, `"not_open"` → keep
`WorkspaceUnavailable`, anything else → `WorkspaceUnavailable`. If
`ClipboardIpcError` should carry revisions, add optional `expected_revision`/
`actual_revision` fields (then run `bun run bindings:generate` and commit the
generated `apps/desktop/src/bindings/*.ts`). In `note-screen.tsx` clipboard
error mapping, handle `stale_revision` by calling `refreshWorkspace()` and
showing the existing stale message.

Add a unit test in `ipc/clipboard.rs` (`Workspace::in_memory()`): stale
`expected_revision` → error code `stale_revision`; empty `note_id` →
`validation`; unknown id → `not_found`.

**Verify**: `cargo test ... --locked clipboard` → pass; `bun run bindings:check` → exit 0; `bun run typecheck && bun run test:desktop` → pass.

### Step 6: Report the real transaction id and retry cleanup on `execute`

In `mod.rs`, change `cleanup_blocked: bool` to `blocked_cleanup: Option<String>`
holding the transaction id captured at `:142-147`; at the top of `execute` call
`self.retry_cleanup_if_needed()?` like `snapshot` does; when still blocked,
return `DeletionCleanupRequired { transaction_id: <stored id> }`. Update the
unit tests around `:641` that assert the blocked path.

**Verify**: `cargo test ... --locked` → all pass; `grep -n '"pending"' apps/desktop/src-tauri/src/workspace/mod.rs` → no matches.

## Test plan

- Steps 1, 4, 5 add ≥6 tests; existing 73 unit + contract tests must stay green.
- Manual (host): open a real Workspace, drop `notes/stray.md`, relaunch → the
  shelf opens and the health list shows the import candidate.

## Done criteria

- [ ] `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked` exit 0 with the new tests
- [ ] `validate_candidate` no longer gates on `is_healthy`; only `InvalidManifest`/`RecoveryRequired` block
- [ ] `load_state` reports `MissingNote`/`InvalidNote` instead of returning `Err`, and never reads attachment bytes
- [ ] Migration stops on any pre-existing `legacy-trash-v1/`; rollback deletes it only when this migration created it
- [ ] Copy returns `stale_revision`/`not_found` codes; frontend refetches on stale
- [ ] `bun run bindings:check`, `bun run typecheck`, `bun run test:desktop` pass
- [ ] `plans/README.md` status row for 025 updated

## STOP conditions

- The quarantine design in Step 3 would require `apply_state` (recovery.rs)
  changes beyond a "skip quarantined ids" guard — report; that belongs to Plan 032.
- Any existing recovery/migration interruption test fails after Step 4 —
  do not adjust the assertion; report.
- A DTO change breaks `bun run bindings:check` after regeneration.

## Maintenance notes

- Health kinds now split into blocking (`InvalidManifest`, `RecoveryRequired`)
  and reportable; document this in `docs/ARCHITECTURE.md`'s Workspace section
  if the wording there is ambiguous.
- Plan 032 (per-command transactions) will remove the remaining full-collection
  reads on open; keep the `stat`-only attachment check from Step 3.
- Frontend follow-up (Plan 026) adds a focus/visibility refresh so external
  changes appear without a command.
