# Charon public site contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) while
preserving ADR 0004's static-site and cross-application boundaries.

## Current public direction

On 2026-08-13, the operator deliberately reduced the public home to a quiet
holding page. Charon is still taking shape, so the homepage stays concise and
avoids detailed product, platform, privacy, and workflow claims for now.

The public home has one job: establish the Charon name, signal that the project
is in progress, and offer one truthful route to release information. It does not
try to explain the complete desktop product before that story is ready.

## Homepage composition

The English `/` and French `/fr/` pages contain only:

1. one compact header with the official Lavender Charon PNG icon and the name
   `Charon`;
2. one short headline;
3. one deliberately vague sentence;
4. one `View releases` or `Voir les versions` action;
5. one minimal footer containing only `Charon`.

There is no product navigation, language switch, theme control, source link,
product screenshot, video, feature section, platform table, privacy proof,
demo, or content section below the initial statement. The homepage does not
contain a client script.

The localized privacy, release, changelog, and 404 routes remain available by
their stable direct URLs. They keep verified operational and privacy copy, but
the homepage does not promote or summarize them beyond its single release
action.

## Design direction

The site is read as a restrained editorial holding page for developers and
agent users. Design variance is 4/10, motion is 1/10, and density is 2/10. It
keeps the Solarized canvas and semantic Charon theme roles, uses the system UI
font, and spends the only visual emphasis on the approved Lavender icon.

Structure comes from type, space, and two hairline rules. The page has no
gradient, glow, permanent glass, shadowed card, fake interface, decorative
illustration, remote font, or ambient animation. The primary action has a small
press response and respects reduced motion.

The page remains readable at 320 CSS pixels and above, preserves browser zoom,
uses a visible focus indicator, includes a skip link, and maintains WCAG AA
contrast. Every image has explicit dimensions. Brand text uses `translate="no"`.

## Approved icon assets

The source kit remains:

`/Users/simonhazard/Documents/Codex/2026-07-31/j-aimerais-faire-un-logo-partir-2/outputs/charon-brand-kit-final/`

The site owns exact, unmodified copies of the official Lavender PNG icon at 16,
32, 180, 512, and 1024 pixels. The 16 and 32 pixel files are favicons, the 180
pixel file is the Apple touch icon, the 512 pixel file is the manifest icon, and
the 1024 pixel file is the social image. No generated, redrawn, or screenshot
derived logo is accepted.

## Information architecture

- `/` is the English holding page.
- `/fr/` is the French holding page.
- `/privacy/` and `/fr/confidentialite/` are localized privacy pages.
- `/download/` and `/fr/telechargement/` report the verified release state.
- `/changelog/` and `/fr/changelog/` list only shipped facts.
- unknown paths use the checked static `404.html`.

Astro output remains static only. There are no accounts, forms, cookies,
analytics, CMS, newsletter, client framework, runtime fetch, or runtime API.

## Search and social metadata

The homepage browser title, Open Graph title, and site name are exactly
`Charon`. Its localized description stays as short and non-specific as the
visible holding copy. Open Graph and Twitter use the official 1024 pixel PNG
icon with a compact `summary` card, not a product screenshot or large media
card.

Every route keeps a verified canonical URL and reciprocal `hreflang` links,
including `x-default`. Sitemap and robots files remain generated. Structured
application data is omitted while the public homepage intentionally avoids
detailed product and release claims.

## Privacy and supporting routes

The privacy pages remain the source of truth for local Workspace ownership,
permissions, bounded source Copy behavior, explicit `Copy as Markdown`, managed
Attachment paths, deletion limits, and Cloudflare hosting metadata. The release
pages continue to state that no signed public installer is available and link
only to the real GitHub Releases destination.

The public site itself stays free of analytics, trackers, fingerprinting,
cookies, forms, behavioral pixels, third-party embeds, and application request
logging. It never sends Note content, Tags, Attachments, searches, selections,
clipboard contents, filenames, or paths to the developer.

## Hosting contract

The checked static output is hosted on Cloudflare Workers Static Assets at
`https://charon.simonhazard.com`. The Worker configuration has no runtime entry
point, binding, secret, server route, redirect service, analytics client, or
application request log. Persistent Worker observability and Cloudflare Web
Analytics remain disabled, as do Wrangler usage metrics and dependency
instrumentation.

The custom domain is the only public deployment surface. The `workers.dev`
route and every Preview URL are disabled, and production receives no Cloudflare
Access cookie. A path-filtered GitHub Actions workflow deploys after a push to
`main` only when the site, shared theme, root manifest, or lockfile changed. It
runs the checked static build before deployment and has read-only GitHub
permissions.

Cloudflare necessarily processes ordinary HTTP connection metadata to deliver
and protect the site. The localized privacy page discloses that hosting
boundary.

## Verification gate

Before publication:

- build all localized routes and validate canonical and `hreflang` metadata;
- verify both homes contain no media, video, secondary navigation, theme or
  language control, source link, or section below the holding statement;
- verify all referenced Charon PNG icons are exact site-owned assets and stay
  within their size budgets;
- review English and French visible strings and reject em dash characters;
- test keyboard navigation, focus, browser zoom, 320, 390, 768, 1280, and 1536
  CSS pixel widths;
- run the site, workflow, privacy, aggregate, and static Cloudflare checks.

Performance targets remain LCP below 2.5 seconds, INP below 200 milliseconds,
and CLS below 0.1 on the production deployment. The homepage has no remote
font, large media, third-party request, or client script.
