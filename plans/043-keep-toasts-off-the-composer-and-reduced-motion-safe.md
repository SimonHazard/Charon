# Plan 043: Keep toasts off the composer and make their motion reduced-motion safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/components/ui/toast.tsx packages/theme/src/motion.css apps/desktop/src/motion/motion.test.ts apps/desktop/src/components/ui/transient-primitives.test.ts apps/desktop/src/main.tsx apps/desktop/e2e/release.spec.ts apps/desktop/src/styles/app.css scripts/check-privacy.ts docs/UX.md && git status --short -- apps/desktop/src scripts docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 040 and 041
> may have landed first and edited `app.css` and `docs/UX.md`; that is expected
> drift. Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition. If uncommitted user changes touch an in-scope
> file, STOP until they are committed. Refer to `app.css` rules by selector.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

The toast viewport is `fixed inset-x-4 bottom-4` below the 640px `sm:`
breakpoint. Charon's window is 480px wide by default and 400px minimum, so
every capture warning or error toast is a full-width bar covering the
always-visible composer, and it is `pointer-events-auto`, so the composer is
unclickable while a toast is up. Under `prefers-reduced-motion`,
`motion-reduce:transition-opacity` stops transform from transitioning. The
entrance already fades in place, but every exit snaps the still-opaque toast to
`translateY(150%)`, off-screen, before its fade can play: the toast vanishes
with a hard pop instead of the short crossfade ADR 0005 requires. Toast timing
is also the only place the "surface" CSS duration is consumed and it is untested.

## Current state

- `apps/desktop/src/components/ui/toast.tsx:27-38`:

```tsx
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
```

- `toast.tsx:45-59` `Toast` classes: `absolute right-0 bottom-0 origin-bottom`,
  a stack offset that grows upward, `after:top-full`, `will-change-transform`,
  transition `transform var(--motion-duration-surface) var(--motion-easing-surface), opacity …`,
  `motion-reduce:transition-opacity`, one `data-starting-style` and nine
  `data-ending-style` transforms (default exit plus four swipe directions,
  collapsed and expanded) with `150%` literals. Base UI's default
  `swipeDirection` is `['down','right']`.
- `packages/theme/src/motion.css:1-24` tokens; under `prefers-reduced-motion`
  it sets `--motion-transient-scale: 1` (this is what makes popovers degrade
  correctly) but has no travel token.
- `apps/desktop/src/motion/motion.test.ts:16-28` asserts direct and transient tokens; not `--motion-duration-surface`.
- `apps/desktop/src/styles/app.css:949-954` `.composer-dock { position: relative; z-index: 2; … }` (Plan 041 adds a top border); the shelf column is `min(100%, 34rem)` centred (`app.css:365-371`).
- `apps/desktop/src/main.tsx:64` `<Toaster>` wraps the providers; `toast.add({ title, description, type })` is called from `providers.tsx` `CaptureBridge`; no `timeout` is configured, so Base UI 1.6's default 5000 ms applies (`ToastProvider.d.ts`).
- The viewport is portalled to `body`, so a `.desktop-shell` descendant selector cannot reach it.
- `scripts/check-privacy.ts` flags only listed fixture event names in
  production output (its `commonPatterns` include `charon:fixture-composer-focus`).
- `docs/UX.md` "Single-shelf layout": the composer "remains anchored and visible at the bottom".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/motion src/components/ui` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Suggested executor toolkit

- Skills `apple-design` (required by AGENTS.md for motion work),
  `animation-accessibility`, `animation-performance`.

## Scope

**In scope**: files in the drift-check list, including `scripts/check-privacy.ts` and `docs/UX.md`.

**Out of scope**: toast content, the capture status keys, Base UI upgrade.

## Git workflow

- Branch: `codex/043-toast-placement-and-reduced-motion`
- Commit: `fix(ui): anchor toasts above the composer and remove travel under reduced motion`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Travel token

`motion.css`: add `--motion-surface-travel: 150%;` in `:root` and
`--motion-surface-travel: 0%;` inside the existing `prefers-reduced-motion`
block. Extend `motion.test.ts` to assert both, plus `--motion-duration-surface: 360ms;` and its reduced value `120ms`.

**Verify**: `bun run --cwd apps/desktop test -- src/motion/motion.test.ts` → pass.

### Step 2: Use the token in `toast.tsx`

Replace every `150%` in the `Toast` class list with
`var(--motion-surface-travel)` (e.g. `[transform:translateY(var(--motion-surface-travel))]`
and `calc(var(--toast-swipe-movement-y)+var(--motion-surface-travel))`). Keep
`motion-reduce:transition-opacity`. Remove `will-change-transform` (transient
element; the transition already promotes it).

Extend `transient-primitives.test.ts` with a `toast` case asserting the source
contains `var(--motion-surface-travel)` and not `150%`.

**Verify**: `bun run --cwd apps/desktop test -- src/components/ui/transient-primitives.test.ts` → pass.

### Step 3: Viewport placement

Anchor the viewport to the top of the shelf column:
`pointer-events-none fixed top-(--toast-top) left-1/2 w-[min(calc(100%_-_2rem),34rem)] -translate-x-1/2 outline-none`.
In `app.css`: `:root { --toast-top: calc(28px + 0.5rem); }` and
`:root:has(.desktop-shell[data-native-titlebar]) { --toast-top: 0.5rem; }`.

Flip the stack in `Toast`:
- `bottom-0 origin-bottom` becomes `top-0 origin-top`, and `after:top-full` becomes `after:bottom-full`.
- `--offset-y`: `calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))`.
- Collapsed transform: `translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))`.
- Starting and default ending transform: `translateY(calc(-1*var(--motion-surface-travel)))`.
- Pass `swipeDirection={['up','right']}`; keep only the up and right
  `data-swipe-direction` ending variants.

Keep Base UI's default 5000 ms `timeout`; add no `timeout` prop.

Demo trigger: in `src/main.tsx` `DemoComposerBridge`, listen for a
`charon:fixture-toast` window event gated by `demoMode` exactly like the
composer-focus bridge, and call
`toast.add({ title: m.capture_status_warning_title(), description: m.capture_error_unknown(), type: 'warning' })`
(content-free). Add `/charon:fixture-toast/u` to `commonPatterns` in
`scripts/check-privacy.ts`.

Add to `docs/UX.md` "Single-shelf layout": "Capture status toasts appear at the
top of the shelf column below the drag region, never over the composer,
dismiss after 5 seconds, and can be swiped up or right."

**Verify**: e2e new test `toasts never cover the composer`: at 400×480 and
480×720, dispatch `charon:fixture-toast` and assert the toast rect is inside
the viewport and does not intersect `.composer-dock` → pass.

### Step 4: Reduced-motion e2e

New test `toasts crossfade in place under reduced motion`:
`emulateMedia({ reducedMotion: 'reduce' })`, dispatch `charon:fixture-toast`,
wait for `[data-slot="toast"]` to reach opacity `1`. Assert that
`getComputedStyle(document.documentElement).getPropertyValue('--motion-surface-travel').trim()`
is `'0%'` and the toast's `transition-property` is `opacity`. Click Close,
sample `getBoundingClientRect().top` with `requestAnimationFrame` until the
node is removed, and assert every sample stays within 1px of the value before
dismissal.

**Verify**: Chromium e2e → pass.

## Test plan

- `motion.test.ts` (2 assertions), `transient-primitives.test.ts` (toast case), e2e (placement, reduced motion).

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes including the two new tests
- [ ] `grep -n "150%" apps/desktop/src/components/ui/toast.tsx` → nothing
- [ ] `grep -n "motion-surface-travel" packages/theme/src/motion.css` → 2 matches
- [ ] `grep -n "charon:fixture-toast" scripts/check-privacy.ts` → one match
- [ ] `plans/README.md` status row updated

## STOP conditions

- Swipe-to-dismiss breaks with top anchoring (`swipeDirection={['up','right']}` does not dismiss): keep bottom anchoring, offset it above the composer with a CSS variable, and report.
- `bun run check:privacy` fails on `charon:fixture-toast` after a build: the bridge is not gated like `demoMode`; fix the gate, never the pattern.

## Maintenance notes

- Any new transient surface that travels must use `--motion-surface-travel`.
- A toast covers the search field and its Help/Preferences triggers for up to 5 s; this is the documented trade-off (Step 3 UX sentence).
