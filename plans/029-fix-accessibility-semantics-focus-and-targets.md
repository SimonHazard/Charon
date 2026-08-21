# Plan 029: Expose Note state to assistive tech, fix focus movement, and meet the 44px target contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`. Use the `apple-design` and `web-design-guidelines` skills
> if available when judging focus rings, hit areas, and live regions.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src/features/notes apps/desktop/src/components apps/desktop/src/styles/app.css apps/desktop/src/app apps/desktop/index.html apps/desktop/messages apps/desktop/e2e/release.spec.ts packages/theme/src/tokens.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (eleven small, independent changes)
- **Risk**: LOW–MED (focus timing around Base UI dialogs needs an e2e assertion)
- **Depends on**: none (Plan 026 touches `note-screen.tsx` too — coordinate merges; the delete-focus step here and 026 do not overlap in lines)
- **Category**: a11y / ux
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

`docs/UX.md` "Accessibility" requires status, counts, and deletion results to
be announced and every action reachable at 44×44 at compact width; ADR 0012
requires Done to be a *checked* control. The code (verified):

- The status toggle is a plain button whose only state signal is a flipping
  `aria-label`; no `aria-pressed`, no announcement; the `sr-only` row summary
  omits status. Screen-reader users cannot tell Open from Done.
- The Note `<ul>` has `list-style: none` (WebKit — the macOS webview — drops
  list semantics for such lists) and no `role="list"`; virtual rows carry no
  `aria-setsize`/`aria-posinset`, so AT hears "list, ~20 items" for 200 Notes.
- The row surface tints on `:active` but only the title/snippet `<button>`
  expands the Note; half of the 76 px row is dead space.
- Focus rings on the Tailwind primitives are `ring-ring/50` (≈2.1:1) and
  `ring-ring/35` (≈1.7:1) — below WCAG 1.4.11's 3:1; the hand-written rules
  (`.note-row-activation`, `.attachment-count`) are correct at 5.6:1.
- Hit targets: tag-remove 16×16, composer submit 24×24, info buttons 24×24,
  clear-search 28×28, Help/Preferences 36×36 (contract: 44×44). The
  `ToastClose` `after:-inset-2` idiom already exists in the codebase.
- After Delete, focus jumps to the **first** row (`querySelector('[data-note-focus]')`)
  instead of the nearest surviving Note; nothing announces the deletion.
- `attachment_count` has no plural ("1 attachments" / "1 pièces jointes"),
  and `e2e/release.spec.ts:153` pins the broken string.
- The clipboard local-path disclosure uses `aria-description`, which no
  shipping AT supports; screen-reader users get no disclosure.
- `index.html` hardcodes `lang="en"` and only the theme is restored at boot;
  a returning FR user gets French text under `lang="en"` until they reopen
  Preferences.
- The AlertDialog backdrop/rings ignore `prefers-reduced-transparency` and
  `prefers-contrast` (the popovers handle both).
- Arrow-key focus uses one `requestAnimationFrame` after `scrollToIndex`; when
  the target row was outside the virtual window it may not be mounted yet, so
  focus falls to `<body>` and arrow navigation stops (`overscan: 10` hides it
  for single steps).

## Current state

- `apps/desktop/src/features/notes/note-row.tsx:87-97` status `<Button aria-label=…>`;
  `:100-115` `<button className="note-row-activation" data-note-focus=…>` wraps
  title + snippet only; `:117-119` `sr-only` summary (tags + attachments);
  `:151-158` copy `TooltipTrigger` with `aria-description={m.copy_local_paths_disclosure()}`;
  `:185-196` `note-copy-state` `<p role="status"|"alert">` rendered
  conditionally.
- `apps/desktop/src/features/notes/note-list.tsx:58-80` `moveFocus`
  (`findIndex`, `scrollToIndex`, one rAF, `querySelector`); `:86-103` `<ul
  aria-label className="note-list-inner">` with virtual `<li tabIndex={-1} data-index>`;
  no `role`, no `aria-setsize`/`aria-posinset`.
- `apps/desktop/src/features/notes/note-screen.tsx:168-182` delete flow
  (`querySelector('[data-note-focus]')` → first row; `captureRef` fallback);
  `:74-77` `notes = useMemo(() => filterNotes(...))`.
- `apps/desktop/src/styles/app.css:426` `.note-list { scrollbar-gutter: stable }`;
  `:433` `.note-list-inner { list-style: none }`; `:467-510` `.note-row-main`
  grid (`min-height: 4.75rem`), `.note-row-content`, `.note-row-title`;
  `:455-458, 519-524` Done styling (muted, line-through); `:720-728`
  `.tag-editor-chips [data-slot="badge"] button { width: 1rem; height: 1rem }`;
  `:756` `.attachment-list { list-style: none }`; `:894-917` reduced-
  transparency / increased-contrast blocks list only `.help-popover`,
  `.preferences-popover`, `.note-row`, `.note-editor-inline`, `.composer-dock`.
- `apps/desktop/src/components/ui/button.tsx:34` `focus-visible:ring-3 focus-visible:ring-ring/50`;
  `:20-21` sizes `icon-xs` = `size-6`, `icon-sm` = `size-7`.
  `input.tsx:12`/`textarea.tsx:10` `focus-visible:ring-2 focus-visible:ring-ring/35`.
  `toast.tsx:127` `ToastClose` uses `after:absolute after:-inset-2` (hit-area idiom).
  `alert-dialog.tsx:19` overlay `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`;
  `:34` content `ring-1 ring-foreground/10`.
- `apps/desktop/messages/en.json:105` `"attachment_count": "{count} attachments"`;
  `:106` `attachment_focus` "Show {count} in this note"; `fr.json:105`
  `"{count} pièces jointes"`. Paraglide (`@inlang/paraglide-js`) supports
  plural variants via the message-format plugin (`project.inlang/settings.json`
  loads `plugin-message-format@4.4.0`; check its docs for the `match`/plural
  syntax before editing).
- `apps/desktop/index.html:3` `<html lang="en">`; boot script (`:8-18`) restores
  theme from `localStorage['charon:theme:v1']`. `apps/desktop/src/app/locale.ts`
  `readLocale()`/`applyLocale()`; `providers.tsx:37,45-48` reads the locale but
  applies it only on `setLocale`. Paraglide strategy `['localStorage','baseLocale']`
  (`vite.config.ts:13`) — find the exact localStorage key it uses (grep
  `src/paraglide/runtime.js` for `localStorage`).
- `packages/theme/src/tokens.css` defines `--focus` (`#625cb7` light) and the
  `prefers-contrast: more` promotion of `--focus` to `--text` (`:116-123`).
- `apps/desktop/e2e/release.spec.ts:153` (`'Show 1 attachments in this note'`),
  `:91` (Cancel restores focus), `:185` (`lang` after switching), `:357` (axe).

Conventions: Base UI `render` API; Tabler icons; all copy via `m.*` with EN/FR
parity; Vitest + Testing Library; Playwright e2e in `release.spec.ts`; CSS in
`app.css` with semantic tokens only (no raw palette values in components).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test:desktop` | pass |
| E2E Chromium (incl. axe) | `bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Contrast math | `bun run test:desktop -- theme-contract` | pass (extend it for the ring) |

## Scope

**In scope**:
- `apps/desktop/src/features/notes/note-row.tsx`, `note-list.tsx`, `note-screen.tsx`, their tests
- `apps/desktop/src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `alert-dialog.tsx`
- `apps/desktop/src/styles/app.css`
- `apps/desktop/index.html`, `apps/desktop/src/app/providers.tsx`, `locale.ts`, `theme-contract.test.ts`
- `apps/desktop/messages/en.json`, `fr.json`
- `apps/desktop/e2e/release.spec.ts`
- `docs/UX.md` (only if a contract sentence must be updated)

**Out of scope**:
- Motion/animation changes (Plan 030), search (Plan 031), Rust.
- Restyling rows or changing the shelf layout.

## Git workflow

- Branch: `codex/029-a11y-semantics-and-focus`
- Commit message: `fix(desktop): expose note state to assistive tech and fix focus and hit targets`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: One shared polite live region for the shelf

In `note-screen.tsx`, render one always-mounted
`<div aria-live="polite" role="status" className="sr-only">{announcement}</div>`
and a `announce(text)` helper (state + `setTimeout` clear after ~3 s). Use it
in Steps 2, 6, and (later plans) for copy/create feedback. Keep the existing
per-row error alerts as they are.

**Verify**: `bun run test:desktop -- note-screen` → pass (add a test that the region exists and receives text after a status toggle in Step 2).

### Step 2: Semantic Done state

`note-row.tsx` status button: add `aria-pressed={note.status === 'done'}`
(keep the action-phrased `aria-label`); include status in the `sr-only`
summary (add `note_status_open`/`note_status_done` messages if not present —
grep first); after `onToggleStatus` resolves, `announce(m.note_marked_done()/…)`.
Add unit assertions for `aria-pressed` and update any e2e locator that relies
on `data-status` to also assert `aria-pressed`.

**Verify**: `bun run test:desktop -- note-row note-screen` → pass.

### Step 3: List semantics and virtual position

`note-list.tsx`: `<ul role="list" …>`; each `<li role="listitem" aria-setsize={notes.length} aria-posinset={virtualRow.index + 1} …>`.
`app.css`: also add `role="list"` on `.attachment-list`'s `<ul>` in
`note-editor.tsx` (grep `attachment-list`). Add an assertion in
`note-list.test.tsx`'s 20k fixture for `aria-setsize` and `aria-posinset`.

**Verify**: `bun run test:desktop -- note-list` → pass.

### Step 4: Whole-row activation surface

Keep the semantic `<button className="note-row-activation">` where it is; make
its hit area cover `.note-row-main` with a stretched pseudo-element:
```css
.note-row-main { position: relative; }
.note-row-activation::after { content: ''; position: absolute; inset: 0; }
.note-row-leading, .note-row-metadata, .note-row-actions { position: relative; z-index: 1; }
```
Ensure the status toggle, tag chips, attachment count, and the three trailing
actions remain clickable (they sit above the pseudo-element). Add an e2e or
unit test clicking the row padding area and asserting expansion.

**Verify**: `bun run --cwd apps/desktop test:e2e -- --project=chromium` → pass, including the new click test.

### Step 5: Focus ring contrast and hit targets

- `button.tsx`: `focus-visible:ring-2 focus-visible:ring-ring` (full strength)
  — or `ring-ring/85`; `input.tsx`/`textarea.tsx`: `focus-visible:ring-2 focus-visible:ring-ring`;
  `app.css .capture-field:focus-within` box-shadow: raise the `color-mix`
  percentage to ≥85%. Extend `theme-contract.test.ts`'s contrast math to assert
  the ring colour against `--canvas` ≥ 3:1 in both themes.
- Hit targets: apply the `after:absolute after:-inset-*` idiom (relative parent)
  to: tag-remove button (`app.css:720-728` — also raise visual size to 20 px),
  composer submit (`capture-input.tsx` `icon-xs`), the two info buttons in
  `preferences-panel.tsx`, clear-search (`note-screen.tsx`), and Help/
  Preferences (`app.css:81-85`) so each reaches ≥44×44 CSS px hit area at
  400 px width without changing layout. Add an e2e assertion at 400×480 that
  these controls' `getBoundingClientRect` (including `::after`) or a
  `elementFromPoint` probe at ±20 px hits the control.

**Verify**: `bun run test:desktop -- theme-contract` → pass; e2e compact-width test → pass.

### Step 6: Delete focus to the nearest survivor + announcement

In `note-screen.tsx` delete flow: before executing, compute
`index = notes.findIndex(n => n.id === deleteTargetId)`; after success, focus
`notes[Math.min(index, notes.length - 2)]`'s `[data-note-focus="<id>"]` (the
new neighbour) or the composer when the list is empty; use a layout-effect/
`requestAnimationFrame` after `setDeleteTargetId(null)`; then
`announce(m.delete_done())` (add EN/FR if missing). Add an e2e test deleting
the 3rd of 5 fixture Notes and asserting focus lands on the new 3rd row.

**Verify**: Chromium e2e → pass.

### Step 7: Plural `attachment_count`

Convert to a plural message in EN (`one`/`other`) and FR (`one`/`other`)
following the message-format plugin syntax; keep the `{count}` parameter so
`attachment_focus`/`note_attachment_names` callers are unchanged. Update
`release.spec.ts:153` to `'Show 1 attachment in this note'`.

**Verify**: `bun run typecheck` (Paraglide compiles) → exit 0; Chromium e2e → pass.

### Step 8: Deliver the clipboard disclosure to AT

Replace `aria-description` on the copy trigger with `aria-describedby` pointing
at a per-row `sr-only` `<span id=…>` containing `m.copy_local_paths_disclosure()`
(or wire the Base UI Tooltip as the description if it supports it without
double-reading). Remove the inert attribute.

**Verify**: `grep -rn "aria-description=" apps/desktop/src` → none; unit test asserts `aria-describedby` resolves to the disclosure text.

### Step 9: Set `lang` at boot

Extend the `index.html` boot script to read Paraglide's localStorage key (found
via grep in `src/paraglide/runtime.js`), validate against `['en','fr']`, and
set `document.documentElement.lang`; also call `applyLocale(readLocale())`
once on mount in `providers.tsx` (harmless double-set). Add an e2e test:
switch to FR, `page.reload()`, assert `lang="fr"` before any interaction.

**Verify**: Chromium e2e → pass.

### Step 10: Dialog under reduced transparency / increased contrast

`alert-dialog.tsx`: replace `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`
with token-driven classes (`bg-[var(--material-scrim)]` and
`backdrop-blur-[var(--material-blur)]` — add tokens in
`packages/theme/src/tokens.css`/`motion.css` if absent, following the existing
`--material-transient*` naming), and extend `app.css:894-917` blocks to
`[data-slot="alert-dialog-overlay"]`, `[data-slot="alert-dialog-content"]`,
`[data-slot="tooltip-content"]`, `[data-slot="toast"]` (solid background, no
blur under reduced transparency; `border-color: currentColor` under
increased contrast). Add an e2e assertion mirroring `release.spec.ts:285` for
the dialog.

**Verify**: Chromium e2e → pass.

### Step 11: Arrow-key focus that waits for the row to mount

In `note-list.tsx`, keep a `pendingFocusId` ref/state; after `scrollToIndex`,
set it; in a `useLayoutEffect` that runs after each render, if the pending row
element exists, focus it and clear. Read the current index from the event
target's closest `[data-index]` instead of `findIndex` (O(1)). Add a unit test
with 100 notes and a small viewport: hold ArrowDown 30 times → focus is always
on a row.

**Verify**: `bun run test:desktop -- note-list` → pass.

## Test plan

- Unit: Steps 1-3, 8, 11; e2e: Steps 4-7, 9, 10; contrast: Step 5.
- Run the full Chromium e2e including both axe passes at the end.

## Done criteria

- [ ] `aria-pressed` on the status toggle; status in the row summary; live region announces status/delete
- [ ] `role="list"`/`listitem`, `aria-setsize`/`aria-posinset` on the virtual list
- [ ] Row padding click expands the Note; actions still work
- [ ] Focus rings ≥3:1 in both themes (asserted); listed controls have ≥44×44 hit areas at 400 px
- [ ] Delete focuses the nearest surviving row; `attachment_count` pluralized; e2e string updated
- [ ] No `aria-description=`; disclosure via `aria-describedby`
- [ ] `lang` correct after reload; dialog honours reduced transparency / increased contrast
- [ ] Arrow-key focus never lands on `<body>` across the virtual window
- [ ] `bun run typecheck && bun run test:desktop` and Chromium e2e (incl. axe) pass
- [ ] `plans/README.md` status row for 029 updated

## STOP conditions

- The message-format plugin version does not support plural variants —
  report; do not hand-roll pluralization in TSX for more than this one key.
- Base UI's dialog focus restoration fights the delete-focus step in a way an
  e2e test cannot make deterministic — report with the observed order.
- A change here conflicts with Plan 026's edits in `note-screen.tsx` — rebase
  and report if the delete flow was restructured.

## Maintenance notes

- Future feedback (copied, created, count of results) should use the shared
  live region from Step 1, not new conditional `role="status"` elements.
- Keep the `theme-contract.test.ts` contrast assertions when tokens change.
- Plan 030 handles "Copied" auto-clear and reduced-motion press feedback.
