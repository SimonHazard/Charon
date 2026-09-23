# Plan 040: Build the Lavender token foundation — ramp, contrast, elevation, type and spacing scales

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e..HEAD -- packages/theme/src/tokens.css apps/desktop/src/app/theme-contract.test.ts apps/desktop/src/styles/app.css apps/site/src/styles/global.css docs/UX.md && git status --short -- packages/theme apps/desktop/src/styles/app.css apps/desktop/src/app docs/UX.md`
> The second command must print nothing (uncommitted user work in these files
> is a STOP until committed). Plan 038 may have landed first and edited
> `theme-contract.test.ts` and `docs/UX.md`; that is expected drift. Compare the
> "Current state" excerpts against the live code; any other mismatch is a STOP
> condition. Refer to `app.css` rules by selector, not line number.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none. Run after 038 only to avoid text conflicts in `docs/UX.md` "Visual language" and `theme-contract.test.ts`.
- **Category**: tech-debt (design system)
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

The operator wants a premium UI built around Charon's lavender (`#8f8be8`).
Today the theme has three hand-picked lavender hexes with no ramp; pressed and
hover steps barely differ from the resting fill; a Lavender button has no
silhouette on the Light canvas (2.49:1); a hovered Note row is 1.07:1 against
its resting surface in Light and 1.03:1 in Dark (hover is invisible); one
shadow is invisible in the dark theme; `app.css` uses 14 font sizes and six
non-standard weights; and there is no `::selection` or caret styling in the
desktop app. That is the token layer, not a component problem. This plan fixes
the foundation so Plan 041 can apply the accent consistently.

## Current state

- `packages/theme/src/tokens.css` — `:root` brand (`--brand-prune: #171221`,
  `--brand-lavender: #8f8be8`, `--brand-cream: #f5f2ea`), fonts, radii and
  `--shadow-floating: 0 16px 42px rgb(23 18 33 / 18%)`; `[data-theme="light"]`
  (from line 18); `[data-theme="dark"]` (from line 61); shadcn-style aliases in
  `:root` (around 104-126, e.g. `--secondary: var(--surface)`);
  `@media (prefers-contrast: more)`. Light lavender values:

```css
  --action: var(--brand-lavender);      /* #8f8be8 */
  --action-hover: #847fe0;
  --action-pressed: #7b76d5;
  --action-text: var(--brand-prune);
  --selection-surface: #e8e6fa;
  --selection-subtle: #f1f0fb;
  --selection-text: var(--brand-prune);
  --selection-border: #625cb7;
  --focus: #625cb7;
```

  Light surfaces: `--canvas #ebeae8`, `--surface #f3f2f0`,
  `--surface-elevated #ffffff` (Note rows), `--surface-hover #f8f7f6`. Dark:
  `--surface-elevated #2a2236`, `--surface-hover #282033`, `--focus #b0acff`,
  `--selection-surface #39315d`.
- Contrast (WCAG 2.1): `--action #8f8be8` on light `--canvas` = 2.49:1; light
  `--selection-surface` vs `--field-surface` = 1.23:1; light
  `--action-hover`/`--action-pressed` vs `--action` = 1.15/1.30:1; row hover
  `--surface-hover` vs resting `--surface-elevated` = 1.07:1 (dark 1.03:1).
  `--text-subtle` has no consumer outside `theme-contract.test.ts`.
- **A contrast checker already exists**: `apps/desktop/src/app/theme-contract.test.ts`
  resolves `tokens.css` per theme with `readTheme(theme)` (lines 103-120), parses
  6-digit hex only (`relativeLuminance`, around line 122), and asserts 27 text
  pairs ≥ 4.5 (`textPairs`, around line 163) and 12 non-text pairs ≥ 3
  (`nonTextPairs`, around line 199). Around line 229 it asserts `app.css`
  contains `var(--focus) 90%`. It also keeps a `requiredSemanticTokens` list.
- `apps/desktop/src/styles/app.css` — 14 distinct `font-size` values (0.68,
  0.7, 0.72, 0.75, 0.78, 0.8, 0.82, 0.84, 0.875, 0.9, 0.95, 1.1, 1.25rem,
  0.85em), weights 450/520/580/600/620/650, `2.75rem` hit targets in 12 places,
  `2.25rem` in 5. No `::selection` or `caret-color` in `apps/desktop/src` (the
  site has `::selection` at `apps/site/src/styles/global.css:46-49`).
  `button.tsx` and `toast.tsx` already use `select-none`.
- `app.css` imports the full Tailwind v4 theme, which defines `--text-xs/sm/base/lg/xl`,
  `--tracking-tight` and `--shadow-*` in a layer. `tokens.css` is unlayered and
  would win, silently resizing `text-sm` (9 files), `text-base` and
  `tracking-tight`. New tokens must avoid those namespaces.
- `package.json` `check` = `lint && typecheck && test && messages:check`;
  root `test:release` lists `scripts/*.test.ts` explicitly.
- Binding rules (AGENTS.md "UI and motion"): semantic roles mapped from Prune,
  Lavender, Cream; product components never contain raw palette values; no
  gradients, glow, permanent glass; system font. `docs/UX.md`: "Lavender
  remains `#8f8be8`"; Note rows have "no lift or shadow" and the composer is
  solid; "shadows appear only when a layer genuinely floats"; the Note list
  and dialogs "reserve no empty scrollbar gutter".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Contrast/token contract | `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` | pass |
| Unit | `bun run --cwd apps/desktop test` | pass |
| Build both apps | `bun run build` | exit 0 |
| Full | `bun run check` | exit 0 |
| E2E desktop | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass (axe-clean and theme geometry tests) |
| E2E site | `bun run --cwd apps/desktop test:e2e -- --project=chromium --grep "site "` | pass (the site imports these tokens) |

## Suggested executor toolkit

- Skill `frontend-design` for the type scale decision; skill `emil-design-eng`
  for hover/pressed feedback expectations. Neither overrides AGENTS.md.

## Scope

**In scope**: `packages/theme/src/tokens.css`, `apps/desktop/src/styles/app.css`
(base layer and token consumers only — not component structure),
`apps/desktop/src/app/theme-contract.test.ts`,
`apps/site/src/styles/global.css` (only if a renamed token breaks the site
build), `docs/UX.md` (token vocabulary paragraph).

**Out of scope**:
- Any `.tsx` component (Plan 041).
- Motion tokens in `motion.css`.
- `--canvas` values, `index.html` and `tauri.conf.json` (Plan 038 pins the
  canvas literals; this plan must not change `--canvas`).
- A new contrast script: extend the existing test instead.
- Changing the theme names or the dark hue family (README "Direction": the
  Graphite retint is an operator decision).

## Git workflow

- Branch: `codex/040-lavender-token-foundation`
- Commit: `feat(theme): add the lavender ramp, elevation and type scales`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the existing contrast fixture

Do not create `scripts/check-contrast.ts`. In `theme-contract.test.ts`:

- `textPairs` (≥ 4.5): add `--text` and `--text-muted` on `--surface`,
  `--surface-elevated`, `--surface-inset`; `--text-muted` on `--selection-surface`.
- `nonTextPairs` (≥ 3): add `--action-border` on `--canvas`, `--surface`,
  `--surface-elevated`; `--selection-border` on `--surface`,
  `--surface-elevated`, `--field-surface`; `--border-strong` on `--surface`,
  `--field-surface`.
- New `stepPairs`: `--action-pressed` vs `--action` ≥ 1.25;
  `--surface-hover` vs `--surface-elevated` ≥ 1.1.

Keep every token value 6-digit hex so `relativeLuminance` keeps working.

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` → fails only on the missing `--action-border` and the `--surface-hover` step pair.

### Step 2: Lavender ramp and remapped roles

In `tokens.css` `:root`, add (hex so the contract test parses it; only
`tokens.css` may reference `--lavender-*`):

```css
  /* Lavender ramp, OKLCH hue 284.1 anchored on --brand-lavender. */
  --lavender-50: #f5f6ff;  --lavender-100: #e9eaff; --lavender-200: #d5d6ff;
  --lavender-300: #b9b8ff; --lavender-400: var(--brand-lavender);
  --lavender-500: #7a73d9; --lavender-600: #635cb7; --lavender-700: #4f479a;
  --lavender-800: #38336f; --lavender-900: #25224c;
```

Light: `--action: var(--lavender-400)`; `--action-hover: #847fe0` (unchanged);
`--action-pressed: var(--lavender-500)` (prune text 4.61:1, 1.33:1 vs action);
`--action-text` stays prune; `--action-border: var(--lavender-600)` (new);
`--selection-surface: var(--lavender-200)`; `--selection-subtle: var(--lavender-100)`;
`--selection-border` and `--focus: var(--lavender-600)`;
`--surface-hover: #f1f0ee` (1.14:1 vs the row).

Dark: `--action: var(--lavender-400)`; hover `var(--lavender-300)`; pressed
`var(--lavender-200)`; `--action-border`, `--selection-border`, `--focus:
var(--lavender-300)`; `--selection-surface: var(--lavender-800)`;
`--selection-subtle: var(--lavender-900)`; `--surface-hover: #342b41` (1.14:1).

Add `--action-border` to `requiredSemanticTokens`. Do not add `--action-quiet`
(it would duplicate `--selection-subtle`).

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts` → pass in both themes.

### Step 3: Elevation per theme

Define in **light**:

```css
  --shadow-floating: 0 8px 24px rgb(23 18 33 / 14%), 0 1px 2px rgb(23 18 33 / 8%);
  --shadow-modal:    0 24px 48px rgb(23 18 33 / 22%), 0 2px 4px rgb(23 18 33 / 10%);
```

and in **dark** (black-based plus a top hairline so depth reads on prune):

```css
  --shadow-floating: 0 12px 32px rgb(0 0 0 / 55%), inset 0 1px 0 rgb(245 242 234 / 6%);
  --shadow-modal:    0 24px 56px rgb(0 0 0 / 65%), inset 0 1px 0 rgb(245 242 234 / 8%);
```

Keep `--shadow-transient: var(--shadow-floating)` so existing consumers
compile. Do not define `--shadow-raised`: the composer and Note rows stay
shadowless (UX contract). Add `--shadow-modal` to `requiredSemanticTokens`.

**Verify**: `grep -c "shadow-floating" packages/theme/src/tokens.css` → 3 (light, dark, alias).

### Step 4: Type, weight, spacing and control-size scales

Add to `:root` in `tokens.css`:

```css
  --type-2xs: 0.7rem; --type-xs: 0.75rem; --type-sm: 0.8125rem;
  --type-base: 0.9rem; --type-lg: 1.1rem; --type-xl: 1.25rem;
  --weight-regular: 450; --weight-medium: 560; --weight-strong: 650;
  --letter-tight: -0.012em; --letter-caps: 0.06em;
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-6: 1.5rem;
  --size-control-sm: 2.25rem; --size-control-md: 2.75rem; --size-control-lg: 3rem;
```

Never define tokens in Tailwind v4 theme namespaces (`--text-*`, `--tracking-*`,
`--leading-*`, `--font-weight-*`, `--shadow-{2xs..2xl}`, `--spacing`). Add a
contract assertion:
`expect(tokensCss).not.toMatch(/--(text|tracking|leading)-(2xs|xs|sm|base|lg|xl|tight)\b/)`.

Then sweep `app.css`: every `font-size` maps to the nearest step (record the
mapping in the commit body), every `font-weight` to one of the three weights,
`2.25rem`/`2.75rem`/`3rem` control sizes to the tokens. Do not change layout
structure. Keep `.note-row-main { min-height: 4.75rem }` numerically identical
(the virtualizer estimates 84px rows).

**Verify**: `grep -cE "font-size: 0\.(68|72|78|82|84|95)rem" apps/desktop/src/styles/app.css` → 0; e2e geometry tests (`compact shelf geometry holds…`, `…EN and FR across Light and Dark at 400 and 480 pixels`) → pass.

### Step 5: Global text polish

In `app.css` `@layer base` add:

```css
  html { -webkit-font-smoothing: antialiased; }
  ::selection { background: var(--selection-surface); color: var(--selection-text); }
  input, textarea { caret-color: var(--focus); }
  .note-list, .preferences-popover, .markdown-help, .note-preview, .note-editor-inline textarea, .update-release-notes {
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }
```

Do not add a `::-webkit-scrollbar` block: on macOS WebKit and WebKitGTK it
replaces overlay scrollbars with a permanent gutter, which the UX contract
rejects. Do not add global `user-select` rules.

**Verify**: `bun run build` → exit 0; Chromium e2e axe-clean tests → pass.

### Step 6: Contract vocabulary

`docs/UX.md` "Visual language": add one paragraph naming the ramp (only
`tokens.css` references it), the two shadows and their consumers (floating
transient surfaces, modal dialogs), and the type/weight steps.

**Verify**: `bun run check` → exit 0; both e2e commands → pass.

## Test plan

- `theme-contract.test.ts`: new pairs, step pairs, required tokens, Tailwind
  namespace guard.
- e2e: existing theme/geometry/axe tests (desktop and site) pass unchanged.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `grep -n "lavender-400\|action-border\|shadow-modal\|--type-base\|--size-control-md" packages/theme/src/tokens.css` → all present
- [ ] `grep -n "action-quiet\|shadow-raised" packages/theme/src/tokens.css` → no output
- [ ] `grep -n "::selection\|caret-color\|scrollbar-width" apps/desktop/src/styles/app.css` → all present
- [ ] `grep -rnE "#[0-9a-fA-F]{3,6}\b" apps/desktop/src --include='*.tsx' --include='*.css'` → no output
- [ ] Desktop and site Chromium e2e pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- A geometry e2e test fails after the type sweep because a row grew past
  84px: revert the offending size to its previous value and report the exact
  selector.
- `theme-contract.test.ts` `approvedChecksums` or removed-family assertions
  conflict with a rename: do not rename; add aliases.
- Any existing contrast pair fails with the values above: report the pair and
  its ratio; do not weaken the threshold.

## Maintenance notes

- Plan 041 consumes `--action-border` and `--shadow-modal`; Plan 047 consumes
  `--size-control-sm`; Plan 045 uses `--selection-subtle`.
- Reviewer: run `bun run dev:desktop`, open `http://127.0.0.1:1420/?fixture=demo`,
  view both themes at 400×480 and 480×720, and compare hover/pressed on a
  button and the selected toggle.
- Deferred: retinting the dark surfaces toward neutral graphite (operator decision, README).
