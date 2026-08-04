# Plan 009: Integrate the approved brand and Solarized-first token system

> **Executor instructions**: Invoke `frontend-design` for the visual system and
> `apple-design` for motion/typography review. Follow every step and verification
> gate. Copy approved binary assets; never redraw or hand-edit generated app
> icons. Stop on every STOP condition. Update `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- packages/theme apps/desktop/src/app/theme.ts apps/desktop/src/assets apps/desktop/src-tauri/icons apps/site/public apps/site/src/assets apps/site/src/styles plans/README.md`
> Compare live tokens and asset paths with the excerpts below if any in-scope
> file changed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/008-freeze-rapid-capture-product.md`
- **Category**: direction, dx, tests
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

The repository currently uses a generic cobalt/silver theme and placeholder
mark while an operator-approved Charon identity already exists. The kit contains
canonical vector masters, platform-sized raster assets, favicons, social marks,
and exact prune/lavender/cream primitives. Integrating it once, through semantic
tokens, gives the desktop and static site the same identity without sharing
React components or scattering raw colors.

Solarized must become the first-run product identity while Light and Dark remain
available. Charon lavender is the interaction accent in every theme; Solarized
base relationships provide the default canvas, surfaces, text, and semantic
status colors.

## Current state

- Brand source root:
  `/Users/simonhazard/Documents/Codex/2026-07-31/j-aimerais-faire-un-logo-partir-2/outputs/charon-brand-kit-final/`.
- The kit `README.md` declares prune `#171221`, lavender `#8F8BE8`, cream
  `#F5F2EA`, canonical `svg/charon-icon-lavender.svg`, canonical
  `svg/charon-wordmark-color.svg`, and the rule to prefer the icon below 160px.
- `packages/theme/src/tokens.css:1-109` maps Light/Solarized/Dark through cobalt
  action colors and contains sidebar/chart roles that ADR 0011 removes.
- `packages/theme/src/theme-contract.ts:1-8` defines three valid themes but sets
  `defaultTheme` to `light`.
- `apps/desktop/src/styles/app.css:343` references undefined `--focus-ring`
  while the theme exports `--focus`/`--ring`.
- `apps/site/src/assets/charon-mark.svg` is a placeholder and Tauri icons are
  scaffold assets.
- `@charon/theme` must continue to export CSS variables, theme names, radius,
  and motion contracts only. It must not become an asset package.

## Approved asset checksums

Use these to prove the copied masters are byte-identical:

| Asset | SHA-256 |
|---|---|
| `svg/charon-app-icon.svg` | `4d6874a7fbb883652321d2ae3a4da373606382ed9fee1c1a291e60024ef05dbc` |
| `svg/charon-icon-lavender.svg` | `54dfbefe7e8900315ecacaa095b5813790df69a771df1eb3da9c5b072b62f785` |
| `svg/charon-icon-dark.svg` | `e1b28047e915c483bcb53918c9770608239efa1a1bc235d41fc168886c6d0283` |
| `svg/charon-icon-light.svg` | `a756df75f47e6aa094a6f02f11f3a4e1184c8a92a6352f817f7cf01ba0213758` |
| `svg/charon-wordmark-color.svg` | `312bc0ef2f5ec7ac90ba5306f20c6bf05af143ede6d06ef9602ca7b2cc75abc7` |
| `svg/charon-wordmark-reversed.svg` | `9b506740e53ce12545799ebb019c251b9b7db88d4e0dbc250a1cdcd50cf858f1` |
| `favicon/charon-app-icon-1024.png` | `301bd102040763a2d33460f6433d483831d9fff5433fb0405a17ba05b550dea6` |
| `favicon/favicon.ico` | `34b838a0225aa34d8e33154b2b30680adecef6849be4a9000ff2e1b964f55869` |
| `favicon/apple-touch-icon.png` | `9752b2795fd91634206942e4d86ff702aefb3566b254081a220b51e1a1b3d13e` |

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Theme tests | `bun run test:desktop -- theme motion shell` | all targeted tests pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Desktop build | `bun run build:desktop` | exit 0 with approved assets bundled |
| Site build | `bun run build:site` | exit 0 with favicons/brand paths resolved |
| Raw colors | `rg -n "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" apps/desktop/src apps/site/src --glob '*.tsx' --glob '*.astro' --glob '*.css'` | only documented token-definition or asset exceptions |
| Asset integrity | `shasum -a 256 <copied canonical assets>` | hashes match the table |
| Aggregate | `bun run check` | exit 0 |

## Design direction

- **Subject**: a local capture shelf for people who hand useful fragments to AI
  agents.
- **Single job**: make capture feel immediate and later processing feel calm.
- **Color**: Charon Prune `#171221`, Charon Lavender `#8F8BE8`, Charon Cream
  `#F5F2EA`, Solarized Canvas `#FDF6E3`, Solarized Surface `#EEE8D5`, and
  Solarized Ink `#073642`. Additional muted/border/status values are semantic
  support, not new brand colors.
- **Type**: the vector wordmark carries display personality; the application
  uses the platform UI stack for controls/body and the platform monospace stack
  only for Markdown editing. No downloaded font or Inter.
- **Layout**: one quiet column with hairline grouping rather than a card grid.
- **Metadata**: Tag chips, Attachment counts, and the Actions button reuse the
  quiet surface/text/action roles; they do not create label colors or file cards.
- **Signature**: one lavender “crossing line” derived from the icon's oar marks
  capture arrival, selection, and the origin edge of the expanded editor. It is
  functional state feedback, never ambient decoration.

If the result could be relabelled for any todo app, revise the crossing-line,
wordmark, and note-surface relationship before accepting it. Do not add a
gradient, warm-luxury serif, generic bento grid, glow, or permanent glass.

## Scope

**In scope**:

- `packages/theme/src/tokens.css`, `motion.css`, `theme-contract.ts`, `index.css`
- `apps/desktop/src/app/theme.ts`, theme tests, and token plumbing in
  `apps/desktop/src/styles/app.css`
- `apps/desktop/src/assets/brand/**` (create app-owned SVG masters)
- `apps/desktop/src-tauri/icons/**` and `tauri.conf.json` icon references
- `apps/site/public/brand/**`, `apps/site/public/favicon.*`,
  `apps/site/public/apple-touch-icon.png`
- `apps/site/src/assets/**` only to remove the placeholder and point at site-owned
  approved assets
- `apps/site/src/styles/global.css` only for shared token import/default theme
- Tests directly covering tokens, default theme, assets, and contrast
- `README.md` brand-source attribution only if ADR 0011 requires it

**Out of scope**:

- Rebuilding the desktop shelf, changing Workspace DTOs, changing capture, or
  writing the landing page
- Putting images/SVGs in `@charon/theme`
- Editing SVG paths, recoloring canonical files inline, generating a new logo,
  or committing `.DS_Store`, validation source images, or brand-board previews
- External font packages or network-loaded assets

## Git workflow

- Branch: `codex/009-brand-solarized-system`
- Commits: `feat(brand): integrate approved Charon assets`,
  `feat(theme): make Solarized the Charon default`
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Vendor the minimal authoritative asset set into each app

Copy, without modification, the desktop icon variants and wordmarks needed by
the actual UI into `apps/desktop/src/assets/brand/`. Copy the canonical
wordmark/icon variants, favicons, Apple touch icon, and approved social avatars
needed for metadata into `apps/site/public/brand/`. Do not copy the brand-board,
source-validation PNGs, `.DS_Store`, redundant 2400px PNG wordmarks, or every
raster size when the SVG is the runtime source.

The two app-owned copies are intentional: ADR 0004 permits only semantic tokens
through `@charon/theme`; it does not permit a cross-app asset package. Add a
small `ASSETS.md` beside each app-owned set recording source root, source file,
checksum, and usage. Do not include the creator machine's path in production UI
or built metadata.

Replace `apps/site/src/assets/charon-mark.svg`. Add the approved favicon files at
stable public paths. Verify every copied master against the checksum table.

**Verify**: Asset integrity command matches; `find apps -name '.DS_Store' -o -path '*source/*' -o -path '*preview/*'` returns no newly vendored kit internals.

### Step 2: Generate native app icons from the approved 1024px source

Copy `favicon/charon-app-icon-1024.png` as the documented icon generation source
inside `apps/desktop/src-tauri/icons/`, then run the pinned local Tauri CLI icon
generator through Bun. Do not hand-edit `.icns`, `.ico`, Windows Store tiles, or
generated PNG sizes. Keep only files referenced by Tauri or emitted by the
generator and required by the current targets.

Update Tauri icon references only if the generator's names differ. Inspect the
result at 16, 32, 128, 512, and 1024px on light and dark backgrounds for clipping
and transparent-edge artifacts. The vector artwork itself stays unchanged.

**Verify**: `bun run --cwd apps/desktop tauri icon src-tauri/icons/charon-app-icon-1024.png` exits 0; `bun run tauri:build` reaches icon validation with no missing/invalid icon error (a platform signing gate may remain outside this plan).

### Step 3: Rebuild semantic tokens around the approved primitives

In `packages/theme/src/tokens.css`, define brand primitives once and map all
component-facing roles through semantic values. Keep theme names exactly
`light`, `solarized`, `dark`.

Required semantic families:

- canvas, surface, elevated surface, inset surface;
- primary text, muted text, subtle text;
- subtle/strong border;
- action, action-hover, action-pressed, action text;
- selection surface/text/border;
- focus ring;
- danger, warning, success and their contrast text/surfaces;
- titlebar/transient material with solid fallbacks;
- platform and monospace font stacks;
- surface, field, compact-control radii and one real floating shadow.

Solarized uses `#FDF6E3`, `#EEE8D5`, and `#073642` relationships with Charon
Lavender as action/selection accent and Charon Prune for high-contrast action
text where verified. Light is a cooler cream/white reading with prune ink; Dark
starts from Charon Prune and cream text. Remove chart and sidebar roles after
confirming no consumer remains. Fix the undefined `--focus-ring` reference by
using the canonical semantic role, not an alias invented in a component.

Set `defaultTheme` to `solarized`. Preserve an explicit valid saved Light or
Dark choice; do not reset returning users merely to force the new default.
Do not add per-Tag palette tokens, Attachment-type colors, or component-specific
metadata roles; Plan 011 composes them from inset surface, muted text, border,
action, focus, and selection semantics.

Add automated contrast fixtures for body text, muted text at supported sizes,
action labels, focus against adjacent surfaces, selection, and destructive
confirmation in all three themes. WCAG AA is a floor; focus/selection must also
remain distinguishable without color.

**Verify**: Theme tests pass; `rg -n -- '--chart-|--sidebar-|--focus-ring' packages/theme apps/desktop/src apps/site/src` returns no obsolete/undefined role.

### Step 4: Keep motion tokens small and brand-independent

Preserve three shared profiles only: direct feedback, surface transition, and
future gesture release. Put no component-specific values or Motion runtime in
the theme package. Brand motion is expressed through the crossing-line usage in
the desktop plan, not a new animation profile.

Confirm reduced motion sets spatial distance to zero or uses a short opacity
fallback; reduced transparency makes transient materials solid; increased
contrast strengthens borders/focus. No `transition: all` or fixed keyframe
timeline may be introduced.

**Verify**: `rg -n "transition:\s*all|@keyframes" packages/theme apps/desktop/src apps/site/src` returns no new match; motion tests pass.

### Step 5: Validate both consumers without coupling them

Build desktop and site. Inspect emitted assets to confirm each app resolves its
own copies and neither imports the other's source tree. Confirm the theme package
exports no asset file and has no React/Astro/native dependency.

Review the default no-storage first paint, Light, Solarized, Dark, reduced
motion, reduced transparency, increased contrast, and 200% text size. Record
brand usage rules in `ASSETS.md`, not component comments.

**Verify**: both build commands and Aggregate pass; `rg -n "apps/(desktop|site)" apps/site/src apps/desktop/src packages/theme/src` shows no cross-app import.

## Test plan

- Theme contract unit tests: valid names, Solarized default, invalid storage,
  explicit saved preference preservation.
- Semantic-token presence and removed-role tests.
- WCAG contrast fixtures for all interactive/text states in all themes.
- Asset checksum tests/manifest review and Tauri icon generation validation.
- Desktop/site builds plus manual small-icon and theme visual review.

## Done criteria

- [ ] Canonical app-owned SVG/favicons/native icons are integrated and documented.
- [ ] No approved SVG path was redrawn or edited.
- [ ] Solarized is the first-run default; saved valid choices remain respected.
- [ ] Brand primitives map only through semantic component roles.
- [ ] Chart/sidebar/undefined focus tokens are gone.
- [ ] All theme state contrasts pass and do not rely on color alone.
- [ ] Theme package remains framework/asset/localization/native-free.
- [ ] Desktop and site build and aggregate checks pass.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- ADR 0011 is not accepted or names a different brand/default theme.
- Any canonical copied asset fails its recorded checksum.
- Tauri icon generation materially changes/crops the approved artwork.
- A required state cannot reach WCAG AA with semantic token adjustments.
- Sharing assets would require weakening ADR 0004's cross-app boundary.
- The implementation introduces a new dependency for fonts, icons, color, or
  motion that the existing pinned stack already covers.

## Maintenance notes

- The external brand kit remains the source of truth; each app's `ASSETS.md`
  makes future refreshes reproducible.
- A brand update changes primitives or masters first, then regenerates platform
  icons and re-runs contrast/build checks.
- The single-shelf layout and crossing-line behavior belong to Plan 011, not the
  shared theme package.
