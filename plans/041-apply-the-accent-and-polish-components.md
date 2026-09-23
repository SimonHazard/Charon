# Plan 041: Put the lavender to work — accent the primary action, anchor the composer, transition state feedback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> Step 0 amends an accepted ADR (ADR 0005: "Only transform and opacity animate
> in accepted runtime patterns"). Confirm in chat that the operator approves
> the amendment before Step 0; without that approval, STOP.
>
> **Drift check (run first)**: `git diff --stat 242d51e..HEAD -- apps/desktop/src/components/ui apps/desktop/src/components/shelf-chrome.tsx apps/desktop/src/features/notes/capture-input.tsx apps/desktop/src/features/notes/capture-input.test.tsx apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/components/workspace-state.tsx apps/desktop/src/styles/app.css apps/desktop/src/app/theme-contract.test.ts apps/desktop/src/motion apps/desktop/src/main.tsx apps/desktop/e2e/release.spec.ts docs/UX.md docs/adr && git status --short -- apps/desktop/src docs`
> Plan 040 lands first and edits `app.css`, `theme-contract.test.ts` and
> `docs/UX.md`; Plan 038 may have edited `preferences-panel.tsx`. That is
> expected drift. Compare the "Current state" excerpts against the live code;
> any other mismatch is a STOP condition. Uncommitted user work in a listed
> file is a STOP until committed. Refer to `app.css` rules by selector.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 040
- **Category**: tech-debt (design)
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

`--action` (lavender) is consumed by exactly one file, `button.tsx`, and the
`default` variant is used only on the crash screen, the first-run chooser and
the update install button. The composer, the product's primary verb, is a
1.5rem ghost arrow docked on a background identical to the canvas. Hover and
pressed colour states snap with no transition, because the motion contract
only allows transform and opacity to animate. The empty state's dashed border
has zero width, one CSS class is dead, and the Help/Preferences triggers use a
separate JS press that scales the icon rather than the button, with an easing
that is not the direct-feedback token. This plan applies the Plan 040
foundation and records the one contract change it needs.

## Current state

- `docs/adr/0005-fluid-desktop-motion.md` Decision, last bullet: "Only transform
  and opacity animate in accepted runtime patterns." `docs/UX.md` "Motion and
  materials" repeats "Only transform and opacity animate." and calls the
  allowed motion foundation "exact". Amendments in this repo are new ADRs whose
  predecessor's Status names them (see ADR 0006's Status).
- `apps/desktop/src/components/ui/transient-primitives.test.ts:32`:
  `expect(toggleGroup).not.toContain('transition-colors');`.
- `apps/desktop/src/components/ui/button.tsx:8-16` variants; line 35 base class
  contains `transition-transform … active:not-aria-[haspopup]:scale-[var(--motion-press-scale)]`.
  Tailwind 4 `active:scale-[…]` writes the CSS `scale` property;
  `transition-transform` covers `transform, translate, scale, rotate`.
- `apps/desktop/src/features/notes/capture-input.tsx:93-102`:

```tsx
          <Button
            aria-label={pending ? m.capture_input_saving() : m.capture_input_submit()}
            className="capture-submit-button"
            disabled={!body || pending}
            size="icon-xs"
            type="submit"
            variant="ghost"
          >
            <IconArrowUp aria-hidden="true" />
          </Button>
```

- `app.css` `.composer-dock { … background: var(--canvas); }` (no separator);
  `.capture-field:focus-within` uses a `color-mix(… var(--focus) 90% …)` shadow
  that `theme-contract.test.ts` (around line 229) pins with
  `expect(appCss).toContain('var(--focus) 90%')`. Six other focus rules already
  use `outline: 2px solid var(--focus)`.
- `app.css` `.note-row:hover/:active` (fine-pointer media block) swap
  background with no transition. `.note-status-dot[data-status="done"]` has a
  neutral `--surface-inset` fill: ADR 0012 decision 1 defines Done as "a
  checked control, muted surface, and struck-through primary text", and
  `docs/UX.md` keeps Lavender distinct from status.
- `app.css` `.preferences-toggle button[data-pressed]` and the editor tab
  active state use `--selection-surface`/`--selection-subtle` (1.2-1.3:1
  against siblings before Plan 040).
- `apps/desktop/src/components/ui/empty.tsx:8` includes `border-dashed` with no
  `border` width utility (never renders).
- Dead class: `workspace-state.tsx:60` `className="workspace-recovery-actions"`
  has no CSS rule. `note-context` (`note-screen.tsx:380`) is live: it is the
  grid row for the tag filter and `note-screen.test.tsx:107` asserts it.
- `apps/desktop/src/motion/press.ts` `usePressFeedback()` animates with
  `ease: [0.25, 0.46, 0.45, 0.94]` (not `--motion-easing-direct`). Its only
  consumers are `shelf-chrome.tsx` (Help trigger: `helpPress` spread on
  `PopoverTrigger`, `style` on an inner `motion.span`) and
  `preferences-panel.tsx` (Settings trigger, around lines 131-151).
- `apps/desktop/src/main.tsx:65` `<TooltipProvider>` with no `delay` (Base UI
  1.6.0 props: `delay`, `closeDelay`).
- `apps/desktop/src/components/ui/alert-dialog.tsx:34` has `ring-1 ring-foreground/10`
  and no shadow; popover and tooltip already use `--shadow-transient`
  (= `--shadow-floating` after Plan 040).
- Binding (`docs/UX.md`): Note rows have "no lift or shadow"; the composer is
  solid and anchored; shadows only for genuinely floating layers; Lavender is
  reserved for focus, active controls, or a new-Note acknowledgement.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test` | pass |
| Contrast/token contract | `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` | pass |
| Lint + typecheck | `bun run lint && bun run --cwd apps/desktop typecheck` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Visual | `bun run dev:desktop` then open `http://127.0.0.1:1420/?fixture=demo` | manual review |

## Suggested executor toolkit

- Skills `apple-design` (required by AGENTS.md for motion work),
  `emil-design-eng` (hover/press feel), `css-animations` (transition property
  lists), `animation-accessibility` (reduced-motion variants).

## Scope

**In scope**: files in the drift-check list, including `docs/UX.md`,
`docs/adr/0005-fluid-desktop-motion.md` and the new motion ADR.

**Out of scope**:
- `tokens.css` (Plan 040). If a token is missing, STOP.
- Row shadows, hover shadows, composer shadow, list entrances (rejected by `docs/UX.md`).
- A Lavender Done fill (ADR 0012 keeps status neutral).
- Motion of the editor expansion (contract-level decision, README "Direction").
- `note-list.tsx` and the virtualizer.
- `.capture-field` height: Plan 044 owns it. Do not run in parallel with Plan 044.

## Git workflow

- Branch: `codex/041-apply-lavender-accent`
- Commits: `docs(adr): allow paint-only feedback transitions`,
  `feat(ui): accent the primary action and anchor the composer`,
  `fix(ui): transition hover and pressed states from tokens`,
  `fix(ui): remove the separate press implementation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Amend the motion contract

Create `docs/adr/NNNN-paint-feedback-and-virtualized-motion.md` with the next
free ADR number (0019 or later: ADR 0018 is the macOS signing identity, and
Plan 038 may have taken the next one). Status:
"Accepted on <date> by operator decision; amends ADR 0005 only where stated."
Decisions:

1. Only transform and opacity animate spatially. Direct-feedback state
   changes (hover, pressed, selected, done) may transition `background-color`,
   `border-color` and `color` with `--motion-duration-direct` and
   `--motion-easing-direct`, never `transition: all`, never combined with
   layout properties, and instant under keyboard modality and reduced motion.
2. A one-row new-Note acknowledgement may fade an opacity-only tint over the
   surface duration (Plan 045).
3. Per-frame React state stays rejected for animation and gesture state; list
   virtualization owns row placement and is exempt.
4. Row height snaps on expansion by design; animating it needs a new ADR.

Append to ADR 0005's Status: "ADR NNNN permits paint-only feedback
transitions and exempts list virtualization." In `docs/UX.md` "Motion and
materials", replace "Only transform and opacity animate." with "Only transform
and opacity animate spatially; paint-only colour transitions on the direct
motion tokens are allowed for feedback states (ADR NNNN)." In
`transient-primitives.test.ts:32`, replace `not.toContain('transition-colors')`
with `not.toContain('transition-all')`.

**Verify**: `grep -n "ADR 00" docs/adr/0005-fluid-desktop-motion.md docs/UX.md | grep -c paint` → ≥ 2; `bun run --cwd apps/desktop test -- src/components/ui` → pass.

### Step 1: Button variants with token transitions and a visible silhouette

In `button.tsx`:
- base class: replace `transition-transform` with
  `transition-[transform,scale,background-color,border-color,color]` (keep the
  duration/easing token classes; `scale` must stay listed or the press snaps);
  remove `not-aria-[haspopup]` from the press selector (Step 4 makes the JS
  press unnecessary).
- `default`: `bg-primary text-primary-foreground border-[var(--action-border)] hover:bg-[var(--action-hover)] active:bg-[var(--action-pressed)]`.
- Do not add an `accent-quiet` variant (no consumer).

Focus: leave the six `outline: 2px solid var(--focus)` rules untouched (skip
`.preferences-language`; Plan 047 deletes it). Change only
`.note-search:has(input:focus)` and `.capture-field:focus-within` to
`border-color: var(--focus); outline: 2px solid var(--focus); outline-offset: 2px;`.
Update the `theme-contract.test.ts` assertion to
`expect(appCss).toMatch(/\.capture-field:focus-within\s*\{[^}]*outline: 2px solid var\(--focus\)/)`.

**Verify**: `bun run --cwd apps/desktop test -- src/components src/app/theme-contract.test.ts` → pass.

### Step 2: Composer is the primary action

- `capture-input.tsx`: submit button `variant={body ? 'default' : 'ghost'}`;
  keep `size="icon-xs"` (its `::after` inset gives a 44px target),
  `disabled={!body || pending}` and the aria labels.
- `app.css` `.composer-dock`: add `border-top: 1px solid var(--separator)`; no shadow.
- Leave `.note-search` unchanged.

**Verify**: e2e `compact shelf geometry holds…` and `desktop remains usable at effective 360 pixels…` → pass.

### Step 3: Selected/active states and paint transitions

- `.preferences-toggle button[data-pressed]`: `background: var(--selection-surface); color: var(--selection-text); box-shadow: inset 0 0 0 1px var(--selection-border);`.
- Editor tabs active: `background: var(--selection-surface); border-color: var(--selection-border);`.
- `.note-status-dot`: add only `transition-property: background-color, border-color, color; transition-duration: var(--motion-duration-direct); transition-timing-function: var(--motion-easing-direct);`. Keep the done fill neutral.
- No `box-shadow` on `.note-row[data-expanded="true"]` (the selection border already marks it).
- `.note-row:hover`, `.note-row:active`, `.tag-filter-chip`, `.attachment-count`, `.preferences-toggle button`: add the same three-property direct transition.
- Extend the `:root[data-input-modality="keyboard"]` selector list at the end
  of `app.css` with `.note-row`, `.note-status-dot`, `.tag-filter-chip`,
  `.attachment-count` and `.preferences-toggle button` so keyboard actions stay instant.

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` → pass; Chromium e2e `fine-pointer hover keeps rows, controls, and destructive actions visually distinct` → pass (switch its colour reads to `expect.poll` so a 90ms transition is not sampled mid-way).

### Step 4: Empty, dead class, elevation, tooltips, one press implementation

- `empty.tsx:8`: remove the dead `border-dashed`; `EmptyMedia` keeps `text-foreground`.
- `.workspace-recovery-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }`. Keep `note-context`.
- `alert-dialog.tsx:34` → `shadow-[var(--shadow-modal)]`.
- `main.tsx:65`: `<TooltipProvider delay={350} closeDelay={0}>`.
- `shelf-chrome.tsx` and `preferences-panel.tsx`: delete the `motion.span`
  wrappers, the `usePressFeedback()` calls, the seven spread handlers and the
  now-unused `motion`/`usePressFeedback` imports; then delete
  `src/motion/press.ts` and `press.test.ts`. `Button`'s CSS `active:scale` now
  presses these triggers (on Space, like every other Button).

**Verify**: `grep -rn usePressFeedback apps/desktop/src` → nothing; `bun run --cwd apps/desktop test` → pass; e2e `pointer popovers interpolate scale…` and axe-clean tests → pass.

## Test plan

- `capture-input.test.tsx`: the submit button has the `bg-primary` class when
  text is present and not when empty (`Button` emits no `data-variant`).
- `transient-primitives.test.ts`: updated `transition-all` guard.
- `theme-contract.test.ts`: updated `.capture-field:focus-within` assertion.
- e2e: extend the hover-levels test with the composer dock `border-top` and the
  toggle pressed inset ring.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `docs/adr/*-paint-feedback-and-virtualized-motion.md` exists and ADR 0005's Status names it
- [ ] `grep -c "action-border" apps/desktop/src/components/ui/button.tsx` → 1
- [ ] `grep -n "border-dashed" apps/desktop/src/components/ui/empty.tsx` → nothing
- [ ] `grep -rn usePressFeedback apps/desktop/src` → nothing
- [ ] `plans/README.md` status row updated

## STOP conditions

- The operator has not approved the ADR 0005 amendment.
- A token named in this plan is absent from `tokens.css` (Plan 040 not done).
- Scaling a popover trigger shifts its popover by more than 1px when opened by
  pointer: keep that trigger unscaled and report.
- The 44px hit-area e2e test (`compact icon controls expose at least 44px CSS
  hit areas`) fails: restore the previous size for that control and report.

## Maintenance notes

- One filled lavender `default` button per surface; no second emphasis variant.
- Plans 042 and 045 rely on the Step 0 ADR; Plan 048 tests it.
- Reviewer: compare Light and Graphite screenshots of the shelf, expanded
  editor, Preferences and delete dialog.
