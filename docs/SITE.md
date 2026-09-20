# Charon public site contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) while
preserving ADR 0004's static-site and cross-application boundaries.

## Current public direction

The public home announces v0.1.0 early access with a concise product
introduction and one ordinary link to GitHub Releases. The initial release was
published on 2026-09-20 with macOS, Windows, and Linux installers; both languages
state its availability and refer to the release notes for installation instructions.

The operator requested this evolution on 2026-09-19. It preserves the quiet
visual direction, approved icon assets, and static privacy boundary.

## Homepage composition

The English `/` and French `/fr/` pages contain only:

1. one compact header with the official Lavender Charon PNG icon and the name
   `Charon`;
2. one short headline and a description of local Markdown capture for AI context;
3. the published early access version and one primary download destination linking
   to `https://github.com/SimonHazard/Charon/releases`;
4. short copy explaining that macOS, Windows, and Linux installers are
   available there, and that this is an experimental personal project with
   installation instructions in the release notes;
5. one minimal footer with `Ko-fi` linking to
   `https://ko-fi.com/simonhazard` and `simonhazard.com` linking to
   `https://simonhazard.com/`.

The footer does not repeat `Charon`. The download destination is the release
listing, which exists before the first release and remains useful afterwards.
Do not invent installer filenames, publish a dead version-specific link, or
claim a build is available before publication. When the announced version changes,
update the localized copy and its verification assertions together.

There is no product navigation, language switch, theme control, source link,
product screenshot, video, feature section, platform table, privacy proof,
demo, or content section below the initial statement. The homepage does not
contain a client script.

The localized privacy, release, and changelog routes are not emitted. The
checked static `404.html` remains only as the hosting fallback for unknown
paths; it is not a promoted content destination.

## Design direction

The site is read as a restrained editorial early access page for developers and
agent users. Design variance is 4/10, motion is 1/10, and density is 2/10. It
keeps the Light canvas and semantic Charon theme roles, uses the system UI font,
and uses Lavender for the approved icon and primary download action.

Structure comes from type, space, and two hairline rules. The page has no
gradient, glow, permanent glass, shadowed card, fake interface, decorative
illustration, remote font, or ambient animation. The primary download and
technical 404 actions have a small press response, and every interactive link
respects reduced motion.

The page remains readable at 320 CSS pixels and above, preserves browser zoom,
uses a visible focus indicator, includes a skip link, and maintains WCAG AA
contrast. Every image has explicit dimensions. Brand text uses `translate="no"`.

## Approved icon assets

The site owns exact, unmodified repository copies of the official Lavender PNG icon at 16,
32, 180, 512, and 1024 pixels. The 16 and 32 pixel files are favicons, the 180
pixel file is the Apple touch icon, the 512 pixel file is the manifest icon, and
the 1024 pixel file is the social image. No generated, redrawn, or screenshot
derived logo is accepted.

## Information architecture

- `/` is the English early access page.
- `/fr/` is the French early access page.
- unknown paths use the checked static `404.html`.

No other public content route is emitted for now. In particular, privacy,
release/download, and changelog URLs are absent in both languages.

Astro output remains static only. There are no accounts, forms, cookies,
analytics, CMS, newsletter, client framework, runtime fetch, or runtime API.

## Search and social metadata

The homepage browser title, Open Graph title, and site name are exactly
`Charon`. Its localized description matches the concise visible product
introduction. Open Graph and Twitter use the official 1024 pixel PNG
icon with a compact `summary` card, not a product screenshot or large media
card.

Both localized home routes keep verified canonical URLs and reciprocal
`hreflang` links, including `x-default`. Sitemap and robots files remain
generated. Structured application data remains omitted from this compact page.

## Privacy and outbound links

The repository privacy and product contracts remain the source of truth for
local Workspace ownership, permissions, bounded source Copy behavior, explicit
`Copy as Markdown`, managed Attachment paths, deletion limits, and Cloudflare
hosting metadata. Those detailed claims are intentionally not published as site
routes for now.

The public site itself stays free of analytics, trackers, fingerprinting,
cookies, forms, behavioral pixels, third-party embeds, and application request
logging. It never sends Note content, Tags, Attachments, searches, selections,
clipboard contents, filenames, or paths to the developer.

The GitHub Releases, Ko-fi, and personal-site destinations are ordinary anchors
with `rel="noreferrer"`, never embeds or prefetched resources. A visitor leaves
the Charon site's privacy boundary only after explicitly following one of them.

## Hosting contract

The checked static output is hosted on Cloudflare Workers Static Assets at
`https://charon.simonhazard.com`. The Worker configuration has no runtime entry
point, binding, secret, server route, redirect service, analytics client, or
application request log. Persistent Worker observability and Cloudflare Web
Analytics remain disabled, as do Wrangler usage metrics and dependency
instrumentation.

The custom domain is the only public deployment surface. The `workers.dev`
route and every Preview URL are disabled, and production receives no Cloudflare
Access cookie. The GitHub Actions deployment workflow runs only after a
protected update to `main`, normally the maintainer merging a pull request. It
runs the checked static build before deployment, has read-only GitHub
permissions, and receives Cloudflare credentials only inside the
`site-production` environment. Pull requests run the Quality workflow without
deployment credentials.

Cloudflare necessarily processes ordinary HTTP connection metadata to deliver
and protect the site. The repository privacy contract discloses that hosting
boundary while the public site remains front-page only.

## Verification gate

Before publication:

- build all localized routes and validate canonical and `hreflang` metadata;
- verify both homes contain no media, video, secondary navigation, theme or
  language control, source link, or additional content section; verify one
  GitHub Releases action and the published early access version in both languages;
- verify the footer contains only the exact Ko-fi and personal-site links and
  does not repeat `Charon`;
- verify privacy, release/download, and changelog routes are absent in both
  languages and absent from the sitemap;
- verify all referenced Charon PNG icons are exact site-owned assets and stay
  within their size budgets;
- review English and French visible strings and reject em dash characters;
- test keyboard navigation, focus, browser zoom, 320, 390, 768, 1280, and 1536
  CSS pixel widths;
- run the site, workflow, privacy, aggregate, and static Cloudflare checks.

Performance targets remain LCP below 2.5 seconds, INP below 200 milliseconds,
and CLS below 0.1 on the production deployment. The homepage has no remote
font, large media, third-party request, or client script.
