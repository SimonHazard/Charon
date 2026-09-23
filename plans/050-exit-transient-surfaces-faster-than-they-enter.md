# Plan 050: Exit Tooltips, Popovers and dialogs faster than they enter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> This plan changes the `docs/UX.md` motion contract ("over 120-180ms with
> symmetric exit"). The operator requested it on 2026-09-23 after a UX review;
> confirm in chat that the approval still stands before Step 3.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- packages/theme/src/motion.css apps/desktop/src/motion/motion.test.ts apps/desktop/src/components/ui/popover.tsx apps/desktop/src/components/ui/tooltip.tsx apps/desktop/src/components/ui/alert-dialog.tsx apps/desktop/src/components/ui/select.tsx apps/desktop/src/components/ui/transient-primitives.test.ts apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts docs/UX.md && git status --short -- packages/theme apps/desktop/src docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 041, 043 and
> 047 land first and edit `alert-dialog.tsx`, `motion.css`, `select.tsx` (new),
> `transient-primitives.test.ts` and `docs/UX.md`; that is expected drift.
> Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 041 (alert-dialog edits and motion ADR), 047 (`select.tsx`, if it creates one)
- **Category**: tech-debt (motion polish)
- **Planned at**: commit `242d51e`, 2026-09-23 (operator request after the `emil-design-eng` UX review)

## Why this matters

Every transient surface (Tooltip, Popover, alert dialog) leaves at exactly
the speed it arrives: 160ms in, 160ms out. Entering deserves a moment so the
eye can follow where the surface comes from; leaving is the system responding
to a decision the user has already made, and a lingering exit reads as lag.
Closing Preferences or Help, dismissing a Tooltip, or cancelling the Delete
dialog should get out of the way faster than it arrived. The path stays
symmetric (same origin, scale and opacity), so ADR 0005's "Entrances and exits
use symmetric paths" still holds; only the duration becomes asymmetric.

## Current state

- `packages/theme/src/motion.css`:

```css
:root {
  --motion-duration-direct: 90ms;
  --motion-easing-direct: cubic-bezier(0.2, 0, 0, 1);
  --motion-press-scale: 0.98;

  --motion-duration-transient: 160ms;
  --motion-easing-transient: cubic-bezier(0.2, 0, 0, 1);
  --motion-transient-scale: 0.985;
  …
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-direct: 0ms;
    --motion-press-scale: 1;
    --motion-duration-transient: 120ms;
    --motion-transient-scale: 1;
    …
  }
}
```

- Consumers of `--motion-duration-transient` (all use the arbitrary class
  `[transition-duration:var(--motion-duration-transient)]` plus
  `data-starting-style:`/`data-ending-style:` opacity and scale):
  `apps/desktop/src/components/ui/popover.tsx:35`, `tooltip.tsx:41` (also
  `data-instant:transition-none`), `alert-dialog.tsx:19` (overlay, opacity only)
  and `alert-dialog.tsx:34` (content). Plan 047 may add `select.tsx` with the
  same classes.
- A transition uses the timing of the after-change style, so a duration set
  under `data-ending-style` applies to the exit only; the open state keeps
  160ms for the entrance, and a reopen during the exit retargets with 160ms.
- `apps/desktop/src/styles/app.css` ends with an unlayered rule that zeroes
  `transition-duration` for `[data-slot="popover-content"]`,
  `[data-slot="tooltip-content"]` and the alert-dialog slots under
  `:root[data-input-modality="keyboard"]`. Tailwind utilities are layered, so
  that rule keeps winning and keyboard exits stay instant.
- Tests: `apps/desktop/src/motion/motion.test.ts:20-23` asserts
  `--motion-duration-transient: 160ms;` and the reduced `120ms`.
  `transient-primitives.test.ts` (`%s uses symmetric origin-aware states` for
  popover and tooltip) asserts the transient duration token. e2e
  `pointer popovers interpolate scale through transform and reduced motion
  stays still` (`release.spec.ts:30-52`) asserts the **open** popover's
  `transition-duration` is `0.16s`; keep that true.
- `docs/UX.md` "Motion and materials": "origin-aware opacity plus scale
  `.98-.985` for Tooltips, menus, and Popovers over 120-180ms with symmetric
  exit".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/motion src/components/ui` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Suggested executor toolkit

- Skills `apple-design` (required by AGENTS.md for motion work) and
  `emil-design-eng` (asymmetric enter/exit timing).

## Scope

**In scope**: files in the drift-check list.

**Out of scope**: toasts (surface duration, Plan 043), the editor expansion
(spring, `system.ts`), the press feedback, any easing change, any change to
the entrance duration.

## Git workflow

- Branch: `codex/050-faster-transient-exit`
- Commit: `feat(motion): exit transient surfaces faster than they enter`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Exit token

In `motion.css` `:root`, add `--motion-duration-transient-exit: 110ms;` after
`--motion-duration-transient`. In the `prefers-reduced-motion` block add
`--motion-duration-transient-exit: 100ms;` (opacity-only fade stays short but
visible). Extend `motion.test.ts` to assert both values.

**Verify**: `bun run --cwd apps/desktop test -- src/motion/motion.test.ts` → pass.

### Step 2: Apply it to every transient surface

Append `data-ending-style:[transition-duration:var(--motion-duration-transient-exit)]`
to the class lists in `popover.tsx:35`, `tooltip.tsx:41`, both
`alert-dialog.tsx` elements (`:19` overlay, `:34` content) and, if it exists,
the Select popup in `select.tsx`. Change nothing else in those class lists.

Extend `transient-primitives.test.ts`: the `it.each` list covers every file
above that exists, and each must contain `var(--motion-duration-transient-exit)`
next to `var(--motion-duration-transient)`.

**Verify**: `bun run --cwd apps/desktop test -- src/components/ui` → pass.

### Step 3: Contract

`docs/UX.md` "Motion and materials": replace "over 120-180ms with symmetric
exit" with "entering over 160ms and leaving along the same path over 110ms".
Also update `docs/UX.md`'s motion token paragraph if Plan 040 or 041 added one
that lists durations.

**Verify**: `grep -n "symmetric exit" docs/UX.md` → nothing; `grep -n "110ms" docs/UX.md` → one match.

### Step 4: E2E

Add `transient surfaces leave faster than they enter` to `release.spec.ts`
(model it on the popover test at `:30-52`):

1. Open Settings with the pointer; assert the open popover's
   `transition-duration` is still `0.16s`.
2. Install a `MutationObserver` in `page.evaluate` that records
   `getComputedStyle(popup).transitionDuration` the first time `.preferences-popover`
   gets `data-ending-style`; close by clicking the pointer outside the popover
   (on the canvas, not a row); assert the recorded value is `0.11s`.
3. Repeat with `emulateMedia({ reducedMotion: 'reduce' })` → `0.1s`.
4. Open with the keyboard and close with Escape → the recorded value is `0s`
   (the keyboard-modality rule still wins).

**Verify**: Chromium e2e → pass, including the existing popover test unchanged.

## Test plan

- `motion.test.ts`: two new token assertions.
- `transient-primitives.test.ts`: exit token present in every transient primitive.
- e2e: one new test with pointer, reduced-motion and keyboard exits.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -c "motion-duration-transient-exit" packages/theme/src/motion.css` → 2
- [ ] `grep -rln "motion-duration-transient-exit" apps/desktop/src/components/ui` lists popover, tooltip, alert-dialog (and select if present)
- [ ] `docs/UX.md` no longer says "symmetric exit"
- [ ] `plans/README.md` status row updated

## STOP conditions

- The recorded exit duration is `0.16s` in Chromium (Base UI sets
  `data-ending-style` after the transition has already started): report the
  observed attribute timing rather than switching to keyframes or JS timers.
- The Tooltip's `data-instant` path or the keyboard-modality rule stops
  producing an instant exit: STOP; instant must win over the exit token.
- The operator withdraws the approval for the UX contract change.

## Maintenance notes

- Any new transient primitive adds both duration tokens and joins the
  `transient-primitives.test.ts` list.
- Reviewer: open and close Preferences, Help and the Delete dialog in slow
  motion (DevTools Animations panel at 10%); the exit must follow the entrance
  path in reverse, only faster.
