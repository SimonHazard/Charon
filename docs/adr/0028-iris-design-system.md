# ADR 0028: The Iris design system

## Status

Accepted on 2026-10-17 by operator decision. Supersedes the Prune, Lavender,
and Cream palette of ADR 0012 and the Graphite name of ADR 0019; amends the
visual-language, materials, and shared-control sections of `docs/UX.md` and
the UI rules of `AGENTS.md`. ADR 0019 (follow the system appearance by
default) and ADR 0020 (paint-only feedback transitions) stay in force.

## Context

Charon's shelf used a Prune, Lavender, and Cream identity with roomy 44-pixel
rows, 16-pixel surfaces, and an inverted Tooltip. The operator wants a denser,
quieter desktop tool: compact controls, hairline borders, translucent
transient surfaces, and a violet palette called Iris, with a violet focus and
selection accent (`#7253b9` Light, `#9d7df2` Dark) and a magenta primary
action (`#a82c87` Light, `#f099d8` Dark) on lilac-grey canvases (`#f8f7f9`
Light, `#1d1929` Dark).

## Decision

1. `packages/theme/src/tokens.css` maps Iris onto Charon's existing semantic
   roles, which keep their names so components never see palette values. Iris
   values are kept where they meet the contrast fixtures of
   `theme-contract.test.ts`; muted text, strong borders, and the dark selection
   border are darkened or lightened just enough to pass them. The violet is the
   focus and selection colour; the magenta is the one solid primary action. The
   appearances are named Light and Dark; Graphite is gone.
2. Density and shape: 14-pixel body text, 32-pixel default and 28-pixel compact
   controls, 8-pixel control, 10-pixel field, 14-pixel Note, 18-pixel dialog,
   and 22-pixel composer radii, medium (500) and semibold (600) weights, and the
   platform system font stack (`-apple-system`, `BlinkMacSystemFont`,
   `Segoe UI`, `system-ui`). Invisible `::after` hit areas keep every icon
   control at least 44 pixels.
3. Controls: a 1-pixel highlight on solid buttons, muted icons on quiet
   buttons that turn to the text colour on hover, hairline field borders with a
   1-pixel control shadow, a raised segment in segmented controls, and a small
   `kbd` chip.
4. Transient surfaces (Tooltips, Popovers, Select, toasts, dialogs, the command
   menu) are glass: the semantic transient material at 84 % with a 12-pixel
   (16 in Dark) blur and saturation, a 10 % outline, and deep, soft shadows.
   Tooltips are light glass, not inverted. Preferences and Markdown help stay
   opaque. Reduced transparency makes every glass solid; increased contrast
   adds `currentColor` outlines.
5. The composer floats: a rounded glass host with a hairline outline and a soft
   drop shadow in Light. Note rows are hairline cards with a 1-pixel control
   shadow in Light; Done rows drop it. These replace the "solid composer" and
   "no row shadow" rules.
6. The canvas carries a 3.5 % fractal-noise grain from an inline SVG `data:`
   image, which the CSP already allows. Increased contrast removes it. This
   narrows the earlier "no grain" rule for the canvas only.
7. The search field and its trailing actions form one toolbar row: the field,
   then the Commands, Help, and Settings icon buttons beside it.
8. On macOS the native title bar becomes an overlay with a hidden title, so the
   28-pixel drag strip that already sat above search holds the traffic lights
   on the grained canvas instead of stacking under a separate title bar.
   Windows keeps its native title bar; Linux keeps native decorations and the
   strip.
9. Tabler outline icons stay the one icon family.

## Alternatives rejected

- **A theme engine** (runtime palettes, custom themes, a contrast slider):
  Charon offers one palette in two appearances; a theme picker is not a
  product job.
- **Keeping Lavender and only densifying**: the operator chose Iris.
- **Another icon family**: Tabler's outline grid and stroke already fit.

## Consequences

- `index.html` and `tauri.conf.json` paint the Iris canvases before load.
- The brand assets (app icon, site icons) keep their own colours.
- The site imports the same tokens, so it follows Iris too.
- Drawing inks are stored content (ADR 0021) and keep their values, including
  the former Lavender ink.

## Revisit when

Revisit if a contrast fixture cannot hold with Iris values, or if the macOS
overlay title bar misplaces the traffic lights on a supported macOS version.
