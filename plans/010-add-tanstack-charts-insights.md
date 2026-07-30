# Plan 010: Add optional local insights with TanStack Charts

> **Executor instructions**: This plan is optional P2. Do not start it while any
> P1 dependency is incomplete. Follow every verification gate and stop on every
> STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: inspect `/stats`, package versions, Workspace DTOs,
> theme chart tokens, and feature-flag handling. Expected state: a localized
> disabled-state route, chart semantic tokens, and no chart dependency or
> analytics persistence. Stop if another chart library or persisted metric store
> already exists.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 005 and 008
- **Category**: direction, perf, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

Local insights can help users see prompt-idea flow without turning Charon into a
project-management dashboard. TanStack Charts is active again and its new typed
grammar fits the selected stack, but packages `@tanstack/charts` and
`@tanstack/react-charts` are at their first `0.0.0` release from 2026-07-29.
The integration must therefore be isolated, feature-flagged, accessible, and
replaceable without touching Workspace persistence or note screens.

## Current state

- Note metadata contains created, updated, completed, status, section, and trash
  timestamps sufficient for derived metrics.
- `/stats` exists only as a localized disabled empty state.
- Theme tokens include semantic chart colors, but no TanStack types or D3 modules
  exist in the app.
- Privacy forbids remote analytics. Every metric must be derived locally from the
  current Workspace snapshot and never persisted as a second source of truth.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `bun --cwd apps/desktop add --exact @tanstack/charts@0.0.0 @tanstack/react-charts@0.0.0 d3-array@3.2.4 d3-scale@4.0.2 && bun --cwd apps/desktop add --dev --exact @types/d3-array@3.2.2 @types/d3-scale@4.0.9` | root lockfile updated, exit 0 |
| Metrics tests | `bun run test:desktop -- insights` | all aggregation tests pass |
| Chart tests | `bun run test:desktop -- charts stats` | all render/fallback tests pass |
| Bundle | `bun run build:desktop` | exit 0; stats chunk is lazy |
| Quality | `bun run check` | exit 0 |

## Suggested executor toolkit

- Read <https://tanstack.com/charts/latest/docs/overview>, installation, React
  adapter, accessibility, and theming guides before coding.
- Use `design-taste-frontend` only to keep data ink restrained and avoid generic
  dashboard cards.
- Use `web-design-guidelines` for chart keyboard and non-color review.

## Scope

**In scope**:

- `apps/desktop/package.json`, root `bun.lock`,
  `apps/desktop/.env.example`, `apps/desktop/vite.config.ts`
- `apps/desktop/src/features/insights/model.ts`, `derive-insights.ts`, `insights-screen.tsx`,
  `insights-summary.tsx`, `insights-table.tsx`
- `apps/desktop/src/features/insights/charts/tanstack-chart.tsx`, `activity-chart.tsx`,
  `section-chart.tsx`, `backlog-chart.tsx`, `chart-fallback.tsx`, `chart-theme.ts`
- `apps/desktop/src/routes/stats.tsx`
- `packages/theme/src/tokens.css`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- Tests and fixtures beside these files
- `docs/adr/0003-experimental-charts.md`, `docs/PRIVACY.md`

**Out of scope**:

- Recharts, the `d3` umbrella package, Canvas rendering, remote analytics,
  tracking sessions, productivity scores, leaderboards, persisted aggregates,
  charts in the main Notes route, and unrelated D3 modules.

## Git workflow

- Branch: `codex/010-local-insights`
- Commits: `feat(insights): derive local note metrics`,
  `feat(insights): add experimental tanstack charts`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Revalidate and pin the experimental packages

Open the official installation and React adapter pages. Confirm core and React
adapter remain compatible with React 19 and TypeScript 7. Query the registry for
published versions. If versions moved beyond `0.0.0`, update the ledger, ADR,
this plan's commands, and exact install pins together before installation. Add
only `d3-array` and `d3-scale` plus matching types because the planned Cartesian
charts need only those modules.

Set `VITE_ENABLE_INSIGHTS=false` in `.env.example`. Build-time schema validation
must accept only literal `true|false`; default false for production and true only
in an explicit developer test command. Lazy-import the route's chart subtree.

**Verify**: Install command exits 0; `rg -n '"\^|"~|latest' apps/desktop/package.json` -> no matches; `bun pm ls | rg '@tanstack/(react-)?charts|d3-(array|scale)'` -> only exact intended packages.

### Step 2: Build a pure app-owned Insights module

Define `InsightsSnapshot` with no TanStack or D3 types. Derive, using local
calendar semantics with documented timezone behavior:

- created and completed counts per day for the last 30 days;
- current open/done/trashed totals and completion rate;
- open notes by section;
- open backlog age buckets: `<1d`, `1-7d`, `8-30d`, `31-90d`, `>90d`;
- median time-to-complete only when enough completed samples exist.

Exclude trashed notes from productive totals, fill missing days with zero, and
inject `now`/timezone into the pure function. Never label counts as productivity
or infer user quality. Memoize by Workspace revision at the route boundary.

**Verify**: `bun run test:desktop -- derive-insights` -> empty, one note, DST boundary,
timezone, zero days, trash, reopened note, median odd/even, and 100,000-note
fixtures pass deterministically.

### Step 3: Isolate TanStack Charts in one adapter subtree

Only files under `apps/desktop/src/features/insights/charts/` may import TanStack Charts or D3.
Create app-owned props using rows, labels, and semantic color keys. Adapter files
translate them into `defineChart` definitions and React `<Chart>`. Use default
SVG, stable keys, explicit scales, responsive containers, `ariaLabel`, keyboard
focus, native tooltip only where it adds value, and inherited
`--ts-chart-*`/Charon CSS variables.

Implement three restrained views: created/completed activity lines, horizontal
open-by-section bars, and backlog age bars. Avoid 3D, donuts for tiny categories,
gradients, animations on initial load, or more than three series. Respect reduced
motion. Every chart has a visible title, concise takeaway, and exact accessible
data table.

**Verify**: `rg -l "@tanstack/(react-)?charts|d3-" apps/desktop/src | rg -v 'apps/desktop/src/features/insights/charts/'` -> no output; chart tests find SVG accessible names, keyboard targets, token-based colors, and tables.

### Step 4: Compose a non-dashboard stats route

When the flag is false, hide Stats from primary navigation and keep direct route
access as a clear experimental-disabled state. When true, render one editorial
flow: headline counts, activity chart, then section and age comparisons separated
by whitespace and rules. Do not put every metric in a floating card.

Handle empty Workspace, insufficient history, loading, chart render error, and
reduced motion. A chart error must fall back to its accessible table and leave
the rest of the route usable. EN/FR date and number formatting uses `Intl` with
the active locale; message copy comes from Paraglide.

**Verify**: `bun run test:desktop -- stats` -> flag off/on, empty, insufficient, full,
theme, locale, reduced-motion, and isolated chart-error cases pass.

### Step 5: Enforce privacy and bundle boundaries

Document that insights are computed in memory and never transmitted or persisted.
Inspect the Vite manifest: chart/D3 code must be in a lazy stats chunk and absent
from the initial Notes route chunk. Record compressed size before and after; if
the stats chunk exceeds the agreed 120 KiB gzip budget, use documented subpath
imports and remove unused capabilities before accepting it.

**Verify**: `bun run build:desktop` -> exit 0; a small script/test asserts no chart package
in the Notes entry chunk and stats chunk gzip <= 120 KiB; `rg -n "fetch\(|sendBeacon|WebSocket" apps/desktop/src/features/insights` -> no matches.

## Test plan

- Pure aggregation fixtures with injected time and timezone.
- Adapter tests for SVG semantics, scales, stable keys, tooltips, keyboard focus,
  reduced motion, and theme variables.
- Route tests for flag, empty/insufficient/error states and EN/FR formatting.
- Automated bundle-boundary and size budget.
- Manual visual pass in three themes at 1280x800 and 800x600.

## Done criteria

- [ ] User correction is honored: TanStack Charts is the only chart engine.
- [ ] Exact experimental versions and only required D3 modules are installed.
- [ ] Metrics are local, derived, neutral, and timezone-tested.
- [ ] TanStack/D3 types are isolated to the chart adapter subtree.
- [ ] Every chart has keyboard support, aria label, and exact table fallback.
- [ ] Feature flag off removes primary navigation and initial-bundle cost.
- [ ] Chart failures cannot break Notes or the rest of Stats.
- [ ] All tests, bundle checks, and quality pass; this plan is `DONE`.

## STOP conditions

- The official React adapter no longer supports React 19 or TypeScript 7.
- The required chart needs an undocumented API, patch-package, or Git dependency.
- Chart packages enter the initial Notes bundle despite two boundary fixes.
- Accessible SVG/table parity cannot be achieved.
- Any implementation persists or transmits usage metrics.

## Maintenance notes

- Revisit the feature flag and ADR after a stable non-zero TanStack Charts
  release and one full Charon release cycle.
- Keep domain metrics independent of chart grammar so another renderer can be
  substituted without changing tests or semantics.
