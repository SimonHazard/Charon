# Plan 049: Make Done and expanded Note rows legible — visible chips, title-only strike, an Edit control that reports its state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-row.test.tsx apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts docs/UX.md && git status --short -- apps/desktop/src docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 040-042 land
> first and edit `note-row.tsx`, `app.css` and `docs/UX.md`; that is expected
> drift. Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition. Refer to `app.css` rules by selector.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 041 (same `app.css` row rules), 042 (same `note-row.tsx` status code)
- **Category**: bug (UX)
- **Planned at**: commit `242d51e`, 2026-09-23 (UX/UI review in the browser fixture)

## Why this matters

Three details make row state harder to read than the contract intends:

1. On a Done row, Tag chips lose their pill. Chips paint `var(--secondary)`,
   which is `var(--surface)`, and a Done row's background is also
   `var(--surface)`. In the demo fixture the "Product" chip on "Capture
   contract" renders as bare text, while Open rows show grey pills. The chip
   is still a button (it filters by Tag), so it should look like one.
2. Done strikes through both the title and the preview line. ADR 0012
   decision 1 and `docs/UX.md` define Done as "a checked control, muted
   surface, and struck-through primary text"; striking the snippet too makes
   the muted row harder to scan without adding information.
3. The Edit (pencil) button and the row activation button expand an inline
   editor but never expose `aria-expanded`, so assistive technology cannot
   tell that the Note is open. On an already expanded row, clicking Edit does
   nothing visible (`expandNote` just sets the same id). `Button`'s `ghost`
   variant already styles `aria-expanded:` as pressed, so exposing the state
   also gives a visible pressed pencil for free.

## Current state

- `packages/theme/src/tokens.css` (aliases block): `--secondary: var(--surface);`.
- `apps/desktop/src/styles/app.css`:

```css
.note-row[data-status="done"] {
  background: var(--surface);
  color: var(--text-muted);
}
/* … */
.note-row[data-status="done"] .note-row-title,
.note-row[data-status="done"] .note-row-snippet {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: currentColor;
}
/* … */
.tag-filter-chip,
.tag-overflow,
.attachment-count {
  /* … */
  background: var(--secondary);
}
```

  In the fine-pointer block, `.note-row[data-status="done"]:hover` switches the
  row to `var(--surface-inset)`, so a fix must keep chips distinct on both
  `--surface` and `--surface-inset`.
- `apps/desktop/src/features/notes/note-row.tsx`: `NoteRow` receives
  `expanded: boolean` (line ~54) and renders `data-expanded={expanded}` on the
  article (~91). The activation button (~111-128) and the Edit `Button`
  (~186-194, `aria-label={m.note_edit({ title })}`, `onClick={() => onExpand(note.id)}`)
  have no `aria-expanded`/`aria-controls`.
- `apps/desktop/src/features/notes/note-editor.tsx:315` renders
  `data-note-editor={note.id}`; its textarea focuses itself on mount with
  `preventScroll: true` (~135). The Write/Preview tabs unmount the inactive panel.
- `apps/desktop/src/components/ui/button.tsx` `ghost` variant includes
  `aria-expanded:bg-[var(--control-pressed)] aria-expanded:text-foreground`.
- `docs/UX.md` "Open and Done" row (around line 117): "Done stays in place with
  a checked control, muted surface, and struck-through primary text."
- Demo fixture (`?fixture=demo`): "Capture contract" is Done with Tag "Product".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/notes` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Visual | `bun run dev:desktop`, then open `http://127.0.0.1:1420/?fixture=demo` at 480×720 | manual check |

## Suggested executor toolkit

- Skill `emil-design-eng` for the pressed/expanded feedback; no new motion is added.

## Scope

**In scope**: `note-row.tsx`, `note-row.test.tsx`, `app.css`,
`e2e/release.spec.ts`, `docs/UX.md` (one sentence).

**Out of scope**: token values (`tokens.css`, Plan 040), the Done status dot
fill (neutral by ADR 0012), `expandNote` semantics in `note-screen.tsx`
(clicking Edit on an expanded row must not collapse it: collapse is the
editor's Close button and Escape).

## Git workflow

- Branch: `codex/049-legible-row-states`
- Commit: `fix(notes): keep done rows and the expanded state legible`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Chips keep their pill on Done rows

In `app.css`, add after the chip rule:

```css
.note-row[data-status="done"] :is(.tag-filter-chip, .tag-overflow, .attachment-count) {
  box-shadow: inset 0 0 0 1px var(--separator);
}
```

A hairline works on both `--surface` and the Done hover `--surface-inset`
without a new token or a raw colour. Do not change `--secondary` (it is used
by `Badge` and other surfaces).

**Verify**: e2e (Step 4) → pass.

### Step 2: Strike only the primary text

Remove `.note-row[data-status="done"] .note-row-snippet` from the
`line-through` selector list; the title keeps the strike and the whole row
keeps `color: var(--text-muted)`.

**Verify**: `grep -n "note-row-snippet" apps/desktop/src/styles/app.css` shows no rule containing `line-through`.

### Step 3: Report the expanded state

In `note-row.tsx`:
- Give the activation button and the Edit `Button`
  `aria-expanded={expanded}` and, when expanded,
  `aria-controls={editorId}` where `editorId` is the `id` you add to the
  editor wrapper that carries `data-note-editor` (pass it down or derive
  `note-editor-${note.id}` in both places).
- When `expanded` is already true, the Edit button's `onClick` focuses
  `[data-note-editor="${note.id}"] textarea` if present, otherwise the Write
  tab, instead of calling `onExpand` again.

**Verify**: `note-row.test.tsx` new cases: collapsed row → Edit has
`aria-expanded="false"`; expanded row → `aria-expanded="true"` and
`aria-controls` points at an element that exists; clicking Edit on an expanded
row does not call `onExpand` → pass.

### Step 4: E2E and contract

- In `release.spec.ts`, extend `fine-pointer hover keeps rows, controls, and
  destructive actions visually distinct`: for the Done row, assert its first
  `.tag-filter-chip` has a computed `box-shadow` that is not `none`, and that
  the Done row's `.note-row-snippet` computed `text-decoration-line` is `none`
  while its `.note-row-title` is `line-through`.
- `docs/UX.md` "Open and Done" row: append "Tag chips keep a visible boundary
  on the muted surface."

**Verify**: `bun run check` → exit 0; Chromium e2e → pass.

## Test plan

- `note-row.test.tsx`: three `aria-expanded`/focus cases.
- e2e: Done-row chip boundary and title-only strike assertions.
- Visual: Light and Graphite at 480×720, hover a Done row.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "aria-expanded" apps/desktop/src/features/notes/note-row.tsx` → ≥ 2 matches
- [ ] No `line-through` rule targets `.note-row-snippet`
- [ ] `plans/README.md` status row updated

## STOP conditions

- The chip hairline fails the axe e2e test or a contrast assertion: report the
  pair rather than introducing a new colour.
- Focusing the editor from the Edit button scrolls the list unexpectedly
  (Plan 046 owns scroll-into-view): keep `preventScroll: true` and report.

## Maintenance notes

- Any new chip-like control on a Done row needs the same boundary rule.
- Reviewer: screen-reader pass (VoiceOver) on a collapsed and an expanded row.
