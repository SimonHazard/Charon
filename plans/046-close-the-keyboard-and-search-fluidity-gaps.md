# Plan 046: Close the keyboard and search fluidity gaps in the shelf and editor

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/note-screen.tsx apps/desktop/src/features/notes/note-screen.test.tsx apps/desktop/src/features/notes/note-list.tsx apps/desktop/src/features/notes/note-list.test.tsx apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-row.test.tsx apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/features/notes/note-editor.test.tsx apps/desktop/src/components/shelf-chrome.tsx apps/desktop/src/features/notes/markdown-help.tsx apps/desktop/messages docs/UX.md apps/desktop/e2e/release.spec.ts && git status --short -- apps/desktop docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 041-045 land
> first and touch several of these files; their edits are expected drift.
> Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition. If uncommitted user changes touch an in-scope
> file, STOP until they are committed.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 042 (in-place copy confirmation that row `CmdOrCtrl+C` relies on)
- **Category**: bug (UX)
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

Five small gaps make the keyboard-first shelf feel unfinished: expanding a
row near the bottom opens the editor below the fold and the caret lands in an
invisible field; Escape in the search field does nothing and the result count
is never announced although the UX contract requires it; the list has no
Home/End; Copy as Markdown, the product's purpose, has no keyboard route while
Delete has one; and the editor has no Cmd/Ctrl+S. Each is a few lines and
together they close the keyboard contract in `docs/UX.md`.

## Current state

- `note-list.tsx:78-111` `moveFocus` handles `ArrowDown`/`ArrowUp` only; `:103` `virtualizer.scrollToIndex(nextIndex, { align: 'auto' })` is the only scroll call in the app; rows carry `data-index` and the activation button `data-note-focus={note.id}`.
- `note-screen.tsx:215-225` `expandNote` sets state only; `note-editor.tsx:133-138` focuses the textarea with `preventScroll: true`.
- `note-screen.tsx:156-166` window `keydown`: `Cmd/Ctrl+F` focuses `searchRef` unless an alert dialog is open. `clearSearch` at `:340-344`. Live region `:351-353`; `announce` `:106-115` (one shared live region: a later announcement overwrites an earlier one); `deferredQuery` `:96`; `notes` memo `:97-104` (it re-adds the expanded Note even when it does not match).
- `note-row.tsx:112-123` activation button `onKeyDown` handles `Delete`/`Backspace` → `onDelete`. Its `aria-describedby` is only the Note summary; the local-paths disclosure span is attached to the copy button (`:169`). A row shortcut targets the one focused Note, like Delete (ADR 0013), so it is not Note Selection.
- `note-editor.tsx:329-341` `onKeyDown` handles Escape only; `save()` defined at `:141+` returns early when nothing changed (`:143`); save-state live span `:351-353`.
- Help popover rows use `formatShortcut(accelerator, platform, labels)` from `src/lib/shortcut-label.ts` (Plan 035).
- `docs/UX.md` "Keyboard" section lists: Arrow keys, Enter/Space, Delete/Backspace, `CmdOrCtrl+F`, Escape ("closes the topmost surface first"), `CmdOrCtrl+A` stays native. Accessibility section: "Note counts … are announced."
- Messages: `note_search_clear`, `note_empty_search_*` exist; no count message.
  Plurals use inlang message-format declarations, not ICU strings; see the
  existing `"declarations": ["input count", "local countPlural = count: plural"]`
  entry in `apps/desktop/messages/en.json` (around line 118).
- On macOS, Tauri's default Edit menu also binds Cmd+C.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/notes` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**: files in the drift-check list.

**Out of scope**: match highlighting inside snippets (not worth it inside a virtualized list; revisit on user reports); configurable shortcuts.

## Git workflow

- Branch: `codex/046-keyboard-search-fluidity`
- Commits: `fix(notes): scroll the expanded editor into view`, `feat(notes): escape clears search and counts are announced`, `feat(notes): home, end, copy and save shortcuts`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Expanded editor stays on screen

`note-list.tsx`: add a `useLayoutEffect` on `expandedId`: when it becomes
non-null, after the row is measured (`requestAnimationFrame` once), call
`virtualizer.scrollToIndex(expandedIndex, { align: 'start' })` if the row's
bottom is below the scroll element's visible bottom. Keep
`preventScroll: true` on the textarea focus (scrolling is now explicit).

**Verify**: jsdom returns zero-size rects, so check in e2e (Chromium) at
400×480 with `?fixture=demo&notes=40`: focus the last row (`End`, Step 3),
press `Enter`, and assert
`await expect(page.locator('[data-note-editor] textarea')).toBeInViewport()` → pass.

### Step 2: Escape clears search; count announcement

- Search input `onKeyDown`: `Escape` with no IME composition while
  `query || tag` → `preventDefault`, `stopPropagation`, `clearSearch()`.
  Otherwise do nothing (a dialog or popover holding focus never reaches it).
- Add `note_search_results` with the repo's plural format:
  en `[{ "declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"], "match": { "countPlural=one": "{count} matching note", "countPlural=other": "{count} matching notes" } }]`;
  fr same shape with `"{count} note correspondante"` / `"{count} notes correspondantes"`.
- In `NoteScreen`, compute `matchCount = index.filter(...).length` separately
  from the pinned-editor merge and keep it in a ref. A `useEffect` on
  `[deferredQuery, tag]` only: when either is active, wait 300 ms (one timer
  ref, cleared on change and on unmount), then
  `announce(m.note_search_results({ count: matchCountRef.current }))`. Do not
  depend on `notes.length`, or the count overwrites "Note deleted." and
  "Note added." in the shared live region.

**Verify**: `note-screen.test.tsx` new cases: Escape in the search field clears query and tag and keeps focus; typing a query announces the count once after 300 ms (fake timers); deleting a Note while a query is active still announces "Note deleted." → pass.

### Step 3: Home/End and a copy accelerator

- `note-list.tsx` `moveFocus`: handle `Home` → index 0, `End` → last, `PageDown`/`PageUp` → ±10 (clamped), all only when the target matches `[data-note-focus]` and no modifier is held.
- `note-row.tsx` activation `onKeyDown`: `(event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !event.repeat && event.key.toLocaleLowerCase() === 'c' && (window.getSelection()?.isCollapsed ?? true)` → `preventDefault()`, `void onCopy(note.id)`. Add `aria-keyshortcuts="Meta+C Control+C"`. When text is selected, leave native copy alone. Plan 042's icon swap and the live region give feedback; the local-paths disclosure is covered by the Help row in Step 4.

**Verify**: `note-list.test.tsx`: Home/End move focus to first/last rows across virtual mounts; `note-row.test.tsx`: Cmd+C on a focused row calls `onCopy` and does not when a selection exists → pass.

### Step 4: Cmd/Ctrl+S in the editor and the Help rows

`note-editor.tsx` `onKeyDown`: `(metaKey || ctrlKey) && key.toLocaleLowerCase() === 's'` → `preventDefault`, `void save()`; the save-state span already announces "Saved".

In `shelf-chrome.tsx`, after the composer row, add a `shortcut_help_notes_title`
("Notes" / "Notes") subheading and rows whose `<kbd>` comes from
`formatShortcut(accelerator, capabilities?.platform ?? (isMacos ? 'macos' : 'unknown'), labels)`:

- `CmdOrCtrl+C` → `note_shortcut_copy` ("Copy the focused note as Markdown. Managed local attachment paths are included." / "Copier la note sélectionnée en Markdown. Les chemins locaux des pièces jointes gérées sont inclus.")
- `CmdOrCtrl+S` → `note_shortcut_save` ("Save the open note now." / "Enregistrer maintenant la note ouverte.")
- `Home` / `End` → `note_shortcut_home_end` ("First or last note." / "Première ou dernière note.")
- `Esc` → `note_shortcut_clear_search` ("Clear search and tag filter." / "Effacer la recherche et le filtre de tag.")

Add the same shortcuts (plus PageUp/PageDown) to the `docs/UX.md` keyboard contract.

**Verify**: `note-editor.test.tsx`: type a change, press Cmd+S → `onSave` called once → pass; `bun run check` → exit 0; Chromium e2e → pass.

### Step 5: Native check

On macOS (`bun run tauri:dev`) and Windows if available: a focused row plus
Cmd/Ctrl+C with no selection puts the Note's Markdown on the clipboard exactly
once; with text selected in Preview, the native copy is kept. Record the
result, then delete `apps/desktop/src-tauri/target/debug`.

## Test plan

- Unit cases listed above; e2e: extend `Arrow keys retain row focus through virtualized mounts` with End/Home, plus the Step 1 in-viewport case.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "'Home'\|'End'" apps/desktop/src/features/notes/note-list.tsx` → matches
- [ ] `grep -n "note_search_results" apps/desktop/messages/en.json apps/desktop/messages/fr.json` → 1 each
- [ ] `grep -nE "toLocaleLowerCase\(\) === 's'|key === 's'" apps/desktop/src/features/notes/note-editor.tsx` → one match
- [ ] Step 5 result recorded
- [ ] `docs/UX.md` keyboard section lists Home/End, PageUp/PageDown, `CmdOrCtrl+C` (row), `CmdOrCtrl+S` (editor), Escape (search)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `scrollToIndex` on the expanded row fights the `rangeExtractor` pin (`note-list.tsx:61-67`) and produces a scroll loop in the test: report with the observed sequence.
- Base UI intercepts Escape before the search input handler when a tooltip is open: accept that tooltips close first (topmost surface rule) and report.

## Maintenance notes

- Any new shortcut must be added to the Help popover and `docs/UX.md` in the same change.
- Reviewer: Cmd+C on a row with selected text must still copy the selection.
