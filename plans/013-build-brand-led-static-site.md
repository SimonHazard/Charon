# Plan 013: Build the brand-led static product site

> **Executor instructions**: Invoke `design-taste-frontend`, `frontend-design`,
> and `web-design-guidelines`. Read the brand asset manifests from Plan 009 and
> the real product contracts from Plans 008-012. Use only real application media.
> Follow every verification gate and STOP condition. Update the plan index after
> all done criteria pass.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- apps/site packages/theme docs/SITE.md docs/PRIVACY.md docs/platform-support.md package.json bun.lock plans/README.md`
> Stop if a deployed site, analytics, runtime API, CMS, form, or public download
> claim already exists without reconciliation with ADR 0004.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/009-integrate-brand-and-solarized-system.md`, `plans/011-build-single-shelf-desktop.md`, `plans/012-add-minimal-preferences-and-platform-fallbacks.md`
- **Category**: direction, docs, perf, tests
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

The site must explain Charon's one useful promise rather than advertise the
removed note-management suite. The approved identity gives it a specific visual
voice: prune, lavender, cream, a vector wordmark, and the crossed-oar icon. A
Solarized-first static Astro site can demonstrate selected-text capture, rapid
manual entry, calm enrichment, agent-ready Markdown copy, local files, and honest platform
support without a framework island or data collection.

## Current state

- `apps/site` is a minimal static Astro project with EN/FR smoke pages and a
  placeholder mark.
- ADR 0004 requires static output, app-owned site components/translations, real
  application media, and only `@charon/theme` as a shared package.
- Plan 009 vendors approved site-owned brand assets and makes Solarized the
  shared default.
- The previous site plan described Sections, Merge, CopyPresets, custom
  shortcuts, and Insights. ADR 0011 rejects those claims.
- No public site, real media, download manifest, SEO test suite, analytics,
  cookies, forms, CMS, or deployment exists at the planned baseline.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Astro check | `bun run --cwd apps/site check` | zero Astro/TypeScript errors |
| Site tests | `bun run test:site` | all content/theme/browser tests pass |
| Static build | `bun run build:site` | static `apps/site/dist` produced |
| Preview | `bun run preview:site` | built site serves locally |
| Raw colors | `rg -n "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" apps/site/src --glob '*.astro' --glob '*.css' --glob '*.ts'` | only documented metadata/token exceptions |
| Cross-app boundary | `rg -n "apps/desktop|@/features|react|motion/react|@base-ui" apps/site/src apps/site/package.json` | no desktop/runtime UI import |
| Aggregate | `bun run check && bun run build:site` | exit 0 |

## Design direction

- **Thesis**: “Select it. Shift twice. Keep it.” The exact localized wording may
  change, but the hero must express one gesture, one Note, local ownership.
- **Palette**: Solarized surface hierarchy plus approved prune/lavender/cream.
  No competing accent.
- **Typography**: vector Charon wordmark, system sans content, system mono only
  for a short real Markdown/file specimen.
- **Composition**: an asymmetric hero where the crossed-oar line passes from a
  selected fragment into a real Charon Note screenshot. The line is the one
  memorable structural device, not decorative animation.
- **Motion**: one orchestrated capture passage and tactile controls. No scattered
  reveal effects, parallax, marquee, cursor gimmick, or ambient loop.
- **Restraint**: no three-card grid, gradient, glow, fake app rectangles, stock
  device mockup, testimonial, customer logo, usage metric, or generic AI copy.

## Scope

**In scope**:

- `apps/site/package.json`, Astro config, TypeScript config
- Site layouts/components/pages/styles/scripts/i18n/content under `apps/site/src/**`
- Approved site assets from `apps/site/public/brand/**`, real media under
  `apps/site/public/media/**`, robots and web manifest/favicons
- EN `/`, FR `/fr/`, localized privacy, download, and changelog routes
- Site-only tests and root Playwright config/scripts only as needed
- `docs/SITE.md`, `docs/PRIVACY.md`, README site links
- Root package scripts and `bun.lock` only for exact site test dependencies

**Out of scope**:

- React islands, desktop imports, shared components/translations/native types,
  server adapter, runtime API, CMS, accounts, forms, newsletter, analytics,
  cookies beyond a local theme preference, deployment, or publishing
- Generated/fake UI, generated testimonials, unsupported platform/download claims
- Changing product behavior or brand master paths

## Git workflow

- Branch: `codex/013-brand-static-site`
- Commits: `feat(site): tell the rapid-capture story`,
  `feat(site): add localized privacy and download pages`,
  `test(site): verify static brand and privacy contracts`
- Do not push, deploy, or open a pull request unless instructed.

## Steps

### Step 1: Freeze verified content and media contracts

Update `docs/SITE.md` with page jobs, exact content order, CTA states, media
owner, and a verified-claim table sourced from PRODUCT, PRIVACY, ADR 0011,
platform support, and actual release state.

Home sequence:

1. compact header with responsive Charon wordmark, Product, Privacy, Download,
   locale, theme, and one primary CTA;
2. hero with one-gesture promise and real Solarized app screenshot;
3. a visual capture passage from selected source text to one Note;
4. one focused enrichment story showing row-to-editor Write/Preview, lightweight
   Tags, and one locally managed Attachment;
5. `Copy as Markdown` to an agent composer, clearly showing Tag/Attachment path
   formatting and a manual paste by the user;
6. full-width local Markdown/privacy proof;
7. compact truthful macOS/Linux/Windows capability table;
8. real release/download state and restrained footer.

If signed downloads do not exist, CTA says `View releases`, not `Download`.
Never claim double Shift outside the tested macOS tier. Visible copy must use
concrete language and consistent action names; do not mention removed features.

**Verify**: a content test rejects `Sections`, `Merge`, `Trash`, `Insights`,
`CopyPreset`, unsupported double-Shift claims, placeholder URLs, fake counts,
and unverified Download labels.

### Step 2: Build typed EN/FR static routes and metadata

Create site-owned typed copy and localized route maps. Do not import desktop
Paraglide. Every page sets lang, localized title/description, canonical,
reciprocal hreflang including x-default, Open Graph/Twitter metadata with real
brand/media, and one skip link. Add sitemap and robots. Add SoftwareApplication
JSON-LD only for verified fields; omit unknown release/price/platform fields.

Theme bootstrap validates `light|solarized|dark`, defaults to Solarized, and
avoids a flash without blocking no-JS readability. Locale and theme controls are
keyboard accessible.

**Verify**: built-HTML tests cover unique metadata, route parity, hreflang,
canonical origin mode, JSON-LD validity, Solarized no-storage default, invalid
storage, and no-JS content.

### Step 3: Compose the landing page from approved assets and shared tokens

Import `@charon/theme/index.css`; components use semantic roles only. Use
site-owned approved wordmark/icon/favicon assets. The hero is asymmetric and
fits promise, CTA, and real media in the first desktop viewport. At narrow
widths, content order remains promise, action, media.

Use the lavender crossing line to connect only the capture sequence. Structure
later sections with varied full-width/asymmetric compositions and hairline
rules. Do not repeat an equal card pattern or alternate image/text mechanically.

Use system font stacks from tokens. Keep all UI/page colors, borders, selection,
focus, radii, and motion semantic. Solarized is default; Light/Dark switch the
whole page rather than theme-flipping individual sections.

**Verify**: Raw colors and Cross-app boundary pass; visual tests cover widths
390, 768, 1280, 1536 with no horizontal overflow or CTA clipping.

### Step 4: Capture and integrate real product media

Create synthetic, obviously non-private sample Notes inside a disposable test
Workspace. Capture a real release-candidate desktop screenshot in Solarized and
Dark after Plans 011/012 pass. Record a short real demo that shows:

- selected text in one supported macOS source;
- unmodified double Shift creating exactly one Note without focus theft;
- opening Charon, enriching the Note with Write/Preview;
- adding a Tag and a synthetic Attachment through the real file picker;
- explicit `Copy as Markdown`, then the user manually pasting into an agent composer;
- the notes folder in normal filesystem context without a private path.

Provide optimized AVIF/WebP stills with dimensions and a WebM/MP4 video with
poster, native controls, captions or transcript. Do not show credentials, user
paths, private notes, third-party notifications, or unsupported surfaces. Do not
fake Linux/Windows selected-text capture.

**Verify**: media tests decode files, enforce dimensions/size budgets, require
alt/transcript, reject placeholder filenames/known private sentinels, and prove
the screenshot is not constructed from page rectangles.

### Step 5: Add one purposeful motion sequence and preference fallbacks

The capture passage may reveal selected text, move/fade the crossing line, and
materialize the real Note media using transform/opacity. It runs once when the
section first becomes visible via IntersectionObserver or supported CSS
progressive enhancement, never a raw scroll listener. Controls respond on press.

Reduced motion displays the final relationship or a short crossfade. Reduced
transparency makes header/material solid. Increased contrast adds boundaries.
No effect may gate content or CTA availability.

**Verify**: browser tests prove reduced motion has no spatial animation, no-JS
has complete content, and repeated navigation does not leak observers/listeners.

### Step 6: Add privacy, download, changelog, and quality tests

Privacy pages mirror current local data, permissions, ADR 0010 transient
clipboard, explicit `Copy as Markdown` path disclosure, local managed Attachment
storage, permanent Delete limits, legacy migration archive, and zero site
tracking. State plainly that Charon does not upload Attachment bytes and remote
agents require the user to attach files themselves. Download pages read
checked-in verified states only; no browser GitHub API. Changelog contains only
published facts.

Add unit/built HTML/browser tests for copy parity, routes, metadata, themes,
keyboard navigation, no-JS, media, privacy, links, 404, no third-party request,
and responsive layout. Run the complete design preflight and record the result
in `docs/SITE.md` with Core Web Vitals targets LCP <2.5s, INP <200ms, CLS <0.1.

**Verify**: Site tests, Astro check, static build, and Aggregate all pass twice.

## Test plan

- Typed locale/route/metadata/theme unit tests.
- Built-page privacy, content-ban, structured-data, link, and asset tests.
- Playwright EN/FR, theme, keyboard, no-JS, reduced preferences, media, privacy,
  download, 404, and third-party-network journeys.
- Manual design review at four widths and all three themes.

## Done criteria

- [ ] Static EN/FR home, privacy, download, and changelog routes exist.
- [ ] Hero tells the one-gesture/one-Note/local story with real app media.
- [ ] Enrichment media truthfully shows lightweight Tags, managed Attachments,
  and explicit agent-ready Markdown copy without implying automatic upload/paste.
- [ ] Approved wordmark/icon and shared Solarized-first tokens define the site.
- [ ] Removed features and unsupported platform claims do not appear.
- [ ] No React, desktop import, backend, CMS, form, analytics, or tracker exists.
- [ ] Video/stills are real, private-content-free, dimensioned, and accessible.
- [ ] All themes, no-JS, reduced preferences, keyboard, mobile and WCAG AA pass.
- [ ] Metadata, links, sitemap, JSON-LD and truthful download states validate.
- [ ] Site/aggregate checks pass twice and this plan is `DONE`.

## STOP conditions

- Real media cannot be captured without private content or unsupported claims.
- A required claim lacks a contract/platform/release source.
- The design needs fake product UI or a desktop component import.
- Static Astro cannot satisfy the content without a server/runtime API.
- Any tracker, form, third-party embed, autoplay audio, or cookie banner enters scope.
- A theme/CTA fails WCAG AA after two semantic-token/layout corrections.

## Maintenance notes

- Refresh real media when capture, editor, shelf, theme, or permission UI changes.
- Site copy is site-owned; keep conceptual parity through contracts, not shared i18n.
- Plan 015 owns deployment and verified signed download metadata.
