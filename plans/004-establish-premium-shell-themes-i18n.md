# Plan 004: Establish the shared premium theme, desktop shell, and EN/FR localization

> **Executor instructions**: Follow every step and verification gate. Stop on
> any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: run `git status --short` and inspect
> `packages/theme`, `apps/desktop/src/routes`, `apps/desktop/src/components`,
> `apps/desktop/src/styles`, and `apps/desktop/messages`. They should contain only the
> Plan 002 smoke UI plus Plan 003 bindings/client groundwork. If a product shell
> or token system already exists, stop and reconcile it with `docs/UX.md`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 002 and 003
- **Category**: direction, dx
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

The application must feel like a focused native tool, not a generic dashboard.
A framework-neutral semantic token system, consistent Base UI composition, and complete
localization boundary let later agents add dense workflows without visual drift
or hard-coded strings. The same tokens become the public site's visual contract
without forcing Astro to load React components. This plan also establishes the
shell states needed before feature behavior lands. An app-owned, physics-based
motion system makes interactions feel responsive and spatially coherent without
turning animation into decoration or coupling Astro to a React runtime.

## Current state

- `docs/UX.md` defines system typography, compact desktop geometry, three themes,
  semantic tokens, controlled radius, reduced motion, and keyboard behavior.
- Plan 002 created a minimal Router route and a few Base UI shadcn primitives.
- Plan 002 created `@charon/theme` placeholders consumed by desktop and Astro.
- Plan 002 pinned `motion` 12.43.0 in the desktop workspace only.
- Plan 003 exposes typed Workspace DTOs but no frontend state provider or shell.
- English must be the first-run default. French is opt-in and then persisted.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| shadcn docs | `bunx --bun shadcn@4.16.0 docs button field command dialog alert-dialog dropdown-menu empty input-group kbd popover scroll-area separator sheet skeleton toast tabs textarea toggle-group tooltip` | component guidance returned |
| Add components | `bunx --bun shadcn@4.16.0 add button button-group checkbox command dialog alert-dialog dropdown-menu empty field input input-group kbd popover scroll-area separator sheet skeleton toast tabs textarea toggle-group tooltip badge` | components added, exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun run test:desktop -- shell` | shell/theme/i18n tests pass |
| Quality | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use `shadcn` for component docs and Base UI composition rules.
- Use `design-taste-frontend` only to verify that the shared token contract can
  support the landing page now owned by Plan 013. It is not the interaction guide for the dense
  desktop product.
- Use `apple-design` for the desktop motion contract, spring tuning, material
  hierarchy, interruption behavior, and reduced-motion/transparency fallbacks.
- Use `vercel-react-best-practices` for provider and route boundaries.

## Scope

**In scope**:

- `packages/theme/package.json`, `packages/theme/src/tokens.css`,
  `packages/theme/src/motion.css`, `packages/theme/src/index.css`,
  `packages/theme/src/theme-contract.ts`
- `apps/desktop/src/styles/app.css`
- `apps/desktop/src/app/providers.tsx`,
  `apps/desktop/src/app/workspace-context.tsx`
- `apps/desktop/src/app/theme.ts`, `apps/desktop/src/app/locale.ts`
- `apps/desktop/src/motion/system.ts`, `apps/desktop/src/motion/preferences.ts`,
  `apps/desktop/src/motion/press.ts`, and tests beside them
- `apps/desktop/src/lib/ipc/workspace-client.ts`,
  `apps/desktop/src/lib/platform.ts`
- `apps/desktop/src/components/app-shell.tsx`,
  `apps/desktop/src/components/titlebar.tsx`,
  `apps/desktop/src/components/section-rail.tsx`,
  `apps/desktop/src/components/workspace-state.tsx`,
  `apps/desktop/src/components/theme-menu.tsx`,
  `apps/desktop/src/components/locale-menu.tsx`
- `apps/desktop/src/components/ui/**` added by the pinned shadcn CLI
- `apps/desktop/src/routes/__root.tsx`, `apps/desktop/src/routes/index.tsx`,
  `apps/desktop/src/routes/notes.tsx`, `apps/desktop/src/routes/settings.tsx`,
  `apps/desktop/src/routes/stats.tsx`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `apps/desktop/src/**/*.test.ts`, `apps/desktop/src/**/*.test.tsx`
- `apps/site/src/styles/global.css` only to consume the finalized theme contract
- `docs/UX.md` only for implementation clarifications

**Out of scope**:

- Note CRUD, real search, bulk behavior, clipboard, quick capture, settings form
  behavior, chart packages, custom window decorations, and native shortcuts.
- Gradients, glow, generic cards for every group, web fonts, and unlocalized
  visible copy.
- Decorative bounce, `transition: all`, gesture state driven by timers, animated
  layout on virtual rows, stacked backdrop blur, input locks, sound, and fake
  haptics.

## Git workflow

- Branch: `codex/004-shell-themes-i18n`
- Commits: `feat(ui): add semantic desktop shell`,
  `feat(i18n): add english and french locales`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add documented Base UI components

Run the docs command before the add command. Keep generated component anatomy.
Use Base UI's `render` prop for custom elements, never `asChild`. Group related
controls with `ButtonGroup`, `FieldGroup`, and `InputGroup`; use `data-icon` on
button icons. Prefer Tabler outline icons from central imports and accessible
names on icon-only controls. Do not create custom buttons, dialogs, menus,
tooltips, toasts, or empty states when a shadcn primitive exists.

**Verify**: `rg -n "asChild|#[0-9a-fA-F]{3,8}" apps/desktop/src/components --glob '*.tsx'` -> no matches; `bun run typecheck` -> exit 0.

### Step 2: Implement semantic light, Solarized, and dark tokens

In `packages/theme/src/tokens.css`, define tokens for canvas, surface, elevated surface, text,
muted text, border, accent, accent contrast, selection, destructive, warning,
success, focus ring, and chart series. Scope overrides under
`[data-theme='light']`, `[data-theme='solarized']`, and `[data-theme='dark']`.
Both app roots use a system UI stack with Apple and Linux fallbacks. Enable
optical sizing where the chosen system font supports it, tune tracking by role,
and use deliberate line-height rather than browser defaults. Use no gradients,
glow, excessive transparency, or theme-specific classes in TSX.

Export allowed theme names, storage key, and DOM attribute contract from
`theme-contract.ts` without React or Astro imports. Implement desktop `theme.ts`
with validated local persistence, OS dark-mode observation
only as an optional fourth `system` preference if UX docs allow it, and an early
inline bootstrap in the HTML shell to avoid flash. Persist explicit light,
Solarized, or dark choices. Respect `prefers-reduced-motion`,
`prefers-reduced-transparency`, and `prefers-contrast`. Reserve translucent
material for the titlebar, quick-capture surface, and transient selection/command
layers; never stack blurred surfaces. Provide opaque semantic-token fallbacks
with stronger separators.

Make `apps/site/src/styles/global.css` import the package export and render a
minimal token swatch check only in tests. Plan 013 owns the actual site UI.

**Verify**: `bun run test:desktop -- theme` -> invalid saved values fall back to light; all three theme attributes and reduced-motion behavior pass. `bun run build:site` -> shared CSS resolves with no duplicated theme definition.

### Step 3: Implement the fluid, interruptible desktop motion system

Create a thin app-owned adapter over `motion/react`; feature components must
consume named motion profiles and hooks rather than inventing transition values.
Use `LazyMotion`/`m` with the smallest documented feature bundle that supports
the shipped interactions, and one root `MotionConfig` with user reduced-motion
behavior. `@charon/theme` exports only CSS custom properties for static timing
and preference fallbacks; it must not import Motion or React.

Define and test only three profiles:

1. `feedback`: immediate `pointerdown`/keyboard-active scale or opacity response,
   visually present within one frame and complete within about 100ms;
2. `surface`: critically damped spring with no bounce and a perceived response
   around 300-400ms for sheets, bars, dialogs, and route surfaces;
3. `gestureRelease`: the only slightly under-damped spring, used only after a
   real drag/swipe and initialized with measured release velocity.

Animations must start from current Motion values, remain interruptible, and
retarget cleanly under repeated clicks or rapid open/close. Never wait for an
exit animation before accepting input. Entrances and exits follow the same path
in reverse and use `transform-origin` related to the trigger. Animate only
`transform` and `opacity`; use Motion values or observer APIs instead of raw
scroll handlers. Keep rubber-banding out until a direct-manipulation gesture is
actually scoped; if introduced later, cap resistance visually and require about
10px hysteresis before a state transition.

Create `preferences.ts` to combine Motion's reduced-motion signal with CSS media
queries for reduced transparency and increased contrast. Reduced motion replaces
springs with instant changes or short opacity fades while preserving focus,
state, and hierarchy. Tests use deterministic reduced-motion settings and assert
press feedback, rapid reversal, no input lock, cleanup, and opaque fallbacks.

**Verify**: `bun run test:desktop -- motion press preferences` -> named profiles,
pointer/key feedback, mid-animation reversal, repeated trigger, reduced settings,
and cleanup pass; `rg -n "transition:\s*all|transition-all|addEventListener\(['\"]scroll" apps/desktop/src` -> no matches.

### Step 4: Implement deterministic EN/FR locale control

Wrap Paraglide behind `locale.ts`. First launch is `en` regardless of browser
locale. Explicit selection persists `en` or `fr`. Use a client-rendered locale
switch without losing unsaved drafts; if the pinned Paraglide API cannot safely
switch without reload, warn and request confirmation before reload.

Move every visible shell string, tooltip, empty state, route title, and aria label
to `apps/desktop/messages/en.json` and `apps/desktop/messages/fr.json`. Keep message keys semantic, not
English sentences. Set document `lang` on change. Tests must fail when a key is
missing from either locale.

**Verify**: `bun run test:desktop -- locale` -> first-run EN, persisted FR, invalid-locale fallback, document lang, and message parity pass.

### Step 5: Build the responsive desktop shell and route skeletons

Create `AppShell`: a restrained title area, 240px section rail, flexible main
pane, optional contextual inspector slot, and compact status region. At widths
below 760px, turn the rail into a Sheet without reducing keyboard reachability.
Use separators and whitespace rather than card grids. Surface radii follow
14/10/8px rules from `docs/UX.md`.

Create typed file routes for `/notes`, `/settings`, and `/stats`; redirect `/` to
`/notes`. Stats displays a localized feature-not-enabled empty state until Plan
010. Settings and notes render skeleton/empty/error placeholders through shared
`WorkspaceState`. Include route-level error components and meaningful focus
targets after navigation.

Use the surface profile for the compact rail Sheet and transient route surfaces.
Its origin must align with the invoking control, focus moves at the semantic
state change rather than animation end, and rapid open/close must reverse without
flashing or freezing input. Do not animate the fixed shell geometry on startup.

**Verify**: `bun run test:desktop -- shell` -> route redirect, rail desktop/mobile mode, loading, empty, and error states pass.

### Step 6: Connect a read-only Workspace provider

Build one `workspace-client.ts` wrapper around generated Tauri commands and
events. In browser tests, inject a fake client. `WorkspaceProvider` owns loading,
the last valid snapshot, typed errors, and subscription lifecycle; it exposes no
mutation helpers yet. Do not introduce TanStack Query or a general state library.

The shell shows: no workspace onboarding placeholder, loading skeleton, active
workspace, recoverable warning with last snapshot, and blocking corrupt state.
Ensure event listeners unsubscribe exactly once on workspace switch/unmount.

**Verify**: `bun run test:desktop -- workspace-context` -> load, event update, stale event ignore, error retention, switch, and cleanup tests pass.

## Test plan

- Automated contrast check may be a small token test, but manual contrast review
  is still required for focus, selection, destructive, and muted text in all
  three themes.
- Component tests cover Base UI keyboard operation, mobile rail focus return,
  localized accessible names, route errors, and provider cleanup.
- Motion tests and manual slow-motion review cover pointerdown response, current-
  value retargeting, symmetric paths, rapid reversal, opaque fallbacks, and no
  input lock.
- Capture screenshots at 1280x800 and 800x600 for all three themes and both
  locales; store only stable golden images if the repo accepts visual snapshots.
- Verification: `bun run check` -> exit 0 with all new tests.

## Done criteria

- [ ] Shell has one semantic token system and no raw color literals in TSX.
- [ ] `@charon/theme` is framework-neutral and both apps consume its package export.
- [ ] Light, Solarized, and dark cover all shared states without gradients/glow.
- [ ] English is first-run default and French persists after explicit selection.
- [ ] No visible or accessibility string bypasses Paraglide.
- [ ] Base UI uses `render`, shadcn anatomy, and supported icon composition.
- [ ] Desktop motion uses three named profiles, responds on press, is reversible,
  and honors reduced motion/transparency/contrast without hiding state.
- [ ] `/notes`, `/settings`, and `/stats` route states are keyboard accessible.
- [ ] Workspace subscriptions clean up and retain the last valid snapshot on recoverable errors.
- [ ] `bun run check` passes and this plan is `DONE` in the index.

## STOP conditions

- The pinned shadcn CLI generates Radix primitives or requires `asChild`.
- Locale switching can discard drafts and no confirmation-safe approach exists.
- Meeting the visual spec appears to require custom primitives instead of theme
  tokens and composition.
- Astro needs a React island or duplicate theme values merely to consume the tokens.
- A route needs direct filesystem access or broad Tauri plugin permissions.
- Any theme fails WCAG AA for normal text after two token adjustments.

## Maintenance notes

- Review all future components in all three themes and both locales.
- Change shared tokens through `@charon/theme`; do not patch desktop and site independently.
- Chart colors were part of this historical plan; Plan 009 removes them after
  ADR 0011 rejects Insights.
- Product UI can be compact, but touch/click targets and keyboard focus must not
  be sacrificed for density.
