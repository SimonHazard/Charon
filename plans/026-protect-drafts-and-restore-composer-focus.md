# Plan 026: Keep the composer focused, never lose a draft, and tell the truth about saves

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src/features/notes apps/desktop/src/app/workspace-context.tsx apps/desktop/src/app/workspace-context.test.tsx apps/desktop/src/test apps/desktop/messages apps/desktop/e2e/release.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches autosave and the command queue; keep every existing editor/composer test green)
- **Depends on**: none
- **Category**: bug (frontend correctness / data safety)
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Charon's promise is "type, Enter, trust it landed" and "closing the editor
never silently drops unsaved text" (`docs/UX.md:216`). Reading the React code
shows:

1. **The composer loses focus after every capture.** `CaptureInput` sets
   `disabled={pending}` on the focused input before awaiting `onCreate`; the
   browser blurs a disabled element and nothing refocuses it. Every Enter sends
   the keyboard user to `<body>`.
2. **Drafts can be lost by scrolling.** The editor's draft lives in
   `useReducer` inside `NoteEditor`, which is mounted inside a virtual row.
   Scroll an expanded Note past `overscan: 10` rows and the row unmounts: the
   650 ms autosave debounce is cleared without flushing, `onDirtyChange(false)`
   releases the workspace-switch block, and scrolling back re-mounts the editor
   from `note.body`. Closing the window during the debounce loses the same
   keystrokes (no `onCloseRequested`/`beforeunload` flush).
3. **"Saved" is announced after a failed save.** `saveState` handles
   `'saving'` and `'dirty'` and falls through to `note_editor_saved()` for
   `'error'`, so the polite live region says "Saved" while `FieldError` shows
   the failure. After one failure autosave never re-arms (`draft.status !== 'dirty'`).
4. **Revision hygiene.** `snapshotRef.current` is written inside a `setState`
   updater (impure; can run twice/discarded under StrictMode/concurrent
   rendering), and `applySnapshot` accepts older revisions while the event path
   guards monotonicity — a slow `snapshot()` can rewind the revision and cause
   a spurious `stale_revision`.
5. **External edits are invisible until the next command.** Rust only drains
   the watcher inside `snapshot`/`execute`/`health`; the frontend never calls
   `snapshot()` on window focus/visibility (Preferences does exactly that for
   its own state). Editing a Note in another app and returning to Charon shows
   stale content until some command runs.

## Current state

- `apps/desktop/src/features/notes/capture-input.tsx:27-40` — `submit()`:
  `setPending(true)` → `await onCreate(body)` → `setValue('')`; `:56` `disabled={pending}`;
  `:15,34` — `onCreated?.()` prop exists but no caller passes it
  (`note-screen.tsx:334-339`). `capture-input.test.tsx:28` claims to test
  refocus but only asserts the value.
- `apps/desktop/src/features/notes/note-editor.tsx:28` — `AUTOSAVE_DELAY_MS = 650`;
  `:61-69` draft reducer state; `:80-81` `const draftRef = useRef(draft); draftRef.current = draft;`
  (write during render); `:83-86` dirty effect depends on `[draft, onDirtyChange]`;
  `:88-93` reconcile effect keeps the draft when dirty; `:99-118` `save()`;
  `:123-127`:
  ```tsx
  useEffect(() => {
    if (draft.status !== 'dirty') return;
    const timeout = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft.status, save]);
  ```
  `:184-192` `saveState` (no `'error'` branch).
- `apps/desktop/src/features/notes/draft-controller.ts` — `DraftState.status: 'idle'|'dirty'|'saving'|'error'`, `hasUnsavedDraft`.
- `apps/desktop/src/features/notes/note-list.tsx:50-56` — TanStack Virtual
  `overscan: 10`; only virtual rows are rendered (`:92`).
- `apps/desktop/src/app/workspace-context.tsx:82-85` `applySnapshot` (no
  monotonic guard); `:93-135` `executeWorkspaceCommand` uses
  `snapshotRef.current.revision` as `expectedRevision` and refetches on
  `stale_revision`; `:243-253` event subscription writes `snapshotRef.current`
  inside the `setState` updater; `:87-91` `refreshWorkspace()` exists.
- `apps/desktop/src/features/preferences/preferences-context.tsx:94-98` —
  the focus/visibilitychange refresh pattern to copy.
- Tests: `note-editor.test.tsx` (163 lines; autosave failure preservation at
  `:191`), `capture-input.test.tsx`, `note-list.test.tsx`,
  `workspace-context.test.tsx`; fixture client in `test/workspace-fixture.ts`
  (subscription is a no-op stub at `:39` — extend it to expose an `emit`).
- Messages: `note_editor_saved`, `note_editor_saving`, `note_editor_dirty`,
  `note_editor_save_error` exist; a `note_editor_save_failed` status label may
  be needed (EN/FR).

Conventions: Vitest + Testing Library; all copy via `m.*`; effects must clean
up; no `any`; Base UI `render` API; keyboard focus contracts in
`docs/UX.md` "Keyboard contract".

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test:desktop` | all pass |
| E2E Chromium | `bun run --cwd apps/desktop test:e2e -- --project=chromium` | all pass |
| Lint | `bun run lint` | exit 0 (if it fails only on `.claude/settings.local.json`, see Plan 028) |

## Scope

**In scope**:
- `apps/desktop/src/features/notes/capture-input.tsx`, `capture-input.test.tsx`
- `apps/desktop/src/features/notes/note-editor.tsx`, `note-editor.test.tsx`
- `apps/desktop/src/features/notes/note-screen.tsx` (wiring only)
- `apps/desktop/src/app/workspace-context.tsx`, `workspace-context.test.tsx`
- `apps/desktop/src/test/workspace-fixture.ts`
- `apps/desktop/messages/en.json`, `fr.json` (one status key if needed)
- `apps/desktop/e2e/release.spec.ts` (add assertions only)

**Out of scope**:
- Rust IPC or Workspace code.
- Search performance (Plan 031), a11y semantics (Plan 029), per-note conflict
  UI for external edits (recorded as a follow-up below).
- Motion/animation code.

## Git workflow

- Branch: `codex/026-draft-and-focus-safety`
- Commit message: `fix(desktop): keep composer focus, flush drafts, and report failed saves`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Keep the composer focused across submit

In `capture-input.tsx` replace `disabled={pending}` on the `<Input>` with
`readOnly={pending}` and `aria-busy={pending}`; keep the submit button's
`disabled`. In `submit()`'s `finally`, call `inputRef.current?.focus()`.
Delete the unused `onCreated` prop and its call (no consumer). Update
`capture-input.test.tsx` "preserves and refocuses failed text" to assert
`document.activeElement === input` after both a resolved and a rejected
`onCreate`, without relying on `userEvent.type` re-focusing.

**Verify**: `bun run test:desktop -- capture-input` → passes with the two activeElement assertions.

### Step 2: Flush the draft on unmount and on window close

In `note-editor.tsx`:
- Replace the render-time `draftRef.current = draft;` with a `useEffect(() => { draftRef.current = draft; }, [draft])`.
- Add an unmount effect that flushes: `useEffect(() => () => { const d = draftRef.current; if (hasUnsavedDraft(d) && !inFlight.current) void onSaveRef.current(d.value); }, [])`
  where `onSaveRef` mirrors the latest `onSave` prop. This must **not** run on
  every re-render (empty deps) and must not double-save (guard on `inFlight`).
- Register a window-close flush at the screen level (`note-screen.tsx` or a
  small hook): in Tauri, `getCurrentWindow().onCloseRequested(async (event) => { if (dirty) { event.preventDefault(); await flush(); getCurrentWindow().destroy(); } })`
  from `@tauri-apps/api/window` (needs `core:window:allow-destroy`? — check
  `gen/schemas` for `core:window:default`; if not included, add the specific
  permission in `capabilities/main.json` and mention it in the commit). If the
  permission surface is unclear, use `window.addEventListener('beforeunload', ...)`
  to trigger a synchronous best-effort flush and record the limitation.
- Change the dirty effect deps to a boolean:
  `const dirty = hasUnsavedDraft(draft) || draft.status === 'saving'; useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);`

Add a test in `note-editor.test.tsx`: type into the editor, unmount before
650 ms, assert `onSave` was called once with the typed body. Add a
`note-list.test.tsx` case: render with `expandedId` set, scroll the parent so
the expanded row leaves the overscan window, assert the save callback fired.

**Verify**: `bun run test:desktop -- note-editor note-list` → pass, including the two new tests.

### Step 3: Report failed saves and re-arm autosave

- `saveState`: add an explicit `'error'` branch returning
  `m.note_editor_save_failed()` (add EN "Not saved" / FR "Non enregistré" if
  no suitable key exists) and make the mapping exhaustive over
  `DraftState['status']` (a `switch` with `never` check).
- Autosave effect: re-arm when `draft.status === 'error'` with a bounded
  backoff (e.g. retry once after 3 s, then wait for the next change/blur), and
  add a "Retry" `Button` next to `FieldError` mirroring the attachment error
  block's pattern.

Add tests: after a rejected `onSave`, the live region text is not "Saved";
clicking Retry calls `onSave` again.

**Verify**: `bun run test:desktop -- note-editor` → pass.

### Step 4: Revision hygiene in the workspace context

In `workspace-context.tsx`:
- Event subscription: compute against `snapshotRef.current` **outside** the
  updater, assign the ref there, then `setState` with a plain value.
- `applySnapshot`: ignore a snapshot whose `revision` is lower than
  `snapshotRef.current?.revision` (return early), except when the Workspace
  identity changed (`workspaceId` differs) — then accept.
- Route `refreshWorkspace` through `writeQueueRef` so reads serialize with
  in-flight writes.

Extend `test/workspace-fixture.ts` so `subscribe` captures the listener and
exposes `emit(event)`. Add tests in `workspace-context.test.tsx`: an
older-revision event is ignored; a newer one updates; a late `snapshot()`
resolving with an older revision does not rewind `snapshotRef`.

**Verify**: `bun run test:desktop -- workspace-context` → pass.

### Step 5: Refresh the Workspace on focus/visibility

In `workspace-context.tsx` (or `note-screen.tsx`), copy the pattern from
`preferences-context.tsx:94-98`: on `window` `focus` and `document`
`visibilitychange` (when visible), call `refreshWorkspace()` if the state is
`ready`/`warning`, debounced to at most once per second. Because Rust drains
the watcher inside `snapshot()`, this surfaces external edits without a
command. Add a test asserting `client.snapshot` is called on a `focus` event.

**Verify**: `bun run test:desktop -- workspace-context` → pass; `bun run --cwd apps/desktop test:e2e -- --project=chromium` → pass.

## Test plan

- New/updated unit tests in Steps 1-5 (≥7 cases).
- E2E: add one assertion in `release.spec.ts` that after submitting the
  composer, `document.activeElement` is the composer input.
- Manual (host): edit a Note in Charon, edit the same file in a text editor,
  click back into Charon → the list refreshes.

## Done criteria

- [ ] `bun run typecheck`, `bun run test:desktop`, Chromium E2E pass
- [ ] Composer input keeps focus after Enter (unit + e2e)
- [ ] Draft flushes on editor unmount and on window close; `note_editor_saved` never renders while `draft.status === 'error'`
- [ ] No ref assignment inside a `setState` updater or during render in `workspace-context.tsx`/`note-editor.tsx` (`grep -n "snapshotRef.current = " apps/desktop/src/app/workspace-context.tsx` shows only assignments outside updaters)
- [ ] `refreshWorkspace` is called on window focus/visibility
- [ ] `plans/README.md` status row for 026 updated

## STOP conditions

- The unmount flush double-saves or races the explicit close-save in existing
  tests — report rather than loosening assertions.
- `onCloseRequested` needs a capability that would widen the ACL beyond one
  `core:window:allow-*` permission — use `beforeunload` and record it.
- Serializing `refreshWorkspace` through the write queue deadlocks a test
  (queue awaiting itself) — report.

## Maintenance notes

- Follow-up (not in this plan): when an external change touches the Note being
  edited while the draft is dirty, the autosave still wins silently (it sends
  the newest Workspace revision). A per-Note conflict choice ("keep mine /
  reload theirs") needs a Rust-side per-Note precondition (e.g. `expected
  updated_at` on `UpdateNote`) — record as a candidate ADR/plan.
- Keep `overscan` at 10 until Plan 029 fixes arrow-key focus for rows outside
  the virtual window.
