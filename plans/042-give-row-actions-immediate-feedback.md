# Plan 042: Give status, copy and tag actions one-frame feedback instead of a silent IPC wait

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-row.test.tsx apps/desktop/src/features/notes/note-list.tsx apps/desktop/src/features/notes/note-list.test.tsx apps/desktop/src/features/notes/note-screen.tsx apps/desktop/src/features/notes/note-screen.test.tsx apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/features/notes/note-editor.test.tsx apps/desktop/src/styles/app.css apps/desktop/src/motion/system.ts apps/desktop/e2e/release.spec.ts apps/desktop/messages docs/UX.md && git status --short -- apps/desktop/src apps/desktop/messages docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plan 041 lands
> first and change `note-row.tsx`, `app.css` and `docs/UX.md`;
> their edits are expected drift. Compare the "Current state" excerpts against
> the live code; any other mismatch is a STOP condition. If uncommitted user
> changes touch an in-scope file, STOP until they are committed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 041 (transitioned `.note-status-dot`), 041 Step 0 (paint-feedback motion ADR)
- **Category**: perf (perceived) / bug
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

Every Workspace command returns the full snapshot and is serialised through a
write queue (`workspace-context.tsx:119-172`). Ticking a Note done, removing a
tag, or closing the editor awaits that round trip with no pending state, so on
a large Workspace nothing changes for a noticeable stretch, then everything
flips at once. The done check appears with no motion; the copy confirmation
mounts a paragraph inside the row, which changes the row height, re-measures
the virtual list and shifts every row below it, then does it again 2.5 s later
when the text is removed. ADR 0005 requires feedback on pointer/key down
within one frame. This plan adds optimistic and pending states and moves the
copy confirmation out of the layout flow.

## Current state

- `apps/desktop/src/features/notes/note-row.tsx:95-108` status button:

```tsx
          <Button
            aria-label={note.status === 'done' ? m.note_mark_open() : m.note_mark_done()}
            aria-pressed={note.status === 'done'}
            className="note-status-button"
            onClick={() => void onToggleStatus(note)}
            size="icon-sm"
            variant="ghost"
          >
            <span aria-hidden className="note-status-dot" data-status={note.status}>
              {note.status === 'done' ? <IconCheck /> : null}
            </span>
          </Button>
```

- `note-screen.tsx:327-338` `toggleNoteStatus(note)` computes the target from
  the possibly stale `note.status`, awaits
  `executeWorkspaceCommand({ type: 'setNoteStatus', … })`, then `announce(...)`.
  Notes are ordered by `created_at` descending then id
  (`src-tauri/src/workspace/model.rs:269`); a status change never reorders.
- `note-row.tsx:204-216` renders `{copyState ? <p className="… note-copy-state" role="status|alert">…</p> : null}` inside `motion.article`; `note-screen.tsx:168-213` `copyNote` sets `copyState` (announce at `:181`) and clears it with a 2 500 ms timer; `app.css:679-682` `.note-copy-state`.
- Copy/edit/delete buttons have `opacity: 0` unless the row is hovered or has
  focus (`app.css:660-677`); WebKit does not focus a button on click.
- `note-row.tsx:166-181` copy button with `IconCopy` and a tooltip carrying the local-paths disclosure; `aria-describedby={copyDisclosureId}`.
- `note-editor.tsx:260-267` `removeTag` awaits `onSetTags` (the Backspace path in the tag input, around line 441, also calls it); `:354-361` close button awaits `close()` → `flushDraft()`; the save-failure alert with Retry is at `:384-398` and renders only in the Write tab (Base UI `Tabs.Panel` unmounts inactive panels).
- Pending-state pattern already in the repo: `capture-input.tsx:20,89,96` (`pending` state, `aria-busy`, `readOnly`), `note-editor.tsx:95,464` (`attachmentPending`).
- `apps/desktop/src/motion/system.ts:15-20` `surfaceTransition` spring; `:13` `useKeyboardMotion()` (context-based; do not call it per row, it re-renders every mounted row on each modality switch); `note-editor.tsx:81` `useReducedMotion()` from `motion/react`; `note-row.tsx:2` imports `AnimatePresence, m as motion`.
- `docs/UX.md` "Motion and materials" (around line 331) calls the allowed motion
  foundation "exact"; Step 5 adds the two icon swaps to it. Only transform and
  opacity animate; the paint transitions on the dot come from Plan 041 under
  the motion ADR it adds in its Step 0.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/notes` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Suggested executor toolkit

- Skill `motion-react` for `AnimatePresence mode="wait"` and reduced-motion branches.

## Scope

**In scope**: files in the drift-check list (including `note-list.tsx`, `note-list.test.tsx` and `docs/UX.md`).

**Out of scope**:
- `workspace-context.tsx` and the IPC result shape (delta results are a separate spike, README "Direction").
- Any Rust file.
- Delete flow (already has pending state).

## Git workflow

- Branch: `codex/042-row-action-feedback`
- Commits: `feat(notes): flip status optimistically with a check-in cue`,
  `fix(notes): confirm copy in place without reflowing the list`,
  `fix(notes): mark tag removal and editor close as busy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Optimistic status with rollback

Change `onToggleStatus(note: NoteDto)` to
`onSetStatus(noteId: string, status: NoteStatus): Promise<void>` in
`note-row.tsx`, `note-list.tsx`, `note-screen.tsx`, `note-row.test.tsx` and
`note-list.test.tsx`. `NoteScreen` sends exactly the requested status and
announces after success.

In `NoteRow`: `effective = optimisticStatus ?? note.status`. On click,
`next = effective === 'done' ? 'open' : 'done'`, set `optimisticStatus = next`,
bump a `requestSeq` ref, and `await onSetStatus(note.id, next)`. When a promise
settles (resolve or reject), clear `optimisticStatus` only if its sequence
number is still the latest, so the row falls back to `note.status`. Use
`effective` for the article's `data-status`, the dot's `data-status`,
`aria-pressed`, the label and `statusSummary`, so the muted surface and
strike-through (`app.css:489-493, 567-572`) flip too. Set `aria-busy` while any
request is in flight; never disable the button (a second click must retarget).
`NoteRow` is `memo`; local state is fine.

**Verify**: two new `note-row.test.tsx` cases: (a) the dot has
`data-status="done"` before the promise resolves and returns to `open` after a
rejection; (b) two clicks before resolution call `onSetStatus` with `'done'`
then `'open'`, and the row ends in the prop's status → pass.

### Step 2: Check-in cue

Wrap the check icon:

```tsx
<AnimatePresence initial={false} mode="wait">
  {status === 'done' ? (
    <motion.span
      key="check"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.9)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.9)' }}
      transition={instant ? { duration: 0 } : reduceMotion ? { duration: 0.12 } : surfaceTransition}
      style={{ display: 'grid' }}
    >
      <IconCheck />
    </motion.span>
  ) : null}
</AnimatePresence>
```

Use `useReducedMotion()` in `NoteRow`. Do not call `useKeyboardMotion()` in
`NoteRow`. In the click handler, record
`instant = document.documentElement.dataset.inputModality === 'keyboard'` in
the same state update as `optimisticStatus` (keyboard-initiated actions never
animate).

**Verify**: `bun run --cwd apps/desktop test -- src/features/notes/note-row.test.tsx` → pass; e2e reduced-motion test (`desktop remains usable at effective 360 pixels and reduced preferences`) → pass.

### Step 3: Copy confirmation in place

- Success: swap the copy button icon to `IconCheck` for 2.5 s using the same
  `AnimatePresence mode="wait"` pattern (opacity + scale 0.9→1, 120 ms, ease
  `[0.2, 0, 0, 1]`; reduced motion opacity only). Keep the `sr-only` live-region
  text so the announcement still fires (`note-screen.tsx:179` `announce(message)` already does this).
- Set `data-copied` on the copy button while `copyState.status === 'copied'`
  and add `.note-copy-button[data-copied] { opacity: 1; }` so the check stays
  visible when the pointer leaves the row.
- Error: keep the inline `<p className="inline-error note-copy-state" role="alert">`
  inside the row. The row reflows once for errors only. The error stays until
  the next copy, expansion or delete, as it does today.
- Remove the success branch from `note-copy-state` rendering; `copyState.status === 'copied'` now drives only the icon swap.

**Verify**: `note-screen.test.tsx`/`note-row.test.tsx`: after a successful copy, no element with class `inline-success` exists and the copy button shows the check icon; after 2.5 s (fake timers) it shows the copy icon → pass.

### Step 4: Busy states for tag removal and editor close

- `removeTag` (both the chip button and the Backspace path): track
  `pendingTag`, put `aria-busy` plus `aria-disabled` (not `disabled`, which
  would drop focus to `<body>`) on that chip's remove button, and ignore repeat
  activation while pending. After success, focus `#note-tags-${note.id}`.
- Close: `aria-busy={closing}`. If `flushDraft()` returns `false`, make `Tabs`
  controlled, switch it to `write`, and in the next animation frame focus the
  Retry button. The existing `role="alert"` announces the failure; add no new
  message.

**Verify**: `note-editor.test.tsx` new cases: removing a tag marks its button
busy until resolution; close from Preview with a failing save switches to
Write and focuses Retry → pass.

### Step 5: Contract

In `docs/UX.md` "Motion and materials", after the sentence ending "…with
symmetric exit;", insert: "the status check and the copy confirmation icon
swap use opacity plus scale `.9`→`1` over 120 ms with symmetric exit, are
instant for keyboard input, and become opacity-only under reduced motion;".

**Verify**: `grep -n "copy confirmation icon" docs/UX.md` → one match.

## Test plan

- Unit cases listed per step (6 new).
- Existing tests that change: rewrite `note-screen.test.tsx` "clears copied row
  feedback after its transient window" to assert that
  `.note-copy-button[data-copied]` exists, then is gone after 2 500 ms. In
  `release.spec.ts` (`direct copy and irreversible Delete keep one-Note scope
  explicit`, line ~133) replace the `.note-copy-state` assertion with
  `await expect(page.getByRole('button', { name: 'Copy Agent handoff as Markdown' })).toHaveAttribute('data-copied', '')`
  and assert the row's `getBoundingClientRect().height` is unchanged after copy.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "inline-success note-copy-state" apps/desktop/src/features/notes/note-row.tsx` → nothing
- [ ] `grep -n "aria-busy" apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-editor.tsx` → ≥ 3 matches
- [ ] `plans/README.md` status row updated

## STOP conditions

- A status change reorders Notes (it should not: order is `created_at` desc,
  `workspace/model.rs:269`): STOP and report.
- The virtualizer re-measures the row when the icon swaps (it should not; the
  button size is fixed at 2.75rem): if the e2e height assertion fails, report.

## Maintenance notes

- Plan 048 adds a reduced-motion e2e for the status-dot cue; Plan 046's row `CmdOrCtrl+C` relies on the copy icon swap. Extract a small `useTransientIcon` hook only if a third consumer appears.
- Reviewer: rapid double-click on the status button must end in the server state, never stuck optimistic.
