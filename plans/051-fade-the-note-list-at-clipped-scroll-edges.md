# Plan 051: Fade the Note list only at the scroll edges where content is clipped

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> This plan narrows a rule in `AGENTS.md` and `docs/UX.md` ("no gradients").
> The operator requested it on 2026-09-23 after a UX review; confirm in chat
> that the approval still stands before Step 0. Without it, STOP.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/note-list.tsx apps/desktop/src/features/notes/note-list.test.tsx apps/desktop/src/styles/app.css apps/desktop/src/app/theme-contract.test.ts apps/desktop/e2e/release.spec.ts docs/UX.md AGENTS.md docs/adr && git status --short -- apps/desktop/src docs AGENTS.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 038-050 may
> have landed first and edited `note-list.tsx` (042, 046), `app.css`,
> `theme-contract.test.ts`, `docs/UX.md`, `AGENTS.md` and `docs/adr`; that is
> expected drift. Compare the "Current state" excerpts against the live code;
> any other mismatch is a STOP condition. Refer to `app.css` rules by selector.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED (paint cost of a mask on the scroll container)
- **Depends on**: 046 (it adds Home/End and scroll-into-view that share the scroll padding added here)
- **Category**: tech-debt (visual polish)
- **Planned at**: commit `242d51e`, 2026-09-23 (operator request after the `emil-design-eng` UX review)

## Why this matters

The Note list scrolls between two solid, fixed surfaces: the search field
above and the composer below. Rows that scroll past either edge are cut with a
hard horizontal line through their border and text, which reads as a clipping
bug rather than "there is more". A short alpha fade on the edge that actually
clips content tells the user the list continues, without a scrollbar and
without any painted decoration. At the top of the list, or at its end, that
edge shows no fade, so a short list looks exactly as it does today.

## Current state

- `apps/desktop/src/styles/app.css`:

```css
.note-list {
  min-height: 0;
  overflow: auto;
  background: transparent;
  contain: strict;
}
.note-list-inner {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 0.15rem 0 0;
  list-style: none;
}
```

  The list is transparent over the canvas; rows paint their own surfaces.
- `apps/desktop/src/features/notes/note-list.tsx`: `parentRef` is the
  `.note-list` scroll element; `useVirtualizer({ count, estimateSize: () => 84,
  getScrollElement: () => parentRef.current, overscan: 10, rangeExtractor })`
  (`@tanstack/react-virtual` 3.14.9 on `virtual-core` 3.17.7).
  `virtualizer.scrollOffset`, `virtualizer.scrollRect` and
  `virtualizer.getTotalSize()` are available at render. `virtual-core`
  re-renders React only when `isScrolling` or the visible range changes
  (`maybeNotify`), not on every pixel, and resets `isScrolling` shortly after
  scrolling stops. `moveFocus` calls `virtualizer.scrollToIndex(nextIndex, { align: 'auto' })`.
  The options `scrollPaddingStart` and `scrollPaddingEnd` exist.
- AGENTS.md "UI and motion": "No emoji UI, Inter, gradients, glow, permanent
  glass, decorative rails, card grids, or decorative list entrances." Also:
  "Reject … raw scroll listeners".
- `docs/UX.md` line ~30 "Do not use Inter, gradients, glow, …" and "Motion and
  materials" (~341) "Reject … parallax, bounce, gradients, grain, …". No ADR
  mentions gradients. `docs/SITE.md` has its own site rule and is unaffected.
- `app.css` already has `@media (prefers-contrast: more)` and
  `@media (prefers-reduced-transparency: reduce)` blocks near the end.
- `apps/desktop/src/app/theme-contract.test.ts` reads `app.css` as `appCss`
  for source assertions.
- The demo fixture accepts `&notes=N` (e2e uses `/?fixture=demo&notes=100`).
- `apps/desktop/src-tauri/src/lib.rs` and the site are unaffected.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/notes src/app/theme-contract.test.ts` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| E2E WebKit | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=webkit --grep "fades"` | pass |
| Visual | `bun run dev:desktop`, open `http://127.0.0.1:1420/?fixture=demo&notes=100` | manual check |

## Suggested executor toolkit

- Skills `emil-design-eng` and `animation-performance` (mask paint cost).

## Scope

**In scope**: files in the drift-check list, plus the new ADR.

**Out of scope**: any painted gradient (backgrounds, borders, text), fades on
Preferences, Help, the editor textarea, Markdown preview or dialogs; any
animation of the fade; a scroll event listener; `docs/SITE.md` and the site.

## Git workflow

- Branch: `codex/051-note-list-scroll-edge-fade`
- Commits: `docs(adr): allow scroll-edge alpha masks on the note list`,
  `feat(notes): fade only the clipped scroll edges of the note list`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Record the decision

Create `docs/adr/NNNN-scroll-edge-masks.md` with the next free ADR number.
Status: "Accepted on <date> by operator decision." Decision: the "no
gradients" rule rejects painted decoration. An alpha mask that fades scrolled
content into the canvas paints no colour and is allowed only on the Note
list's top and bottom scroll edges, only while content is clipped there, at
most 1rem deep, never animated, and removed under increased contrast and
reduced transparency. Consequences: one mask on one scroll container; any
other use needs a new ADR.

Update `AGENTS.md` ("No emoji UI, Inter, painted gradients (the Note list
scroll-edge mask of ADR NNNN excepted), glow, …") and both `docs/UX.md`
sentences the same way.

**Verify**: `grep -n "scroll-edge" AGENTS.md docs/UX.md` → at least one match each.

### Step 1: Report which edges clip, without a scroll listener

In `note-list.tsx`, compute at render:

```ts
const offset = virtualizer.scrollOffset ?? 0;
const viewport = virtualizer.scrollRect?.height ?? 0;
const clippedStart = offset > 1;
const clippedEnd = viewport > 0 && offset + viewport < virtualizer.getTotalSize() - 1;
```

Put `data-clipped-start={clippedStart}` and `data-clipped-end={clippedEnd}` on
the `.note-list` element. The values refresh when the virtualizer re-renders
(scroll start/stop, range change, resize); the fade may therefore lag the very
top or bottom by the virtualizer's `isScrolling` reset delay. Accept that; do
not add a scroll listener or per-frame state.

Pass `scrollPaddingStart: 12` and `scrollPaddingEnd: 16` (the fade depths in
px) to `useVirtualizer`, so keyboard navigation and `scrollToIndex` never park
a focused row under a fade.

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0.

### Step 2: The mask

In `app.css`:

```css
.note-list {
  --list-fade-start: 0px;
  --list-fade-end: 0px;
  -webkit-mask-image: linear-gradient(to bottom, transparent, black var(--list-fade-start), black calc(100% - var(--list-fade-end)), transparent);
  mask-image: linear-gradient(to bottom, transparent, black var(--list-fade-start), black calc(100% - var(--list-fade-end)), transparent);
}
.note-list[data-clipped-start="true"] { --list-fade-start: 0.75rem; }
.note-list[data-clipped-end="true"] { --list-fade-end: 1rem; }
```

Use the `black` keyword (mask alpha, not a palette colour; keeps raw hex out
of `app.css`). Inside the existing `@media (prefers-contrast: more)` and
`@media (prefers-reduced-transparency: reduce)` blocks add
`.note-list { -webkit-mask-image: none; mask-image: none; }`. Do not
transition the custom properties.

Add a `theme-contract.test.ts` source assertion that both media blocks set
`mask-image: none` for `.note-list`.

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` → pass.

### Step 3: E2E

Add `note list fades only the clipped edges` to `release.spec.ts`:

1. `page.goto('/?fixture=demo&notes=100')`: `.note-list` has
   `data-clipped-start="false"` and `data-clipped-end="true"`.
2. Scroll the list to the middle (`list.evaluate(el => { el.scrollTop = 800 })`),
   then `expect.poll` until both attributes are `"true"`.
3. Scroll to the end: `expect.poll` until `data-clipped-end="false"`.
4. `/?fixture=demo&notes=2`: both attributes `"false"` (short list unchanged).
5. Keyboard: focus the first row and press ArrowDown until a row below the
   fold is focused; its bounding box stays at least 16px above the list's
   bottom edge.

Run it in Chromium and WebKit.

**Verify**: both e2e commands → pass; the existing geometry and axe tests → pass.

### Step 4: Performance and visual check

At `?fixture=demo&notes=20000`, record a Chromium performance trace while
flick-scrolling for 3 seconds; there must be no long frames attributable to
the mask compared with a run where `mask-image` is disabled in DevTools.
Check Light and Graphite at 400×480 and 480×720 visually, including an
expanded editor near the composer. Record the result in the commit body.

## Test plan

- `theme-contract.test.ts`: fallback assertions.
- e2e: clipped-edge attributes at start, middle, end, short list; focused row
  clear of the bottom fade; Chromium and WebKit.
- Manual: 20k-Note scroll trace and both themes.

## Done criteria

- [ ] `bun run check` exits 0; Chromium and WebKit e2e pass
- [ ] `docs/adr/*-scroll-edge-masks.md` exists; `AGENTS.md` and `docs/UX.md` reference it
- [ ] `grep -n "mask-image" apps/desktop/src/styles/app.css` → the `.note-list` rule and two fallbacks only
- [ ] `grep -n "addEventListener('scroll'" apps/desktop/src/features/notes/note-list.tsx` → nothing
- [ ] Step 4 result recorded
- [ ] `plans/README.md` status row updated

## STOP conditions

- The operator withdraws the approval for narrowing the gradient rule.
- The 20k-Note trace shows long frames caused by the mask, or WebKitGTK
  visibly stutters while scrolling: report the measurements; do not
  compensate with `will-change` or a scroll listener.
- The attributes never update in WebKit because the virtualizer does not
  re-render there on scroll start/stop: report instead of adding a listener.
- A focused row or the expanded editor's focus ring ends up under a fade in
  any e2e run: report before tuning the padding beyond the fade depth.

## Maintenance notes

- The fade depths (0.75rem, 1rem) and `scrollPaddingStart/End` (12, 16) must
  change together.
- Reviewer: with the list at rest at the top, nothing looks different from
  today; the fade exists only where content continues.
