# Plan 048: Test motion behaviour end to end and drop a standing `will-change`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/styles/app.css apps/desktop/src/motion apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/components/ui/transient-primitives.test.ts apps/desktop/e2e/release.spec.ts packages/theme/src/motion.css && git status --short -- apps/desktop/src packages/theme`
> (without `..HEAD` the diff includes uncommitted edits). Plans 039 and 041-045
> land first and touch these files; that is expected drift. Compare the
> "Current state" excerpts against the live code; any other mismatch is a STOP
> condition. Refer to `app.css` rules by selector.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 041 (motion ADR), 042 (status dot cue), 043 (toast reduced motion)
- **Category**: tests
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

ADR 0005's two hardest guarantees — every animation is interruptible and
retargets from its live value, and reduced motion removes spatial travel —
are verified for exactly one surface (the Preferences popover). The editor's
three-way branch (keyboard / reduced / normal) has no behavioural test, and
the status-dot cue from Plan 042 has none. Two small cleanups ride along: a
`will-change: transform` pinned on every virtual row, and a dead
reduced-motion rule for a keyframe animation that no longer exists. The
contract amendment itself (paint-only feedback, virtualization exemption,
row-height snap) lands earlier, in Plan 041 Step 0.

## Current state

- The motion ADR from Plan 041 Step 0 (`docs/adr/*-paint-feedback-and-virtualized-motion.md`)
  amends ADR 0005; this plan only tests it.
- `apps/desktop/src/styles/app.css` `.note-virtual-row { … will-change: transform; }`.
- `app.css` near the end:

```css
@media (prefers-reduced-motion: reduce) {
  .preferences-popover {
    animation-name: none;
  }
}
```

  The only animation utilities in `apps/desktop/src` are the guarded
  `animate-spin` (`toast.tsx:157`) and `animate-pulse` (`skeleton.tsx:7`).
- `apps/desktop/src/motion/system.ts` `MotionSystem` keeps `keyboard` in React
  state; a modality flip re-renders MotionSystem, MotionConfig and every `m.*`
  component through LazyMotion's context value. Flips are rare; leave it.
- `note-editor.tsx` editor motion (around lines 311-328): `initial`/`animate`/`exit`
  with `transform: scaleY(…)` strings and
  `transition = keyboardMotion ? { duration: 0 } : reduceMotion ? { duration: 0.12 } : surfaceTransition`.
  Close awaits `flushDraft()` (around lines 282-284) and moves focus out of the textarea.
- `apps/desktop/e2e/release.spec.ts:30-52` — the popover reduced-motion/transform
  test (uses a CDP session for playback control); `:209-241` — the editor fold
  test that waits for `document.getAnimations()` to finish.
- `apps/desktop/src/components/ui/transient-primitives.test.ts` — source-string
  checks for popover, tooltip, toast (Plan 043) and select (Plan 047).
- `system.ts` `surfaceTransition = { type: 'spring', stiffness: 360, damping: 38, mass: 1 }`
  (damping ratio 38 / (2 × √360) ≈ 1.0014).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/motion src/components/ui` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Suggested executor toolkit

- Skills `apple-design` (required by AGENTS.md for motion work),
  `animation-accessibility`, `animation-performance` (`will-change` guidance).

## Scope

**In scope**: files in the drift-check list.

**Out of scope**: ADR text (Plan 041 Step 0); animating the editor's height
(README "Direction"); replacing the virtualizer; refactoring `system.ts`;
toast tests (Plan 043 owns them).

## Git workflow

- Branch: `codex/048-motion-tests`
- Commits: `test(motion): cover interruption, reduced motion and the editor branches`,
  `perf(ui): drop standing will-change and a dead reduced-motion rule`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Cleanups

- Remove `will-change: transform` from `.note-virtual-row`. The rows are
  React-positioned; there is nothing to pre-promote.
- Delete the dead `@media (prefers-reduced-motion: reduce) { .preferences-popover { animation-name: none; } }` block.

**Verify**: `grep -rnE "animate-|@keyframes|animation[-:]" apps/desktop/src | grep -v paraglide` shows only the guarded `animate-spin` and `animate-pulse`; `grep -n "will-change" apps/desktop/src/styles/app.css` → nothing; `bun run --cwd apps/desktop test` → pass.

### Step 2: Behavioural e2e tests

Add to `release.spec.ts` (Chromium project; demo fixture). Slow animations
only through the Chromium CDP `Animation.setPlaybackRate` (`playbackRate: 0.1`)
via `page.context().newCDPSession(page)`, as the existing popover test does;
never add a runtime slow-motion flag.

1. **Editor reduced motion**: with `emulateMedia({ reducedMotion: 'reduce' })`,
   expand a row; assert the editor's computed `transform` is `none`/identity
   at every sampled frame during the first 150 ms and only `opacity` changes.
2. **Editor interruption**: expand with the pointer, read the editor's opacity
   o₀ after 60 ms, click Close, sample opacity with `requestAnimationFrame`
   until removal, and assert every sample ≤ o₀ + 0.05 and < 1. Separately,
   type `x` 30 ms after expanding, then Close, reopen, and assert the body
   ends with `x`.
3. **Keyboard modality**: press Enter on a focused row; immediately after the
   editor is visible, `editor.getAnimations().length === 0`, its computed
   opacity is `1`, and `html[data-input-modality="keyboard"]` is set.
4. **Status dot** (Plan 042): under reduced motion, toggle status and assert
   the dot's sampled computed `transform` stays identity until the cue settles.

Keep the `transient-primitives.test.ts` source-text checks (popover, tooltip,
toast and select cases); add the e2e tests alongside them.

**Verify**: Chromium e2e → pass, including the four new tests.

### Step 3: Unit test for the surface profile

`motion.test.ts`: assert that `surfaceTransition` is critically damped or
over-damped: `damping / (2 * Math.sqrt(stiffness * mass)) >= 1`.

**Verify**: `bun run --cwd apps/desktop test -- src/motion` → pass; `bun run check` → exit 0.

## Test plan

Covered in Steps 2-3.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes with the new tests
- [ ] `grep -n "will-change" apps/desktop/src/styles/app.css` → nothing
- [ ] `grep -n "animation-name: none" apps/desktop/src/styles/app.css` → nothing
- [ ] `plans/README.md` status row updated

## STOP conditions

- Removing `will-change` produces visible dropped frames in a Chromium
  performance trace while scrolling `?fixture=demo&notes=20000`: keep it only
  under a `[data-scrolling]` attribute and report. (`bun run test:perf`
  measures bundle size and search timing, not scroll jank.)
- A test can only pass by adding a production hook: STOP and report.

## Maintenance notes

- New animated surfaces must add themselves to the reduced-motion assertion list in e2e.
- Reviewer: the motion ADR must not be read as permitting `height`/`width` transitions.
