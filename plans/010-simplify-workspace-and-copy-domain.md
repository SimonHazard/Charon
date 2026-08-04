# Plan 010: Simplify the Workspace and agent-ready copy domain

> **Executor instructions**: Read ADR 0011 and this plan in full before touching
> persistence. Run each verification gate in order. Never delete or rewrite a
> real Workspace fixture outside a test temp directory. Stop on every STOP
> condition. Regenerate `ts-rs` bindings; never hand-edit them. Update the plan
> index only after all done criteria pass.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/src/clipboard apps/desktop/src-tauri/src/ipc apps/desktop/src/bindings apps/desktop/src/lib/ipc apps/desktop/src/features/notes apps/desktop/src/features/copy scripts/check-bindings.ts plans/README.md`
> Compare every changed in-scope symbol with the Current state section. Stop if
> the live schema is no longer v1 or another migration already exists.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/008-freeze-rapid-capture-product.md`
- **Category**: migration, tech-debt, tests
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

The current domain exposes organization and recovery behaviors that the smaller
product will no longer present: Sections, manual sort keys, Merge, Trash,
Restore, Move, Reorder, batch variants, generic Undo, and five CopyPresets. It
also has no safe persisted contract for the newly accepted Tags and Attachments.
If only the React controls disappear, platform capture and persistence still
carry the old concepts while file imports risk bypassing Workspace entirely.

This plan moves the Workspace to a flat schema v2, preserves active notes, puts
legacy trashed bodies in an explicit user-owned Markdown archive, adds bounded
Note-owned Attachments, reduces the command union, and makes completed
transaction records ephemeral. It also replaces CopyPresets with one
deterministic agent-ready Markdown format. Permanent Delete then means what the
interface says: after success, Charon retains no active or normal-backup copy of
the Note body or managed Attachment bytes.

## Current state

- `apps/desktop/src-tauri/src/workspace/model.rs:10-93` declares schema v1 with
  `sections`, `sectionId`, `sortKey`, `completedAt`, and `trashedAt`.
- `apps/desktop/src-tauri/src/workspace/model.rs:163-180` requires one Section
  and counts non-trashed notes as active.
- `apps/desktop/src-tauri/src/workspace/command.rs:19-105` exposes 16 command
  variants including Section, Move, Reorder, Trash, Restore, Merge, and Undo.
- `apps/desktop/src-tauri/src/workspace/recovery.rs:80-125` writes complete
  previous/next bodies for every transaction; lines 351-371 retain up to 20
  committed transactions for 30 days.
- `apps/desktop/src-tauri/src/ipc/workspace.rs:220-274` makes captured notes by
  resolving an active/fallback Section and sort key.
- `apps/desktop/src-tauri/src/clipboard/model.rs` and `composer.rs` implement
  `plain`, `bulleted`, `numbered`, `task-list`, and `sectioned` presets.
- No Workspace type stores Tags or Attachment metadata. There is no managed
  Attachment directory, import validation, or transaction coverage for copied files.
- `apps/desktop/src-tauri/tests/workspace_contract.rs` runs one contract against
  both the in-memory and real-filesystem Workspace seams. Preserve that pattern.
- ADR 0011, once accepted, supersedes the removed semantics but preserves
  `Workspace`, `CaptureCoordinator`, `ClipboardComposer`, typed IPC, local
  Markdown, atomicity, and both persistence seams.

## Target persisted contract

Schema v2 is exactly:

```text
charon.workspace.json
  schemaVersion: 2
  workspaceId: UUID v4
  revision: safe integer
  notes[]:
    id: UUID v4
    status: open | done
    createdAt: RFC 3339 UTC seconds
    updatedAt: RFC 3339 UTC seconds
    completedAt: RFC 3339 UTC seconds | null
    tags: string[]                    # ordered, case-insensitively unique
    attachments[]:
      id: UUID v4
      fileName: safe basename for display
      relativePath: generated Workspace-relative path
      createdAt: RFC 3339 UTC seconds

notes/<uuid>.md
attachments/<note-uuid>/<attachment-uuid>[.<safe-extension>]
backups/                    # incomplete transaction recovery only
legacy-trash-v1/            # created only by v1 migration when needed
  README.md
  manifest.json             # legacy metadata, no active note bodies
  notes/<uuid>.md            # only bodies that were already trashed in v1
```

Snapshots expose the same flat Note fields plus body and Attachment display
metadata, but never the Workspace root, source path, or an absolute path. Notes
sort newest `createdAt` first, then UUID for a deterministic tie. Updating a
body, Tags, or Attachments must not move it. Selection order follows that visible
order and is not persisted.

Tag limits are part of the schema contract: at most 16 per Note; after trimming,
each is 1-48 Unicode scalar values with no control or line-break character.
Case-insensitive comparison rejects duplicates while preserving the first
entered spelling and order. Tags have no IDs or global registry.

Attachment limits are `MAX_ATTACHMENTS_PER_NOTE = 20` and
`MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024`. A source must be one regular,
non-symlink file outside the Workspace. The generated destination path—not the
source basename—provides storage identity; only a validated basename is kept for
display. Unexpected files are never adopted into a Note automatically.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Workspace unit | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::` | all unit tests pass |
| Workspace contract | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --test workspace_contract` | memory, real FS, migration and recovery tests pass |
| Clipboard contract | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --test clipboard_contract` | agent-ready Markdown tests pass |
| Bindings | `bun run bindings:generate && bun run bindings:check` | generated DTOs are current and check exits 0 |
| Frontend domain tests | `bun run test:desktop -- workspace-context note-commands search tags attachments copy` | targeted tests pass |
| Rust quality | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Aggregate | `bun run check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |

## Suggested executor toolkit

- Read `docs/adr/0011-rapid-capture-product.md` and `docs/PRIVACY.md` before
  implementing migration or deletion.
- Keep `Workspace` deep. Do not split migration, validation, command, recovery,
  and watching into repositories or generic services.
- Use the existing real-filesystem and in-memory storage adapters; do not add a
  third persistence seam.

## Scope

**In scope**:

- `apps/desktop/src-tauri/src/workspace/{model,command,recovery,storage,watch,mod,error}.rs`
- `apps/desktop/src-tauri/src/ipc/{workspace,clipboard,capture,mod}.rs`
- `apps/desktop/src-tauri/src/clipboard/{model,composer,adapter,error,mod}.rs`
- `apps/desktop/src-tauri/tests/{workspace_contract,clipboard_contract,capture_contract}.rs`
- `apps/desktop/src/bindings/{workspace,clipboard,capture}.ts` (generated)
- `apps/desktop/src/lib/ipc/{workspace-client,clipboard-client,capture-client}.ts`
- Pure frontend command/search/copy helpers and their tests only as required by
  the new DTOs; do not redesign components in this plan
- `scripts/check-bindings.ts`
- Persistence/IPC sections of README/docs only if implementation evidence forces
  a correction to ADR 0011

**Out of scope**:

- Desktop layout, theme assets/tokens, preferences, site, release automation
- SQLite, a database, direct React filesystem access, another storage adapter
- Importing arbitrary Markdown files as Notes, external Attachment references,
  Attachment execution/preview/upload, deduplication, or an asset library
- A Trash UI, generic Undo, Merge, Section compatibility commands, or hidden
  feature flags that preserve removed behavior

## Git workflow

- Branch: `codex/010-flat-workspace`
- Commits: `feat(workspace): migrate to flat note schema`,
  `feat(workspace): manage note attachments transactionally`,
  `refactor(copy): compose agent-ready markdown`,
  `test(workspace): prove permanent deletion cleanup`
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a one-way, no-loss v1 to v2 migration

Parse schema v1 into dedicated legacy structs; do not weaken v2 validation to
accept mixed shapes. On `Workspace::open`:

1. detect v1 before v2 validation;
2. validate the complete v1 manifest and every referenced body first;
3. stage one migration transaction in `backups/` with enough previous/next state
   to recover a crash, but mark it for cleanup after commit;
4. preserve every non-trashed Note ID, body, status, created/updated/completed
   timestamp in v2, initialize `tags` and `attachments` to empty arrays, and
   discard only Section and sort metadata;
5. for each already-trashed v1 Note, move its Markdown body to
   `legacy-trash-v1/notes/<uuid>.md` and write a localized-independent English
   `README.md` explaining that these files were in Charon's legacy Trash, are no
   longer loaded by the app, and can be reviewed/deleted with normal filesystem
   tools;
6. write `legacy-trash-v1/manifest.json` with only the archived IDs, legacy
   Section names, timestamps, and status metadata needed to understand the
   files. Do not copy bodies into JSON;
7. keep one copy of the original v1 manifest metadata (not active note bodies)
   with the migration archive;
8. atomically commit schema v2, remove obsolete v1 committed transaction
   backups, and remove the incomplete migration record;
9. never create `legacy-trash-v1/` when the v1 Workspace had no trashed notes.

If the archive path already exists, stop with a typed collision error before
mutation. Never merge with an unrelated directory. Migration is idempotent:
opening the completed v2 Workspace again changes no revision or files.

Add failure injection before archive creation, after archive staging, after
note moves, after manifest commit, and before cleanup. Every phase must recover
to complete v1 or complete v2, never a mixed manifest/body set.

**Verify**: Workspace contract tests cover active-only, active+trashed,
multi-Section order, existing archive collision, malformed v1, every injected
phase, idempotent reopen, and byte-exact Markdown preservation.

### Step 2: Replace the model and command union with flat Notes

Set `SCHEMA_VERSION` to 2 and remove `PersistedSection`, `SectionDto`,
`section_id`, `sort_key`, and `trashed_at` from current structs. Retain current
limits for note body, manifest, active Note count, UUIDs, safe integers, and UTC
timestamps. Validation requires `completedAt` only for Done and forbids it for
Open.

Add `PersistedAttachment` and its generated DTO shape. Validate Tags and managed
relative paths centrally in `model.rs`; a manifest-provided path must match the
owning Note/Attachment IDs exactly and can never contain an absolute root,
parent traversal, alternate separator, or user-selected source component.

Replace the command union with exactly:

- `CreateNote { expectedRevision, body }`
- `UpdateNote { expectedRevision, noteId, body }`
- `SetNoteTags { expectedRevision, noteId, tags }`
- `ImportNoteAttachments { expectedRevision, noteId, sourcePaths }`
- `DeleteNoteAttachments { expectedRevision, noteId, attachmentIds }`
- `SetNoteStatus { expectedRevision, noteIds, status }`
- `DeleteNotes { expectedRevision, noteIds }`

Batch-capable IDs and source lists validate 1..N unique values and fail
atomically when any Note/Attachment is missing or any source is invalid.
`CreateNote` preserves selected/captured whitespace except the existing
empty/whitespace rejection at the application boundary. `SetNoteTags` applies
the limits and case-insensitive uniqueness contract without sorting user order.
`SetNoteStatus` writes one completion timestamp for the batch; reopening clears
it. Attachment removal and Note Delete are never undoable.

Remove `undoToken` from `WorkspaceCommandResult`. Keep transaction ID for
content-free diagnostics/recovery correlation. Update snapshot ordering to
created-descending plus ID. Do not add page, project, Section, title, or global
Tag-registry fields.

**Verify**: serialization tests assert exactly seven union variants; Tag and
Attachment validation tables pass; `rg -n "SectionDto|section_id|sort_key|trashed_at|MergeNotes|TrashNote|RestoreNote|BatchTrash|BatchMove|Undo" apps/desktop/src-tauri/src apps/desktop/src/bindings` returns only legacy migration structs/tests explicitly named `LegacyV1*`.

### Step 3: Import and remove managed Attachments transactionally

Keep file ownership inside `Workspace`. `ImportNoteAttachments` receives paths
selected by the native file dialog, but React never opens or reads them. For the
complete source list before mutating anything, Rust must:

1. canonicalize only for validation and confirm each source is outside the
   Workspace;
2. reject symlinks, directories, sockets/devices, unreadable files, duplicates,
   empty basenames, control characters, limit overflow, and files whose metadata
   changes incompatibly while copying;
3. derive a display basename without persisting the source parent path;
4. allocate Attachment UUIDs and destinations from Note/Attachment identity,
   preserving only a sanitized final extension when safe;
5. stream each file into the transaction staging area with bounded buffers,
   verify the copied byte count, sync, and rename inside the Workspace;
6. commit all Attachment metadata and files atomically, or remove all staged
   files and leave the Note/revision unchanged.

`DeleteNoteAttachments` validates ownership and uniqueness before staging one
transaction. It removes metadata and managed files together. `DeleteNotes`
includes every owned Attachment in its transaction automatically. Successful
removal may leave an empty Note directory only until transaction cleanup, after
which it is removed. A missing referenced file is a typed Workspace health
issue; an unexpected file is never silently adopted or deleted.

All failures are content-free and omit source/destination absolute paths. Add
real-filesystem failure injection for open/read/write/short-copy/sync/rename/
manifest/cleanup phases and parity assertions for the in-memory seam using
synthetic Attachment bytes.

**Verify**: Workspace contract covers one/many imports, every rejected source,
limit boundaries, same-name files, partial failure atomicity, external missing
file health, explicit Attachment removal, Note deletion, restart recovery, and
zero orphan staging/managed files after success or rollback.

### Step 4: Make committed transaction bodies and Attachment bytes ephemeral

Refactor recovery so transaction directories exist only while a mutation can be
incomplete. After note files, manifest, committed marker, and directory sync are
durable, remove that transaction directory before returning the normal command
result. On startup, recover every incomplete record to its deterministic prior
or next complete state, then remove the record. Remove the 20-item/30-day
committed-backup retention policy and generic undo implementation.

For `DeleteNoteAttachments` and `DeleteNotes`, the command is fully successful
only after active files, manifest references, Attachment directories, and all
transaction copies are gone. If cleanup fails after the manifest commit, return
a typed `deletion_cleanup_required` state that says the requested content is
deleted but Charon could not yet prove recovery-copy cleanup.
Block further mutations, retry cleanup on startup and explicit refresh, and do
not show a success acknowledgement until cleanup is complete. Errors never
contain body, filenames, or absolute paths.

The explicit `legacy-trash-v1/` archive is not a normal transaction backup and
contains only Notes that were already in v1 Trash. Deleting an active v2 Note or
Attachment must never leave its body/bytes there.

**Verify**: real-filesystem tests assert `backups/` has no committed transaction
directory after create, update, Tag, Attachment, status, or delete; every
injected interruption recovers; cleanup failure produces the typed blocked
state; successful Delete finds the deleted body and Attachment sentinels in
neither Workspace files nor transaction backup bytes.

### Step 5: Simplify capture creation and typed IPC

Remove active-Section state from capture IPC, `CaptureCoordinator` application
mapping, frontend clients, and tests. A successful selected-text action maps to
one flat `CreateNote` command. The portable reveal action remains unchanged
until Plan 012 retargets it to the bottom composer.

Update Workspace client drafts for the seven command variants and preserve the
serialized write queue/stale-revision refresh behavior. Remove section-name
arguments from create/open/bootstrap commands; Rust no longer needs localized
initial Section copy.

Regenerate TypeScript bindings and update `scripts/check-bindings.ts` declarations.
Do not hand-edit output.

**Verify**: bindings commands pass; capture contract asserts one selected text
creates exactly one flat Note and has no destination state.

### Step 6: Reduce ClipboardComposer to one agent-ready Markdown format

Remove `CopyPreset`, Section fields, preset options, preview-only formatting
branches, and their generated DTOs. Keep `ClipboardComposer` as the deterministic
boundary that:

- accepts ordered immutable Note IDs resolved from one Workspace revision;
- rejects empty, duplicate, missing, or whitespace-only selections atomically;
- preserves each body exactly apart from separator-adjacent surplus blank lines;
- emits one selected Note without an invented title; for multiple Notes, emits
  `## Note 1`, `## Note 2`, and so on in Selection order, separated by
  `\n\n---\n\n`;
- appends `**Tags:**` with Tags as safely delimited inline-code spans in persisted
  order only when at least one Tag exists;
- appends `**Attachments:**` with one bullet per Attachment in created/ID order,
  containing its safe display name and canonical absolute managed path as
  Markdown inline code, only when at least one Attachment exists;
- resolves each Attachment relative path against the current Workspace root in
  Rust, proves it remains a regular file under that root, and fails the complete
  copy before touching the clipboard if any reference is invalid or missing;
- uses an inline-code delimiter longer than any backtick run in a Tag, display
  name, or path so user-controlled metadata cannot break the Markdown shape;
- writes only after an explicit command through the existing clipboard adapter;
- returns Note/Tag/Attachment counts and byte count without echoing content or
  absolute paths in diagnostics/React state;
- never reads Attachment bytes, changes Note status, uploads, pastes, or reads
  clipboard history.

This is the only application copy format and user-facing name: `Copy as
Markdown`. Do not add a preset enum or saved preference. The privacy contract
must make clear that this explicit action places managed absolute paths on the
system clipboard so a local agent such as Codex can resolve them; a remote agent
still requires the user to attach files separately.

Normal text copy inside an editable control remains native and must win over an
app-level selection copy.

**Verify**: Clipboard contract covers one/many ordered Notes, empty/non-empty
Tags and Attachments, exact canonical output, Unicode/backtick escaping, path
containment, missing managed file, blank-edge normalization, missing/duplicate
IDs, native-editable precedence, write failure, no Attachment-byte read, no
unintended path in errors, and no Workspace mutation.

### Step 7: Remove obsolete helpers/tests and run the complete domain gate

Delete only pure helpers and tests whose sole purpose was Section, Move, Reorder,
Merge, Trash/Restore/Undo, or CopyPreset behavior. Keep search, selection, draft,
Markdown preview, and status helpers for Plan 011. Review the complete diff for
data loss, path leakage outside the explicit clipboard payload, orphan files,
hand-edited generated files, and reverse dependencies.

**Verify**: all commands in the command table pass in order; `git diff --check`
exits 0; generated binding check shows no diff after regeneration.

## Test plan

- Pure v2 validation and seven-command state transitions.
- Tag limits/order/case-insensitive uniqueness and search DTO coverage.
- Managed Attachment import/remove limits, path containment, atomicity, health,
  recovery, and real/in-memory parity.
- Real/in-memory parity for create, update, batch status, permanent batch delete.
- Full v1 migration matrix with legacy Trash archive and injected failures.
- Transaction cleanup and Note/Attachment delete cleanup-failure blocked state.
- Watcher external body/Attachment deletion and invalid manifest behavior on v2.
- Stable IPC serialization and generated binding checks.
- Agent-ready ClipboardComposer body/Tag/Attachment formatting, escaping,
  path resolution, errors, and explicit write.
- Capture creates one flat Note with exact selected body.

## Done criteria

- [ ] Schema v2 is flat and current DTOs contain no Section/sort/trash fields.
- [ ] Tags satisfy the bounded ordered-set contract without a registry/hierarchy.
- [ ] Attachments are managed under their owning Note with no persisted source path.
- [ ] Every active v1 Note migrates byte-exactly with stable identity/status/time.
- [ ] Every v1 trashed body is preserved only in the explicit legacy archive.
- [ ] Current command union contains exactly seven variants and no generic Undo.
- [ ] Successful permanent Note/Attachment Delete leaves no active or
  transaction-backup body/bytes.
- [ ] Incomplete writes still recover deterministically and clean themselves up.
- [ ] Capture creates one flat Note without destination state.
- [ ] ClipboardComposer performs only deterministic explicit `Copy as Markdown`
  and never reads Attachment bytes.
- [ ] Memory/real FS, bindings, Rust quality, frontend domain, and aggregate tests pass.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- ADR 0011 is not accepted or differs on Tags, managed Attachments,
  `Copy as Markdown`, legacy Trash, or permanent deletion.
- Migration would overwrite an existing `legacy-trash-v1/` path or lose a body.
- A completed delete cannot prove removal of body/Attachment bytes from active
  files and transaction copies.
- Safe import would require following symlinks, persisting a source path,
  reading files in React, or accepting path traversal/special files.
- Recovery cannot converge every injected phase to complete v1 or complete v2.
- Simplification requires bypassing Workspace with direct React filesystem access.
- A binding change cannot be generated from Rust with the existing `ts-rs` path.

## Maintenance notes

- Schema v2 deliberately trades post-commit app-owned history for simpler,
  truthful deletion; interrupted-transaction recovery remains non-negotiable.
- The legacy archive is user-owned Markdown, not a hidden Trash feature. Future
  code must never read it into the active snapshot.
- Tags remain a bounded ordered field on each Note. Any registry, color model,
  hierarchy, smart list, or second navigation destination requires a new ADR.
- Attachments belong to exactly one Note. Cross-Note reuse/deduplication or
  arbitrary preview/execution would require a new storage and privacy decision.
