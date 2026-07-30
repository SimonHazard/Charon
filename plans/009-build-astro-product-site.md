# Plan 009: Build the Astro product preview site with the shared app theme

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before continuing. Stop
> on any STOP condition and report rather than improvising. Update this plan's
> row in `plans/README.md` when done.
>
> **Drift check (run first)**: inspect `apps/site`, `packages/theme`, product
> docs, platform support, privacy copy, and release links. Expected state is the
> Plan 002 Astro smoke page consuming the finalized Plan 004 theme. If a public
> site, deployed URL, analytics, CMS, or download manifest already exists, stop
> and reconcile it with ADR 0004 before editing.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 004 and 008
- **Category**: direction, docs, perf, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

The desktop app needs a credible public front door that explains its keyboard
workflow, privacy model, platform support, and downloads with the same visual
identity. Astro static output keeps the page fast and operationally simple. A
shared token package creates brand parity without coupling Astro to React, Base
UI, Tauri, or the desktop feature tree.

## Current state

- `apps/site` is a minimal static Astro 7.1.6 project with EN/FR route smoke.
- `packages/theme` exports finalized light, Solarized, and dark tokens used by
  both apps.
- `docs/SITE.md` fixes the site design read: premium Apple-like product landing
  for developers and agent users, variance 7, motion 5, density 3.
- Product behavior, privacy language, and platform capability evidence exist in
  `docs/PRODUCT.md`, `docs/PRIVACY.md`, and `docs/platform-support.md`.
- No real app media, content architecture, download page, SEO metadata, site
  tests, analytics, cookies, forms, CMS, or deployment exists.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Site dev | `bun run dev:site` | Astro serves the site locally |
| Astro check | `bun --cwd apps/site run check` | zero Astro/TypeScript errors |
| Site tests | `bun run test:site` | all site unit/browser tests pass |
| Static build | `bun run build:site` | static `apps/site/dist` produced |
| Preview | `bun run preview:site` | built site serves locally |
| Aggregate | `bun run check` | desktop, site, theme, and repo checks pass |

## Suggested executor toolkit

- Use `design-taste-frontend`. Apply its landing-page rules and run its complete
  pre-flight checklist before completion.
- Use `shadcn` only to inspect the desktop theme/components. Do not install
  shadcn or Base UI in Astro.
- Read official Astro styling, assets, i18n, sitemap, and static deployment docs.
- Use `web-design-guidelines` for the final keyboard, contrast, and semantic audit.

## Scope

**In scope**:

- `apps/site/package.json`, `apps/site/astro.config.mjs`,
  `apps/site/tsconfig.json`
- `apps/site/src/layouts/site-layout.astro`
- `apps/site/src/components/site-header.astro`, `hero.astro`,
  `product-media.astro`, `feature-story.astro`, `privacy-proof.astro`,
  `platform-downloads.astro`, `theme-switcher.astro`,
  `locale-switcher.astro`, `site-footer.astro`
- `apps/site/src/i18n/config.ts`, `apps/site/src/i18n/copy.ts`,
  `apps/site/src/i18n/links.ts`
- `apps/site/src/pages/index.astro`, `apps/site/src/pages/fr/index.astro`
- `apps/site/src/pages/privacy/index.astro`,
  `apps/site/src/pages/fr/confidentialite/index.astro`
- `apps/site/src/pages/download/index.astro`,
  `apps/site/src/pages/fr/telecharger/index.astro`
- `apps/site/src/pages/changelog/index.astro`,
  `apps/site/src/pages/fr/changelog/index.astro`
- `apps/site/src/styles/global.css`, `apps/site/src/scripts/theme.ts`,
  `apps/site/src/scripts/media.ts`
- `apps/site/src/content/downloads.json`,
  `apps/site/src/content/releases.json`
- `apps/site/public/media/**`, `apps/site/public/favicon.png`,
  `apps/site/public/robots.txt`
- `apps/site/tests/**`, root `playwright.config.ts`, root `package.json`,
  root `bun.lock`
- `docs/SITE.md`, `docs/PRIVACY.md`, `README.md`

**Out of scope**:

- React islands, desktop feature imports, Base UI/shadcn installation in Astro,
  Motion runtime imports, a shared component package, CMS, server adapter, API, login, newsletter,
  analytics, session replay, advertising, tracking pixels, cookie banner,
  dynamic release API calls from the browser, and deploying the site.
- Invented testimonials, customer logos, usage counts, benchmarks, download
  numbers, platform support, pricing, or release artifacts.

## Git workflow

- Branch: `codex/009-astro-product-site`
- Commits: `feat(site): add shared-theme product landing`,
  `feat(site): add localized privacy and download pages`,
  `test(site): verify static privacy-first experience`
- Do not push, deploy, or open a PR unless instructed.

## Steps

### Step 1: Freeze content architecture and verified claims

Update `docs/SITE.md` with the page jobs, copy outline, CTA intent, content owner,
media owner, and verified-source table. The home page uses this sequence:

1. One-line navigation with product name, Features, Privacy, Download, language,
   theme, and one Download CTA.
2. Asymmetric split hero with one concise promise, one supporting sentence, one
   primary Download CTA, one secondary View releases link, and a real app image.
3. Large editorial feature typography inspired by Copper's clarity: Merge notes,
   Sections, Markdown, Copy as list, Search, Custom shortcuts, Local files, No
   tracking, No account, Free updates, Keyboard-first, Native desktop app.
4. One real capture-to-copy demo video with native controls and poster.
5. Privacy and local-file proof using concrete sentences, not trust badges.
6. Platform support and truthful download/release links.
7. Small final CTA and footer with Privacy, Changelog, source/releases, and locale.

Use only claims proved by product docs and the platform matrix. If signed
artifacts do not exist, the primary CTA says View releases and links to the real
GitHub Releases destination. It must not say Download for an absent artifact.

**Verify**: `rg -n "^## (Page jobs|Content sequence|Verified claims|Media contract|CTA states)" docs/SITE.md` -> five matches; every claim has a source document or `pending` status.

### Step 2: Build typed EN/FR static routing and metadata

Configure Astro i18n with locales `en` and `fr`, default `en`, and no prefix for
English. `copy.ts` is a typed site-only dictionary with exact key parity; do not
import desktop Paraglide messages. `links.ts` maps localized slugs and alternates
without string concatenation in components.

`site-layout.astro` sets `lang`, localized title/description, canonical URL,
EN/FR hreflang plus `x-default`, Open Graph/Twitter metadata, theme bootstrap,
and skip link. Configure sitemap with localized pages and exclude invalid/local
origins from production. Add SoftwareApplication JSON-LD using only verified
name, description, operating systems, license/pricing, and download URLs. Omit
unknown fields rather than inventing them.

**Verify**: `bun --cwd apps/site run check` -> zero errors; a built-page test
parses every route and asserts unique title, description, lang, canonical,
hreflang pair, and valid JSON-LD with no placeholder domain.

### Step 3: Implement the shared theme without a framework island

Import `@charon/theme/index.css` from `global.css`. Use its semantic variables for
every color, radius, focus ring, selection, and motion duration. Do not redefine
light, Solarized, or dark values in the site. `theme-switcher.astro` renders an
accessible three-option control. A tiny module script validates and persists the
same theme names/storage contract, updates `data-theme`, and avoids flash.

The full page uses one active theme. Sections may vary surface elevation within
that family but never flip theme. Default first visit matches the desktop
contract. Respect reduced motion and reduced transparency. JavaScript failure
must leave the default theme readable and navigation functional.

**Verify**: site theme tests cover light/Solarized/dark, invalid storage, no-JS,
focus/selection/CTA contrast, and shared-package import. `rg -n "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" apps/site/src --glob '*.astro' --glob '*.css'` -> no undocumented color literals.

### Step 4: Compose the landing page with real product media

Implement the Design Read and dials from `docs/SITE.md`:

- asymmetric hero, headline at most two lines, support copy at most 20 words,
  CTA visible in the first viewport, and a real app screenshot;
- varied section families, with no equal three-card feature row and no repeated
  image/text zigzag three times;
- system sans typography, one cobalt accent, consistent 14/10/8px radius rules,
  no gradients, glow, decorative dots, scroll cues, fake status, version stamps,
  or generic glass panels;
- zero em-dash or en-dash characters in visible EN/FR copy;
- no emoji, hand-drawn SVG icon paths, fake logos, fake testimonials, or filler
  phrases such as Seamless, Unleash, Elevate, or Revolutionary.

Capture media from a real app fixture after Plan 008. Provide an optimized AVIF
or WebP hero image with explicit dimensions and a WebM/MP4 demo plus poster. The
demo shows select text, trigger capture, save prompt ideas, select multiple, copy
as a list, then paste manually into an agent chat composer. Do not show private
content or third-party credentials. Keep each video source within the media
budget recorded in `docs/SITE.md`; use native controls and captions/transcript.
Use the same operator-approved raster app icon for the favicon. Do not invent a
second logo, draw an SVG mark, or present the text wordmark as a registered brand.

**Verify**: media tests decode assets, assert dimensions/durations/size/alt text,
and reject placeholder or fake-div screenshots. Build emits responsive images
with no CLS-prone missing dimensions.

### Step 5: Add restrained, motivated motion

Use CSS and small framework-free scripts only. Motions are limited to:

- hero copy and real media entering in a hierarchy-revealing sequence;
- one feature-story reveal that connects capture, organize, and copy;
- tactile hover/active/focus feedback on interactive controls.

Animate only transform and opacity. Use IntersectionObserver or CSS scroll-driven
animation as progressive enhancement, never a raw scroll listener. Every effect
has cleanup and an immediate reduced-motion fallback. No marquee, magnetic cursor,
parallax, autoplay video with sound, horizontal scroll hijack, or infinite loop.

**Verify**: browser tests enable reduced motion and confirm no nonessential
animation; a static no-JS capture retains complete content order and CTAs.

### Step 6: Build privacy, downloads, and changelog pages

Privacy pages mirror `docs/PRIVACY.md`: local app data, no account/sync/analytics/
telemetry/crash upload, explicit clipboard/Accessibility behavior, and optional
update network disclosure. The site itself sets no nonessential cookie/local
storage except the theme preference, runs no analytics, and submits no forms.

Download pages read checked-in `downloads.json`; before Plan 012 it contains only
real release-page links and availability states. Plan 012 will generate artifact
metadata. Show Mac and Linux first, then Windows when supported. Never infer
support solely from browser user-agent. Changelog reads checked-in verified
release summaries or links to releases; no runtime GitHub fetch.

**Verify**: browser network test finds no third-party request before an explicit
external/download click; broken-link test covers every internal and release URL;
EN/FR privacy claims have key parity.

### Step 7: Add site-specific tests and run the design pre-flight

Add Astro/unit tests for dictionaries, localized links, metadata, download schema,
and theme contract. Add Playwright journeys for EN/FR navigation, all themes,
keyboard header/menu, reduced motion, no-JS content, media controls/transcript,
privacy, downloads, 404, and external-link safety. Test widths 390, 768, 1280,
and 1536 with no horizontal overflow.

Run the full `design-taste-frontend` pre-flight. Record results in `docs/SITE.md`,
including Core Web Vitals targets LCP < 2.5s, INP < 200ms, CLS < 0.1; exact
eyebrow count; section-layout diversity; CTA contrast/wrap; page-theme lock;
real-media proof; copy self-audit; mobile collapse; and zero em-dashes.

**Verify**: Astro check, Site tests, Static build, and Aggregate commands all
exit 0 twice from clean processes.

## Test plan

- Typed EN/FR dictionary and route-alternate unit tests.
- Built HTML metadata, sitemap, robots, JSON-LD, and placeholder-domain tests.
- Shared-theme contract tests for three themes, no JS, contrast, and no raw colors.
- Real-media integrity, dimensions, size, transcript, and privacy checks.
- Playwright for navigation, theme, locale, keyboard, responsive widths, reduced
  motion, no third-party requests, downloads, privacy, and 404.
- Manual design review in all themes at phone, tablet, laptop, and wide desktop.
- Verification: `bun run check && bun run build:site && bun run test:site` -> all pass twice.

## Done criteria

- [ ] Astro emits a static EN/FR site for home, privacy, download, and changelog.
- [ ] Site imports `@charon/theme` and contains no duplicated theme values.
- [ ] No React, Base UI, Tauri, desktop source, backend, CMS, analytics, or form exists.
- [ ] Hero and demo use real app media, explicit dimensions, transcript, and no private content.
- [ ] Copy contains only verified claims, one CTA intent, and zero em/en dashes.
- [ ] Light, Solarized, dark, reduced motion, no JS, and mobile remain usable.
- [ ] Metadata, hreflang, sitemap, robots, structured data, and internal links validate.
- [ ] Download states never advertise absent or unsupported artifacts.
- [ ] No third-party request occurs before an explicit external link click.
- [ ] Full design pre-flight and all checks/tests/builds pass twice.
- [ ] This plan's row in `plans/README.md` is `DONE`.

## STOP conditions

- Real application media cannot be captured without exposing private user data.
- The site requires importing desktop React/Tauri source or adding a shared UI package.
- A download, platform, privacy, performance, or customer claim lacks evidence.
- `@astrojs/check` resolves TypeScript 7 or TypeScript 6 leaks into desktop.
- Static output cannot satisfy the chosen content without a runtime API or CMS.
- Any tracker, cookie, third-party embed, autoplay audio, or form enters scope.
- A theme or CTA fails WCAG AA after two token/layout corrections.

## Maintenance notes

- Product screenshots and demo video must be refreshed when a release materially
  changes capture, notes, copy, themes, or platform permission UI.
- The site copy is independent from desktop Paraglide because public marketing
  and application UI have different release rhythms. Keep concepts consistent
  through docs, not a giant shared dictionary.
- Plan 012 owns deployment and generation of signed artifact download metadata.
- Remove TypeScript 6 from `apps/site` as soon as Astro Check declares and proves
  TypeScript 7 support.
