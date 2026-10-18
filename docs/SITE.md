# Charon public site contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) and
[ADR 0034](adr/0034-iris-site-with-a-live-river.md) while preserving ADR 0004's
static-site and cross-application boundaries.

## Current public direction

The public home announces v0.3.1 early access and links to GitHub Releases.
The initial release was published on 2026-09-20, v0.2.0 on 2026-10-02, v0.3.0
on 2026-10-17, and v0.3.1 follows, with macOS, Windows, and Linux installers;
both languages state
its availability and refer to the release notes for installation instructions.

On 2026-10-17 the operator asked for the site to wear the desktop app's Iris
design and to look striking (ADR 0034). It keeps the approved icon assets and
the static privacy boundary. ADR 0017 moved macOS releases to Apple Silicon
starting with v0.1.3; it does not retroactively change the published v0.1.0
artifact. Each release pull request bumps the localized version copy and its
assertions together.

## Homepage composition

The English `/` and French `/fr/` pages contain, in order:

1. a header with the official Lavender Charon PNG icon, the name `Charon`, and
   three in-page links (How it works, Try it, Privacy), with no bar;
2. the hero: a two-line statement at poster size, the river (React Bits'
   Threads) running across the screen beneath it, then the introduction on the
   left and, on the right, the primary download linking to
   `https://github.com/SimonHazard/Charon/releases` above the published early
   access version and its platforms;
3. how it works: a heading and three numbered steps in one row, each a short
   title and one sentence (capture with double Shift or the composer; add
   Tags, files, screenshots, or sketches; `Copy as Markdown` and paste),
   followed by the platform note on double Shift;
4. try it: an input at display size holding a sample Note, the text
   `Copy as Markdown` would write for it with the sample's Tags, updated as
   the visitor types, a Copy button that writes that text only after a click,
   and three other samples that refill the input;
5. privacy, on the page's one field of accent colour: version, platforms, and
   price beside one paragraph on the local-only contract, then what Charon
   captures and keeps;
6. the footer in Iris Light: a two-line invitation with the second download
   link, the experimental-project note, the `Ko-fi` link to
   `https://ko-fi.com/simonhazard` and the `simonhazard.com` link to
   `https://simonhazard.com/`, the copyright, and
   the name `Charon` set large and cut by the page's edge.

The download destination is the release listing, which remains useful across
releases. Do not invent installer filenames, publish a dead version-specific
link, or claim a build is available before publication. When the announced
version changes, update the localized copy and its verification assertions
together. The try samples must keep matching the desktop app's real format; `composeMarkdown` mirrors `clipboard/composer.rs`.

There is no language switch, theme control, source link, product screenshot,
imitation of the app's interface, video, testimonial, or pricing table.

The localized privacy, release, and changelog routes are not emitted. The
checked static `404.html` remains only as the hosting fallback for unknown
paths; it is not a promoted content destination.

## Design direction

The page is a typographic poster for developers and agent users, built on the
desktop app's Iris Dark roles from `@charon/theme`; the footer switches to Iris
Light through its own `data-theme`, and the privacy section is the one field of
the action colour. It uses the system UI font in five type steps (display,
large, statement, body, small), the approved Lavender icon asset, and the
semantic action role for both download links. Running text is 17 pixels.

Structure comes from scale, space, and fields of colour. The page has no
gradient fill, glow, shadow at rest, permanent glass, card grid, eyebrow label,
decorative illustration, remote font, or fake interface; one CSS mask fades
the river's ends. Motion is the statement's one-time line reveal, the river,
scroll-linked entrances where view timelines exist, and press feedback on
controls. Reduced motion removes the reveal and entrances and holds the river
still; forced colours hide the river.

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
analytics, CMS, newsletter, runtime fetch, or runtime API. The only client
code is the river, hydrated by `@astrojs/react` as one `client:only` island,
and the try section's inline script; scripts load only from `/_astro/`, and
the page reads completely without them (ADR 0034).

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
hosting metadata. The home page states the local-only contract in one
paragraph; the detailed claims are intentionally not published as site routes
for now.

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
boundary while the public site remains a single localized page.

## Verification gate

Before publication:

- build all localized routes and validate canonical and `hreflang` metadata;
- verify both homes contain no video, theme or language control, or source
  link; verify both title lines, two GitHub Releases links without a referrer,
  and the published early access version in both languages;
- verify the footer contains exactly the closing download and the Ko-fi and
  personal-site links;
- verify every script loads from `/_astro/` and the `_headers` CSP allows
  exactly the inline scripts the build emitted, by hash;
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
font, large media, or third-party request; its script is the river island and
the try section, about 75 KB compressed.
