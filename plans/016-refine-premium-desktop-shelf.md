# Plan 016: Retarget the premium desktop to a compact vertical capture shelf

> **Executor instructions**: Follow this plan step by step. Invoke
> `apple-design`, `design-taste-frontend`, `frontend-design`, `minimalist-ui`,
> `emil-design-eng`, `web-design-guidelines`, `vercel-react-best-practices`, and
> `shadcn` before implementation. Apply only product-UI guidance from skills
> that primarily target marketing pages. Use Base UI's `render` composition API,
> never Radix `asChild`. Keep every user-facing string in Paraglide. This plan
> owns the compact visual foundation and window geometry only; Plan 017 owns the
> complete feature-by-feature fit. Do not change persistence, privacy, native
> capture, Attachment ownership, clipboard, or deletion semantics. Stop on every
> STOP condition instead of improvising.
>
> **Drift check (run first)**:
> `git diff --stat 7294773..HEAD -- docs/UX.md docs/TESTING.md packages/theme/src apps/desktop/src-tauri/tauri.conf.json apps/desktop/src apps/desktop/messages apps/desktop/e2e apps/desktop/package.json bun.lock plans/README.md`
> If an in-scope file changed, compare the Current state evidence and target
> composition below with the live code. Stop if the single-shelf journeys,
> Base UI foundation, theme contract, virtualized-row boundary, or first-run
> window lifecycle changed materially.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 009-013 implemented baseline; Plan 014 automated harness
- **Category**: direction, tech-debt, perf, tests
- **Planned at**: commit `7294773`, 2026-08-11

## Why this matters

The current desktop opens at 960 by 640 pixels with a 720-pixel minimum width.
That makes Charon read as a conventional document window, while the supplied
reference demonstrates the desired posture: a narrow, tall utility shelf beside
the application where work is happening. In the 1920 by 1080 reference video,
the right-hand shelf occupies roughly 450 pixels, keeps search at the top, Notes
in one vertical stack, and the composer at the bottom.

Charon must adopt that compact posture without copying the reference app or
discarding Charon's richer local workflows. This plan establishes a 480-pixel
first-run window, a 400-pixel supported minimum, compact chrome, a bounded Note
stack, and an anchored composer. Plan 017 then proves every feature and state in
that geometry, including managed Attachments.

## Reference-video analysis

The operator supplied a 27.24-second, 1920 by 1080 video on 2026-08-11. The
following observations are design evidence, not a license to copy proprietary
assets or behavior:

- The target app stays around 450 pixels wide and much taller than it is wide.
- A single search field and compact overflow action form the top control row.
- Notes are vertically stacked as clearly bounded reading surfaces with no
  navigation rail and no multi-column layout.
- The composer is visually anchored at the bottom and remains available while
  the Note list scrolls.
- Attached images appear as compact previews in the reference, both in a Note
  and in its composer. Charon must not copy that behavior: its accepted contract
  permits safe Attachment metadata only and owns Attachments only after a Note
  exists. Charon displays generic file affordances, names, and counts, never
  arbitrary thumbnails or pre-Note staged files.
- The target's calmness comes from containment, stable geometry, and low control
  density. Charon keeps its own Solarized identity, Lavender crossing line,
  Open/Done model, Tags, explicit copy, and local Workspace language.

## Locked direction

Treat these decisions as requirements:

| Decision | Locked target |
| --- | --- |
| Reference posture | Narrow utility shelf calibrated by the supplied video, not Apple Notes or a wide document window |
| First-run window | 480 by 720 logical pixels |
| Supported minimum | 400 by 480 logical pixels at 100% zoom |
| Wide behavior | Keep the shell column at no more than 34rem/544px and center it; do not stretch Notes across spare width |
| Existing window state | Respect a user's saved size; do not silently erase or overwrite persisted window state |
| 200% review | Use a 720px-wide native window so the effective content width remains at least 360px |
| Structure | Compact titlebar, search, Open/Done plus selection control, one scrolling Note stack, anchored composer |
| Notes | Calm bounded list rows with 6-8px vertical rhythm, no card grid, lift, or row shadow |
| Attachments | Count in collapsed rows; generic icon, safe filename, state, and remove action in the expanded editor only |
| Composer | Body-only capture field; no pre-Note Attachment staging and no permanent help sentence |
| Brand | Solarized remains default; small Charon wordmark; Lavender remains a scarce one-pixel interaction signature |
| Motion | Immediate press response and near-invisible spatial continuity only |
| Platforms | Same compact composition everywhere; native outer-window controls and conventions remain platform-owned |

The desired emotion is **calm readiness**. The shelf should feel available next
to the user's main task, not like another full-screen workspace. “Premium” comes
from exact spacing, hierarchy, typography, focus, and complete states, not from
glass, gradients, large shadows, or decorative animation.

## Target composition

First-run 480 by 720 window:

```text
+----------------------------------------------+
| CHARON                              [?] [gear]|
+----------------------------------------------+
| [ Search Notes and Tags…                 ][x]|
| [ Open 5 ] [ Done 1 ]              [Select] |
|                                              |
| +------------------------------------------+ |
| | ○  Agent handoff                     …  | |
| |    Verify the empty state…  Agent  · 1  | |
| +------------------------------------------+ |
| | ○  Local Markdown                   …   | |
| |    Visible files, explicit copy… Privacy| |
| +------------------------------------------+ |
| |                  scrolling stack        | |
| +------------------------------------------+ |
|                                              |
| [ Capture a thought…                    ↑ ] |
+----------------------------------------------+
```

The row boundaries are functional reading surfaces in one list, not a rounded
card grid. They use one semantic fill, a restrained border, no shadow, and the
same alignment. At 400px, secondary metadata collapses before the title,
preview, status, menu, search, errors, or composer. At wider sizes, the content
does not exceed 34rem.

The expanded Note remains the same Note, in the same virtual row:

```text
+------------------------------------------+
| ○  Agent handoff                      …  |
| | [Write] [Preview]    Saved       [x] | |
| |                                      | |
| | Markdown editor / safe preview       | |
| |                                      | |
| | Tags                                 | |
| | [Research] [Agent] [Add…]            | |
| | Attachments                    [Add]  | |
| | file  release-brief.pdf          [x]  | |
+------------------------------------------+
```

Plan 016 only establishes enough responsive styling for this state not to
overflow. Plan 017 owns its complete interaction, failure, destructive, and
accessibility acceptance.

## Current state

- `apps/desktop/src-tauri/tauri.conf.json:14-23` defines a 960 by 640 first-run
  window with `minWidth: 720` and `minHeight: 480`.
- `apps/desktop/src/styles/app.css:288-294` permits a 72rem shelf, so the current
  surface reads as a wide application instead of a side shelf.
- `apps/desktop/src/styles/app.css:295-352` places search, two status buttons,
  and selection controls on one wide toolbar and lets selection actions scroll
  horizontally.
- `apps/desktop/src/styles/app.css:365-420` paints the whole scrolling viewport
  as one beige surface and gives each Note a full-width divider.
- `apps/desktop/src/styles/app.css:655-683` treats 720px as the only narrow
  breakpoint; the target app must treat 480px as the normal case.
- `apps/desktop/src/components/titlebar.tsx:25-57` uses a 7rem wordmark and a
  modal AlertDialog for ordinary shortcut help.
- `apps/desktop/src/features/notes/note-screen.tsx:254-335` renders search,
  hand-built status buttons, and selection entry at equal weight.
- `apps/desktop/src/features/notes/note-screen.tsx:422-444` renders a permanent
  capture hint over the composer and marks the dock as transient material.
- `apps/desktop/src/features/notes/note-row.tsx:94-212` already owns a stable
  status, derived body text, conditional Tag and Attachment metadata, one
  Actions menu, and the expanded editor within the row. Preserve that boundary.
- `apps/desktop/src/features/notes/note-list.tsx` already virtualizes the 20,000
  Note stack. The virtual `<li>` remains the sole owner of Y translation.
- `apps/desktop/e2e/release.spec.ts:81-89` checks only one synthetic zoom state;
  it does not cover the 480px default, 400px minimum, or compact geometry.

## Visual and material contract

Keep the accepted primitive values byte-exact. Product components continue to
use semantic variables only. Add or reconcile these theme roles if absent:

| Role | Token | Use |
| --- | --- | --- |
| Window canvas | `--canvas` | Outer window, permanent titlebar and dock |
| Note surface | `--surface-elevated` | Each bounded Note and expanded Note |
| Resting control | `--surface` | Search, status group, composer field |
| Hover | `--surface-hover` | Row/control feedback without lift |
| Pressed | `--surface-pressed` | Pointer/key-down response |
| Selection | `--selection-subtle` | Selected Note background |
| Separator | `--separator` | Titlebar/dock and internal editor boundaries |
| Focus/signature | `--focus`, `--selection-border` | Focus ring and one-pixel Lavender line |
| Transient shadow | `--shadow-transient` | Popover/menu/tooltip only |

Initial theme-owned values, subject only to contrast-preserving adjustment in
the same hue family:

| Token | Solarized | Light | Dark |
| --- | --- | --- | --- |
| `--surface-hover` | `#F8F2DF` | `#F8F5F1` | `#282033` |
| `--surface-pressed` | `#F1E9D2` | `#EEE9E4` | `#31273F` |
| `--selection-subtle` | `#F1EFFB` | `#F1F0FC` | `#2C2644` |
| `--separator` | `#D6CFBC` | `#DDD7E2` | `#3A3147` |

Permanent titlebar and composer surfaces are solid. Translucency is limited to
transient Popovers, menus, tooltips, dialogs, and toasts and must have the
existing reduced-transparency solid fallback. Notes, shelf, toolbar, and
composer receive no drop shadow.

## Motion gate

Only the following motion belongs in this visual foundation:

| Location | Target |
| --- | --- |
| Button/icon press | Existing direct profile, visible on pointer/key down, scale `.98`, no delayed acknowledgement |
| Tooltip/menu/Popover | Origin-aware opacity plus scale `.98-.985`; 120-180ms; symmetric exit; reduced motion is opacity/static |
| Row/editor surface | Existing critically damped nested surface, transform and opacity only, live retarget, no virtual-row animation |
| New Note signature | One 160ms one-pixel line acknowledgement after successful create; no row travel or stagger |

Reject list entrance, search-result motion, a sliding Open/Done pill, row lift,
hover shadow, parallax, bounce, gradients, grain, and composer-focus animation.
Input stays available while any motion settles.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift | `git diff --stat 7294773..HEAD -- docs/UX.md docs/TESTING.md packages/theme/src apps/desktop/src-tauri/tauri.conf.json apps/desktop/src apps/desktop/messages apps/desktop/e2e apps/desktop/package.json bun.lock plans/README.md` | reviewed before edits |
| Targeted desktop | `bun run test:desktop -- theme-contract shell note-screen note-list capture-input motion` | all targeted tests pass |
| Typecheck | `bun run --cwd apps/desktop typecheck` | exit 0 |
| Desktop build | `bun run build:desktop` | exit 0 |
| Browser | `bun run test:e2e` | Chromium and WebKit pass |
| Accessibility | `bun run test:a11y` | zero serious/critical violations |
| Performance | `bun run test:perf` | 20,000-Note, DOM, and bundle budgets pass |
| Privacy | `bun run check:privacy` | no content/path/secret sentinel leak |
| Aggregate | `bun run check` | lint, typecheck, desktop/site tests pass |
| Rust regression | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | all native/domain tests pass unchanged |
| Final release gate | `bun run verify:release` | every automated gate passes twice |
| Raw product colors | `rg -n "#[0-9A-Fa-f]{3,8}|rgba?\\(|oklch\\(" apps/desktop/src --glob '!**/*.test.*'` | no matches |
| Anti-slop | `rg -n "transition: all|transition-all|shadow-(md|lg|xl)|linear-gradient|radial-gradient|filter: drop-shadow" apps/desktop/src` | no product matches |
| Diff | `git diff --check && git status --short` | no whitespace errors; only in-scope files changed |

## Suggested executor toolkit

- `apple-design`: compact hierarchy, press response, spatial continuity,
  interruptibility, native outer-window restraint, and reduced preferences.
- `design-taste-frontend` and `frontend-design`: audit the current shelf first,
  then keep the result authored and specific to Charon rather than templated.
- `minimalist-ui`: use only its flat hierarchy, warm restraint, typographic
  precision, and shadow discipline. Ignore bento/marketing prescriptions.
- `emil-design-eng`: review each changed control in a Before/After table and
  verify press, focus, origin, duration, and exit.
- `web-design-guidelines`: review compact responsive behavior and accessibility.
- `vercel-react-best-practices`: preserve virtualization, memoized Note rows,
  stable render boundaries, and input responsiveness.
- `shadcn`: use project-aware Base UI mode for the existing Button, Tooltip,
  Popover, ToggleGroup, DropdownMenu, and InputGroup primitives; do not overwrite
  local primitives from the registry.

## Scope

**In scope**:

- `docs/UX.md`, `docs/TESTING.md`
- `packages/theme/src/tokens.css`, `packages/theme/src/motion.css`
- `apps/desktop/src-tauri/tauri.conf.json` for first-run/minimum geometry only
- `apps/desktop/src/styles/app.css`
- `apps/desktop/src/components/titlebar.tsx` and used transient primitives
- `apps/desktop/src/features/notes/note-screen.tsx`
- `apps/desktop/src/features/notes/note-list.tsx`
- `apps/desktop/src/features/notes/note-row.tsx`
- `apps/desktop/src/features/notes/capture-input.tsx`
- Tests beside changed desktop files and compact geometry assertions in
  `apps/desktop/e2e/release.spec.ts`
- Touched EN/FR messages and generated Paraglide output only through its owner
- `apps/desktop/package.json` and `bun.lock` only if a proved-unused animation
  dependency is removed through Bun
- `plans/README.md` only after every done criterion passes

**Out of scope**:

- Rust domain/IPC, Workspace persistence, Attachment bytes and ownership,
  capture adapters, clipboard behavior, deletion semantics, preference schema,
  updater/signing/release workflows, or platform capability claims
- Complete editor, Attachment, selection, copy, Delete, Preferences, Workspace,
  and permission-state alignment; Plan 017 owns those workflows
- Staging Attachments in the composer, thumbnails/previews, drag/drop, external
  source paths, or changes to managed Attachment limits
- Site layout/copy/media regeneration; Plan 017 refreshes real media after the
  complete compact feature matrix passes
- New font, icon package, UI library, state library, animation dependency,
  route, rail, navigation destination, theme, or product mode
- Removing virtualization, per-row visual React state, or animating the
  virtualizer's positioning transform
- Silently clearing saved window state or imposing a maximum window width

## Git workflow

- Branch: `codex/016-compact-desktop-shelf`
- Commits, in order:
  1. `docs(ux): lock the compact shelf direction`
  2. `refactor(window): target the compact shelf geometry`
  3. `refactor(theme): rebalance compact surface roles`
  4. `refactor(ui): build the compact shelf foundation`
  5. `test(desktop): cover compact shelf geometry`
- Use Bun only for JavaScript/TypeScript and Cargo only for Rust verification.
- Do not push or open a pull request unless separately authorized.

## Steps

### Step 1: Freeze the compact desktop visual contract

Update `docs/UX.md` before component work:

- name the narrow utility-shelf posture and the 480 by 720 first-run target;
- define 400px as the 100% minimum and 720px as the 200% review width;
- replace the former 800-880px centered-column direction with a 34rem maximum;
- document compact titlebar, two-line toolbar, bounded vertical Note surfaces,
  anchored composer, and one-pixel Lavender signature;
- state that the supplied reference is calibration only and that Charon does
  not copy thumbnails, composer Attachments, or proprietary chrome;
- preserve every product, keyboard, failure, deletion, privacy, Attachment,
  virtualization, and capture contract not explicitly changed here;
- record the exact motion allow/reject list from this plan.

**Verify**: `rg -n "480|400|34rem|compact|one-pixel|bounded vertical|composer" docs/UX.md`
finds every revised contract and `git diff --check -- docs/UX.md` exits 0.

### Step 2: Set first-run window geometry without overriding user choice

In `apps/desktop/src-tauri/tauri.conf.json`, change only the main window's
first-run geometry to 480 by 720 and its minimum width to 400. Keep minimum
height 480, `resizable: true`, native title/controls, bundle identity, CSP, and
all platform configuration unchanged.

Verify the existing window-state plugin behavior. A user-resized/restored window
must remain authoritative; do not delete its state or add a resize-on-upgrade
effect. Wider restored windows show the same capped shell rather than stretched
rows.

Add a configuration-level test or existing config assertion for these exact
values. Do not add runtime platform detection to React.

**Verify**: the config assertion passes; `bun run tauri:build -- --debug` reaches
or completes native bundling without a window-config error; a manual first-run
profile opens at 480 by 720 while a saved wider profile remains unchanged.

### Step 3: Rebalance semantic compact surfaces

Add the semantic roles from Visual and material contract to
`packages/theme/src/tokens.css`. Extend the existing pure contrast tests so
primary and muted text meet their accepted ratios on every new surface and
focus/selection boundaries remain visible in Solarized, Light, and Dark.

In `packages/theme/src/motion.css`, keep the existing direct and surface
profiles. Add only named transient timing roles needed by used Base UI
primitives. Reduced motion removes travel/scale and keeps short opacity/static
feedback.

Do not change approved primitive values or remap site-specific use. If an
initial value fails contrast, adjust that semantic value within the same hue
family and record the final value in this plan before continuing.

**Verify**: `bun run test:desktop -- theme-contract theme motion` passes and the
raw-product-color scan finds no component color.

### Step 4: Compact the titlebar and toolbar

Update the titlebar and Note toolbar:

- Keep the native drag region and macOS traffic-light-safe inset.
- Use a 44-48px solid titlebar. Reduce the wordmark to about 5.25-5.75rem and
  retain the existing Dark asset and extreme-width icon fallback.
- Keep Help and Preferences as 28-32px visible icons inside 44px effective
  targets. Add localized Tooltips.
- Replace ordinary shortcut Help's AlertDialog with an anchored Popover. It
  contains concise capture help only; permission detail remains in Preferences.
- Make search the first full-width control row at normal compact width.
- Replace the Open/Done Button fieldset with the existing Base UI ToggleGroup
  semantics. Put Open/Done and Select on the second row.
- No control row may scroll horizontally. Long French labels wrap or compact
  into accessible icon-plus-tooltip variants before clipping.
- Focus, selection, active status, and hover remain visually distinct.

Do not change filtering, Selection, commands, or keyboard shortcuts.

**Verify**: `bun run test:desktop -- shell note-screen tooltip popover` passes;
browser assertions confirm no horizontal overflow at 400, 480, and 544px.

### Step 5: Build the compact bounded Note stack

Keep the virtual scroll viewport transparent. Each Note becomes one bounded
surface with 6-8px vertical rhythm, the existing surface radius, a one-pixel
border, and no shadow/lift. This is a list, not a grid. Keep the derived title,
one restrained preview line, status control, conditional Tag/Attachment
metadata, Actions menu, and editor inside the same stable Note ID.

Use a three-part compact grid: 44px status target, `minmax(0, 1fr)` content, and
compact trailing actions. Show at most two Tag chips and an overflow count at
normal width. Attachment metadata in the collapsed row is count-only. Collapse
Tag chips first at 400px while retaining an accessible metadata summary.

Change the normal row estimate only after measuring the final compact row.
Retain `measureElement`, overscan, stable keys, the <150 rendered-row budget,
and virtualizer ownership of positioning. Keep the one-pixel Lavender line for
active, selected, or expanded state only.

**Verify**: `bun run test:desktop -- note-list note-screen search selection-model`
and `bun run test:perf` pass; 20,000 Notes render fewer than 150 DOM rows.

### Step 6: Anchor the body-only composer

Make the composer a solid bottom layer aligned to the compact shell. Remove the
permanent rendered capture hint and move its essential text to Help and
Preferences without deleting or migrating `captureHintDismissed`.

Keep the existing body-only InputGroup, Enter submit, whitespace no-op, pending,
double-submit prevention, preserved failure input, retry, Done-to-Open result,
and portable focus semantics. Do not add the reference video's plus button,
pre-Note Attachment queue, multiline editor, drag/drop, or thumbnail strip.

The field remains at least 40px high, the submit icon has an accessible name,
and contextual errors may grow upward without hiding the field. There is no
focus animation when the portable shortcut targets it.

**Verify**: `bun run test:desktop -- capture-input note-screen shell` passes and
`rg -n "capture_hint\\(" apps/desktop/src` finds no rendered shelf use.

### Step 7: Align transient primitives and compact motion

For changed Help, Tooltip, Popover, ToggleGroup, and DropdownMenu primitives,
use Base UI starting/ending data states with origin-aware transform/opacity
only. Feedback begins on pointer/key down; no fixed gesture timeline or input
lock is introduced. Add reduced-motion, reduced-transparency, and
increased-contrast variants.

Remove `tw-animate-css` only if a repository search proves no live use remains;
use Bun to regenerate the lockfile. Never overwrite local primitives from a
registry update.

**Verify**: targeted primitive/motion tests pass; the anti-slop scan has no
unapproved result; `bun install --frozen-lockfile` succeeds if the dependency
changed.

### Step 8: Prove the compact foundation

Extend tests after the visual system settles:

- unit/component tests for compact titlebar, Help Popover, ToggleGroup status,
  Note hierarchy, metadata collapse, composer, and no behavior regression;
- Playwright geometry at 400x480, 480x720, 544x720, 720x480, and 720px native
  width with synthetic 200% zoom;
- EN/FR and Solarized/Light/Dark on at least the 400 and 480 widths;
- keyboard focus, coarse pointer, reduced motion/transparency, and increased
  contrast for changed surfaces;
- assertions on roles, names, focus, state, geometry, and computed semantic
  surfaces, not full DOM/class snapshots.

Document the dated visual review in `docs/TESTING.md`. Do not regenerate public
site media yet; Plan 017 owns media after the complete functional matrix.

**Verify**: targeted tests, `bun run check`, build, E2E, Axe, performance,
privacy, Cargo, and `bun run verify:release` twice all pass.

## Test plan

- Configuration: exact first-run/minimum window geometry and preserved saved
  size behavior.
- Shell: compact brand, native-safe drag region, accessible Help/Preferences,
  two-row toolbar, no horizontal overflow.
- Notes: title/preview hierarchy, conditional Tags and Attachment count,
  status/action availability, active/focus/selected distinction, virtual bound.
- Composer: create/no-op/pending/failure/retry/focus at compact width.
- Motion/accessibility: pointer/key-down response, symmetric transient origin,
  reduced preferences, keyboard, coarse pointer, EN/FR, all themes.
- Whole layout: 400x480, 480x720, 544x720, and effective 360px at 200%.

## Done criteria

- [ ] `docs/UX.md` defines the compact vertical-shelf direction and preserves product contracts.
- [ ] First-run geometry is 480x720 with 400x480 minimum; saved user size is not silently reset.
- [ ] Shell content caps at 34rem and remains composed from effective 360px upward.
- [ ] Search is the first compact row; Open/Done and Select form a non-scrolling second row.
- [ ] Notes are one virtualized vertical list of bounded surfaces, not a grid, with no shadow/lift.
- [ ] Collapsed rows preserve title, preview, status, action, and accessible Attachment count at 400px.
- [ ] The composer is solid, anchored, body-only, and has no permanent help copy or pre-Note Attachment staging.
- [ ] Solarized default, approved primitives, system fonts, Tabler icons, radii, and Lavender scarcity remain unchanged.
- [ ] Changed motion is immediate, interruptible, transform/opacity-only, and preference-safe.
- [ ] No raw product color, gradient, glow, permanent glass, heavy shadow, new UI/font/icon/motion dependency, or `transition: all` exists.
- [ ] Targeted tests, aggregate checks, E2E, Axe, performance, privacy, Cargo, and two release gates pass.
- [ ] Only in-scope files changed and Plan 016 is `DONE` in `plans/README.md`.

## STOP conditions

Stop and report back if:

- Drift materially changes the single shelf, theme, Base UI, virtualizer, or
  current window-state ownership.
- The design cannot keep search, status, errors, destructive access, and the
  composer usable at 400px without removing an accepted feature.
- Compacting the window would require silently deleting saved window state.
- The virtualizer would need to be removed or its positioning transform animated.
- A thumbnail, arbitrary Attachment preview, pre-Note Attachment queue, or
  external source path appears necessary.
- A product/privacy/deletion/shortcut/platform change would require an ADR.
- Any user-facing string would be hardcoded outside Paraglide.
- A serious/critical Axe issue, 20,000-Note regression, horizontal overflow,
  clipped French label, privacy failure, or flaky final gate remains.
- A new dependency, route, window, persistent mode, font, icon family, or UI
  system appears necessary.

## Maintenance notes

- Treat 480px as the normal design canvas, not a breakpoint afterthought.
- Keep the 34rem cap even when users restore wider windows; spare width is
  canvas, not permission to create another column.
- Keep Attachment UI metadata-only. If thumbnails or composer Attachments are
  reconsidered, create an ADR for preview safety and pre-Note ownership first.
- Preserve the virtualizer's sole ownership of row positioning. Any future row
  motion belongs in a nested transform/opacity surface.
- The compact foundation is incomplete until Plan 017 proves every real feature
  and state and refreshes real site media.
