# Plan 005: Deliver note CRUD, sections, search, multi-selection, merge, trash, and undo

> **Executor instructions**: Follow every step and verification gate. Stop on
> any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: inspect `apps/desktop/src/features`,
> `apps/desktop/src/app`, `apps/desktop/src/routes/notes.tsx`,
> and Workspace command variants. The expected state is a read-only shell plus
> the complete Plan 003 domain commands. Stop if note mutations already bypass
> the typed Workspace client or if domain semantics differ from `docs/PRODUCT.md`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 003 and 004
- **Category**: direction, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

This is the core daily workflow: capture rough prompt ideas, organize and edit
them, select several without fighting the mouse, then safely merge or remove
them. Keyboard semantics and recoverable bulk actions are part of correctness,
not polish. The implementation must remain fast at tens of thousands of notes
without hiding domain mutations in React components.

## Current state

- Workspace commands already implement validated, revision-checked note and
  section mutations, merge transactions, trash, restore, and permanent delete.
- The shell has localized routes and read-only snapshots.
- No command registry, note feature state, editor, list virtualization, search,
  selection model, mutation client, undo UI, or trash view exists.
- `Selection` is ordered ephemeral UI state; it is never persisted.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Feature tests | `bun run test:desktop -- notes selection search commands` | all targeted tests pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Quality | `bun run check` | exit 0 |
| Domain regression | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace` | all pass |

## Suggested executor toolkit

- Use `shadcn` for command, dialog, alert-dialog, checkbox, textarea, empty,
  dropdown, and toast composition.
- Use `vercel-react-best-practices` for virtual row state and render boundaries.
- Use `apple-design` for selection-bar, dialog, and undo transitions; preserve
  immediate response, interruption, symmetric paths, and keyboard semantics.
- Review `docs/PRODUCT.md`, `docs/UX.md`, and the generated Workspace bindings.

## Scope

**In scope**:

- `apps/desktop/src/app/commands/command-registry.ts`,
  `apps/desktop/src/app/commands/command-provider.tsx`,
  `apps/desktop/src/app/commands/default-commands.ts`
- `apps/desktop/src/lib/ipc/workspace-client.ts`,
  `apps/desktop/src/app/workspace-context.tsx`
- `apps/desktop/src/features/notes/note-screen.tsx`, `note-toolbar.tsx`, `note-list.tsx`,
  `note-row.tsx`, `note-editor.tsx`, `note-preview.tsx`, `section-manager.tsx`,
  `selection-bar.tsx`, `merge-dialog.tsx`, `trash-view.tsx`, `undo-toast.tsx`
- `apps/desktop/src/features/notes/selection-model.ts`, `search.ts`, `note-view-model.ts`,
  `draft-controller.ts`, `note-commands.ts`
- `apps/desktop/src/routes/notes.tsx`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- Tests beside the files above
- `package.json`, `bun.lock` only if the pinned Virtual/Hotkeys packages were not
  already added in Plan 002

**Out of scope**:

- Clipboard writing and copy presets, global shortcuts, selected-text capture,
  charts, sync, tags, rich text, attachments, AI calls, and permanent deletion
  without explicit confirmation.
- Changes to persisted schemas or command semantics unless a Plan 003 regression
  proves the contract cannot be implemented.

## Git workflow

- Branch: `codex/005-note-workflow`
- Commits: `feat(notes): add command and selection models`,
  `feat(notes): add editing and organization`,
  `feat(notes): add safe bulk workflows`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Create the app-owned command registry and mutation path

Wrap `@tanstack/react-hotkeys 0.10.0` behind `command-registry.ts`. A command has
stable ID, localized label/description keys, category, default in-app shortcut,
availability predicate, execute function, and optional destructive flag. The
rest of the app never imports TanStack Hotkeys directly. Register one Hotkeys
provider at the shell and expose a command palette and shortcut-help surface.

Add `executeWorkspaceCommand` to WorkspaceProvider. It sends the current
revision, applies the returned snapshot, serializes in-flight writes, and
handles typed stale-revision conflicts by refreshing and asking the user to
retry. Do not optimistically commit destructive or merge mutations. Draft text
may be optimistic but must remain recoverable after rejection.

**Verify**: `bun run test:desktop -- commands workspace-context` -> shortcut scope,
editable-target suppression, availability, serialization, conflict refresh,
and cleanup tests pass.

### Step 2: Implement a deterministic selection model

In pure `selection-model.ts`, implement active ID, anchor ID, ordered selected
IDs, visible-order range selection, toggle, select-all-visible, clear, and
reconciliation when filtering/deleting changes visible IDs. Match desktop rules:

- click selects one; Cmd/Ctrl-click toggles; Shift-click extends a range;
- arrow changes active row; Shift+arrow extends;
- Space toggles active; Cmd/Ctrl+A selects visible results;
- Escape clears; focus does not silently select;
- hidden filtered notes are not acted on by select-all-visible.

Use pure reducers with exhaustive tests before rendering rows.

**Verify**: `bun run test:desktop -- selection-model` -> every mouse/keyboard sequence,
filter reconciliation, empty list, deleted anchor, and ordered output passes.

### Step 3: Build fast search, section navigation, and virtualized rows

Derive view models from the Workspace snapshot. Normalize Unicode case and
whitespace, search section name plus Markdown body, and debounce only the input
to expensive filtering, not keyboard selection. Start with deterministic
substring/token matching; do not add a search package without a measured need.

Render results with `@tanstack/react-virtual`. Keep virtualizer concerns inside
`note-list.tsx`; selection and commands use stable note IDs, never row indexes.
The section rail shows counts for open, done, and trash. Provide empty states for
empty workspace, empty section, no search result, and trash.

**Verify**: `bun run test:desktop -- search note-list` -> Unicode, Markdown, section,
status, trash filters, 20,000-row virtualization, and stable-ID selection pass.

### Step 4: Add create, edit, reorder, section, and status workflows

Build a compact Markdown editor with textarea, read-only preview, autosave after
a short idle delay, explicit save on blur/navigation, and visible dirty/error
state. Escape reverts only the current unsaved edit after confirmation when
needed. Do not build WYSIWYG. Preview must escape raw HTML by default; if no
already-pinned safe renderer exists, render a conservative text/structure
preview rather than `dangerouslySetInnerHTML`.

Add create, rename, reorder, move-to-section, mark open/done, section create/
rename/reorder/delete, and keyboard navigation commands. Section deletion must
require choosing a destination for contained notes or be blocked. Do not rely on
drag and drop; every reorder/move has a keyboard-accessible menu command.

**Verify**: `bun run test:desktop -- note-editor section-manager note-commands` -> draft
recovery, save conflict, safe preview, all mutations, and keyboard alternatives pass.

### Step 5: Add recoverable bulk actions and merge preview

Show `selection-bar.tsx` only for non-empty selection. Actions: mark done/open,
move, copy placeholder disabled until Plan 006, merge, and move to trash. Bulk
trash opens one alert with item count and section context, then offers an undo
toast that calls restore with the returned transaction payload. Trash view
supports restore and separately confirmed permanent deletion.

Merge opens `merge-dialog.tsx` with source order, target section, and an exact
Markdown preview using the deterministic `\n\n---\n\n` Workspace separator. Confirm creates one composite note and
trashes sources in one Workspace transaction. On failure, no partial UI state is
shown. On success, select and focus the new note and offer undo.

Materialize the selection bar from the selected rows' side of the workspace with
the shared surface profile; hide it along the exact reverse path. Buttons use
shared press feedback on pointer/key down. Merge/trash dialogs and the undo toast
must accept rapid cancel/reopen/undo while animating, retarget from current values,
and never delay command execution or focus restoration until motion completes.
Use one translucent transient layer at most, with the opaque accessibility
fallback from Plan 004.

**Verify**: `bun run test:desktop -- selection-bar merge-dialog trash-view undo-toast` ->
cancel, confirm, count pluralization in EN/FR, transaction failure, success focus,
undo, and permanent-delete confirmation pass.

### Step 6: Complete keyboard help and full-state UX

Register named commands for search focus, new note, edit, save, toggle done,
select range/all, move, merge, trash, undo, command palette, shortcut help, and
route navigation. Ensure commands are suppressed or remapped while typing. Render
shortcuts with shadcn `Kbd` and platform-aware Meta/Ctrl labels. Add loading,
empty, stale-conflict, validation, I/O, recovery-required, and offline-local
states without generic error copy.

**Verify**: navigate the entire notes workflow with keyboard only in a component
test and in `bun run tauri:dev`; focus remains visible and Escape closes only the
topmost active surface.

## Test plan

- Pure exhaustive selection and search tests.
- Component tests for 20,000 note rows, keyboard navigation, draft conflicts,
  section constraints, selection bar, merge, trash, undo, and locale pluralization.
- Interaction tests interrupt selection-bar/dialog/toast motion midway and prove
  correct final state, focus, and command count under rapid repeated input.
- Workspace integration tests prove UI batches map to exactly one Rust command.
- Manual smoke in all themes/locales at 1280x800 and 800x600.
- Verification: Quality and Domain regression commands both exit 0.

## Done criteria

- [ ] CRUD, sections, Markdown editing, search, and keyboard navigation work.
- [ ] Mouse and keyboard multi-selection share one pure model.
- [ ] 20,000 notes do not render 20,000 DOM rows.
- [ ] Virtualized rows never use Motion layout animation or per-row blur; selection
  feedback stays compositor-only and does not disturb measurement.
- [ ] Bulk completion, move, trash, restore, and merge are transactional.
- [ ] Delete is recoverable; permanent delete has a separate confirmation.
- [ ] No React component imports Tauri, TanStack Hotkeys, or filesystem APIs directly.
- [ ] EN/FR strings, focus, empty, loading, and error states are complete.
- [ ] Frontend and Workspace regression suites pass; this plan is `DONE`.

## STOP conditions

- Workspace bindings lack a required transactional command or undo payload.
- Safe Markdown preview requires permitting raw HTML or an unreviewed dependency.
- TanStack Hotkeys cannot suppress commands reliably in editable controls and the
  app-owned registry cannot compensate.
- Virtualization breaks stable focus/selection after two implementation fixes.
- A requested section delete could orphan notes.

## Maintenance notes

- Command IDs are public internal contracts used by settings and help; migrate
  them deliberately.
- Keep selection pure and index-free. Sorting/filtering bugs often begin when a
  row index leaks into commands.
- Measure before replacing substring search; the local model avoids premature
  search infrastructure.
