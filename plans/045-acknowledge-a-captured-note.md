# Plan 045: Acknowledge a captured Note inside the shelf when the user next reveals Charon

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src-tauri/src/capture/model.rs apps/desktop/src-tauri/src/ipc/capture.rs apps/desktop/src-tauri/src/ipc/workspace.rs apps/desktop/src-tauri/tests/capture_contract.rs apps/desktop/src/bindings/capture.ts apps/desktop/src/lib/ipc/capture-client.ts apps/desktop/src/lib/ipc/capture-client.test.ts apps/desktop/src/app/providers.tsx apps/desktop/src/app/capture-status.ts apps/desktop/src/app/capture-status.test.ts apps/desktop/src/features/notes/note-screen.tsx apps/desktop/src/features/notes/note-list.tsx apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/styles/app.css apps/desktop/messages docs/UX.md docs/PRIVACY.md docs/PRODUCT.md && git status --short -- apps/desktop docs`
> (without `..HEAD` the diff includes uncommitted edits). Plans 040, 041 and
> 042 land first and touch `note-row.tsx`, `app.css`, the catalogs
> and `docs/UX.md`; their edits are expected drift. Compare the "Current state"
> excerpts against the live code; any other mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 041 Step 0 (the paint-feedback motion ADR permits the acknowledgement fade)
- **Category**: bug (UX)
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

Double-Shift capture is silent by contract: no window, no focus change
(`docs/UX.md:208-211`, ADR 0006). But when the user next opens Charon, nothing
marks the new Note: it sits at the top looking like every other row, and a
successful capture emits no status at all. `docs/UX.md` already reserves
Lavender for "a successful new-Note acknowledgement", a state that does not
exist. This plan adds an acknowledgement that appears only inside the shelf
once the user reveals it; it never shows or focuses the window.

## Current state

- `apps/desktop/src-tauri/src/capture/model.rs:112-114`:
  `pub struct CaptureStatusEvent { pub message_key: String }` (ts-rs, camelCase
  `messageKey`); exported by `tests/capture_contract.rs` (around lines 430-452).
  `CaptureWarning::message_key()` returns `"capture_warning_clipboard_not_restored"`.
- `apps/desktop/src-tauri/src/ipc/capture.rs`:
  - `CaptureRuntime.pending_status: Mutex<Option<CaptureStatusEvent>>` (line 24):
    a single slot, so a second status overwrites the first.
  - `consume_action` (`:286-322`): the `CreateNote` arm calls
    `workspace::create_capture_note`; `Ok(true)` → success (only a warning is
    remembered), `Ok(false)` → `workspace_unavailable` error, `Err` → error.
  - `remember_status` (`:365-373`) stores the slot; `emit_pending_status`
    (`:375-403`) emits `capture://status` to `main` only once
    `composer_listener_ready`, and runs only from `handle_main_focus`
    (`:235-237`, wired at `lib.rs:66-67`) and `capture_composer_ready` (`:270`).
- `apps/desktop/src-tauri/src/ipc/workspace.rs:376-409`:
  `create_capture_note(...) -> Result<bool, WorkspaceIpcError>` returns
  `Ok(false)` when no Workspace is open; `execute_capture_note` returns
  `Ok(false)` for a whitespace body and `Ok(true)` after
  `WorkspaceCommand::CreateNote`. `emit_pending` (`:411-416`) forwards only
  `External` events, so the captured Note reaches React only through the
  refresh on window focus/visibility (`src/app/workspace-context.tsx:302-316`).
  The status can therefore arrive before the snapshot that contains the Note.
- `apps/desktop/src/app/providers.tsx:93-130` `CaptureBridge` toasts every
  status via `captureStatusTone` (`capture-status.ts`: `'warning' | 'error'`).
- `note-screen.tsx:96-104` `notes` memo (keeps the expanded editor pinned);
  `announce()` at `:106-115` writes a shared polite live region.
- Motion: `packages/theme/src/motion.css` defines `--motion-duration-surface`
  and `--motion-easing-surface`. `app.css` keyboard-modality rule
  (`:root[data-input-modality="keyboard"] …`, end of file) does not cover
  `.note-row`.
- Privacy (`docs/PRIVACY.md`, AGENTS.md): events are content-free. A Note id is
  a random UUID that already crosses IPC in every snapshot.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Bindings | `bun run bindings:generate && bun run bindings:check && bun run ipc:check` | exit 0 |
| Messages | `bun run messages:check` | exit 0 |
| Unit | `bun run --cwd apps/desktop test` | pass |
| Full | `bun run check` | exit 0 |
| Native (macOS) | `bun run tauri:dev`, select text elsewhere, press Shift twice | see Step 5 |

## Scope

**In scope**: files in the drift-check list, plus `src/app/capture-bridge.test.tsx` (new).

**Out of scope**: system notifications, tray badges, sounds (backlog items
needing a privacy decision); the Windows/X11 adapters; `WorkspaceCommandResult`.

## Git workflow

- Branch: `codex/045-capture-acknowledgement`
- Commits: `feat(capture): emit a content-free success status with the note id`,
  `feat(notes): acknowledge the captured note in the shelf`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Precondition

Any uncommitted capture-permission work (`CaptureError::SettingsOpenFailed`,
the `request_permission` change, its messages and the UX paragraph) must be
committed first. Do not edit around it.

### Step 1: Success status from Rust

- `capture/model.rs`: add `pub note_id: Option<String>` to `CaptureStatusEvent`
  (serialises as `noteId: string | null`).
- `ipc/workspace.rs`: introduce
  `pub(crate) enum CaptureNoteOutcome { Created(String), Empty, WorkspaceClosed }`.
  `execute_capture_note` returns `Created(id)` with the one id in the post-command
  snapshot that is missing from the pre-command snapshot, or `Empty` for a
  whitespace body; `create_capture_note` returns `WorkspaceClosed` when no
  Workspace is open. Update the existing tests (around `:468`, `:528`, `:540`).
- `ipc/capture.rs`: replace `pending_status` with
  `Mutex<VecDeque<CaptureStatusEvent>>`, capped at 4 (drop the oldest).
  `emit_pending_status` drains in order; on an emit failure it pushes the
  failed event back to the front and stops.
- Add a pure `fn capture_statuses(outcome: Result<CaptureNoteOutcome, CaptureIpcError>, warning: Option<CaptureWarning>) -> Vec<CaptureStatusEvent>`:
  `Created(id)` → `CaptureStatusEvent { message_key: "capture_note_created".to_owned(), note_id: Some(id) }`
  then the warning if any; `Empty` → nothing; `WorkspaceClosed` → the existing
  `workspace_error_not_open` event; `Err` → the existing error event. Write the
  key as a `message_key:` literal so `messages:check` sees it. Remember each
  returned event, then emit immediately if `main.is_focused()` is `Ok(true)`;
  otherwise it waits for focus.
- Add `capture_note_created` ("Note captured." / "Note capturée.") to both catalogs.
- Unit tests for `capture_statuses`: success, success + warning (in that
  order), error, empty. A queue test proves two remembered events are both kept.

**Verify**: `cargo test … --locked` → pass; bindings commands → exit 0;
`bun run messages:check` → exit 0.

### Step 2: Tone and bridge

`captureStatusTone` returns `'success' | 'warning' | 'error'`
(`capture_note_created` → `'success'`; update `capture-status.test.ts`).
`CaptureBridge` never toasts `'success'`: it publishes `{ noteId, at }` to a new
`CaptureAcknowledgementContext`; later successes replace earlier ones. Warning
and error toasts stay as today.

**Verify**: new `src/app/capture-bridge.test.tsx`: a `capture_note_created`
status sets the acknowledgement and adds no toast → pass.

### Step 3: Shelf acknowledgement

- `NoteScreen` holds the acknowledgement until `snapshot.notes` contains
  `noteId`, and drops it after 5 s if the Note never appears. Then it calls
  `announce(m.capture_note_created())`. It never changes `query`/`tag` and never
  pins the Note; if the Note is filtered out, it only announces.
- It sets `acknowledgedId` and asks `NoteList` to scroll to index 0 only when
  `expandedId === null` and focus is not in an editable field.
- `note-row.tsx`: `data-acknowledged={acknowledged || undefined}`; the
  attribute is cleared after 2 500 ms (timer in `NoteScreen`, cleared on unmount).
- `app.css` (tint on a pseudo-element; only opacity animates; borders never
  change because `--selection-border` already marks the expanded row):

```css
.note-row::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--selection-subtle);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-duration-surface) var(--motion-easing-surface);
}
.note-row[data-acknowledged]::before {
  opacity: 1;
  transition-duration: 0s;
}
@media (prefers-contrast: more) {
  .note-row[data-acknowledged] { outline: 2px solid currentColor; outline-offset: -2px; }
}
```

  The tint appears instantly (no entrance motion) and fades when the attribute
  is removed; reduced motion already shortens the surface duration to 120 ms.
  Check that `.note-row` is `position: relative` and that its content stacks
  above the pseudo-element.

**Verify**: `note-screen.test.tsx` new cases: an acknowledgement for a Note not
yet in the snapshot waits, then announces and marks the row once the snapshot
contains it; the mark clears after 2.5 s (fake timers); a filtered-out Note
only announces → pass.

### Step 4: Documentation

- `docs/UX.md`, after "…never steals source focus." (around line 211): "When
  the user next reveals Charon, the shelf announces the captured Note, scrolls
  to it if no editor is open, and briefly tints its row Lavender. Capture
  itself stays silent."
- `docs/PRODUCT.md` §Selected-text capture: the same sentence.
- `docs/PRIVACY.md`, after "…content-free warning." (around line 86): "A
  successful capture reports only a message key and the new Note's random id,
  never text, and only to the local main window."

**Verify**: `grep -n "tints its row Lavender" docs/UX.md docs/PRODUCT.md` → one match each.

### Step 5: Native smoke (macOS)

`bun run tauri:dev`; select text in another app; double Shift with Charon
hidden; reveal Charon → the new row is at the top, tinted, and the polite
region announced. Record the result, then delete
`apps/desktop/src-tauri/target/debug` (AGENTS hygiene).

## Test plan

- Rust: `capture_statuses` cases and the queue test; updated
  `ipc/workspace.rs` tests. TS: `capture-status.test.ts`,
  `capture-bridge.test.tsx`, `note-screen.test.tsx` acknowledgement cases,
  `capture-client.test.ts` payload shape.

## Done criteria

- [ ] `cargo test … --locked` passes; `bun run check` exits 0
- [ ] `apps/desktop/src/bindings/capture.ts` `CaptureStatusEvent` has `noteId`
- [ ] `grep -rn "capture_note_created" apps/desktop/messages/en.json apps/desktop/messages/fr.json apps/desktop/src-tauri/src` → ≥ 3 matches
- [ ] `grep -n "data-acknowledged" apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/styles/app.css` → both
- [ ] Step 5 result recorded
- [ ] `plans/README.md` status row updated

## STOP conditions

- Surfacing the created Note id requires changing the Workspace transaction
  contract in `workspace/` (beyond diffing the two snapshots): STOP and report.
- The paint-feedback motion ADR from Plan 041 Step 0 is not accepted: the
  tint fade would violate the motion contract; STOP.

## Maintenance notes

- A future tray/notification plan should consume the same `capture_note_created` event.
- Reviewer: confirm no Note body appears in any event payload or log, and that
  the window is never shown or focused by this path.
