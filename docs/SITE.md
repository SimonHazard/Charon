# Charon public site contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) while
preserving ADR 0004's static-site and cross-application boundaries.

## Product story

The site presents Charon as the rapid local capture shelf for people who use AI
agents. Its central story is concrete and sequential: select useful text, press
Shift twice on a proved macOS build, receive one ordinary local Note without
losing focus, enrich it with optional Tags or managed Attachments, then choose
`Copy as Markdown` to produce agent-ready text and local managed paths.

The portable story is equally visible: invoking `CmdOrCtrl+Shift+Space` reveals
Charon and focuses the always-visible bottom composer on every platform. The
site distinguishes that command contract from evidence-gated global operating-
system delivery and never implies that modifier-only capture works on Linux or
Windows before their accepted native and signed-build gates pass.

## Design direction

The site is an editorial product page for developers and agent users. It uses
the approved Charon identity with restraint rather than imitating a native
application shell. Design variance is 7/10, motion is 5/10, and density is 3/10.
The result should feel calm, precise, and authored, not templated, playful, or
corporate.

Authoritative brand primitives are Charon Prune `#171221`, Charon Lavender
`#8F8BE8`, Charon Cream `#F5F2EA`, Solarized Canvas `#FDF6E3`, Solarized Surface
`#EEE8D5`, and Solarized Ink `#073642`. Solarized is the default presentation;
Light and Dark remain visitor choices. Every value reaches components through
semantic `@charon/theme` roles. The wordmark remains vector artwork, system UI
fonts own interface typography, and a Lavender crossing line derived from the
oar is the one signature graphic device.

Use borders, alignment, and space for structure. Do not use gradients, glow,
permanent glass, fake luxury styling, generic bento layouts, rounded feature-
card grids, or an equal row of three feature cards. Visible marketing copy has
no em dash characters, uses concrete verified claims, and keeps one consistent
label per call-to-action intent. No testimonial, customer logo, usage number,
privacy claim, or platform claim appears without evidence.

## Page composition

The hero is asymmetric: concise rapid-capture value and the primary verified
download action on one side, one real Solarized Charon image on the other. Hero
copy, action, and media fit the initial viewport at common desktop sizes. The
image comes from the actual application and is never a generated mockup, stock
device, or fake interface made from styled rectangles.

One real video lower on the page shows the complete journey:

1. select non-sensitive sample text in another application;
2. capture one local Note without focus theft on the proved macOS build;
3. find it in the single shelf and add a quiet Tag and one managed Attachment;
4. choose `Copy as Markdown` and show the deterministic body, Tag, and local
   managed Attachment path without implying that file bytes were copied;
5. paste manually into a local agent workflow as a separate user action.

The video has a poster, reserved dimensions, captions or transcript, and direct
controls, with no autoplay sound. Reduced-motion visitors get static placement,
the poster, and direct playback without scroll-driven motion.

Lower sections use varied layouts: a real single-shelf/editor detail, a
full-width local-only privacy statement, a compact honest platform table, a
plain explanation of visible Markdown and `Documents/Charon`, and one focused
download section. The copy may introduce lightweight Tags, Note-owned managed
Attachments, Open/Done, and irreversible deletion only at the precision of the
current product contract. It must disclose that explicit agent-ready copy puts
managed absolute paths, never Attachment bytes, on the clipboard.

Real media is captured from a release candidate in Solarized, Light, and Dark
as required and reviewed for private content, filesystem identifiers, and
clipboard details. Open Graph images use this real media. Every visible download
link resolves to a signed release asset or real GitHub Release before
publication.

## Privacy and deletion claims

The site states that Notes, Tags, and managed Attachment copies stay inside the
user-controlled local Workspace and that Charon has no account, sync, analytics,
telemetry, crash upload, or content upload. It links the complete privacy
contract near any condensed claim.

Selected-text capture copy discloses the macOS Accessibility permission and the
bounded source Copy fallback from ADR 0010: selected text may exist briefly on
the system clipboard and be visible to a clipboard manager before safe
restoration. The site never describes capture as clipboard-free in every app.

Deletion copy says Charon removes successfully deleted Markdown and managed
Attachment bytes from the active Workspace and normal completed Charon
transaction backups. It also says external backups, synchronized-folder
history, and operating-system snapshots are outside Charon's erasure guarantee.
Migration copy distinguishes the visible user-owned legacy Markdown archive
from active Notes.

## Motion and accessibility

Animate only transform and opacity. Motion explains hierarchy, feedback, or a
state change. Controls respond on press; entrances and exits share related
origins; no loop competes with the real demo. Theme changes avoid abrupt full-
page brightness flashes.

Honor `prefers-reduced-motion` with static placement or short opacity fades,
reduced transparency with solid surfaces, and increased contrast with stronger
semantic borders. The site remains keyboard navigable, preserves a visible
focus indicator, uses meaningful alt text, supports large text and EN/FR
expansion, and meets WCAG AA contrast.

## Information architecture

- `/` is the English product page.
- `/fr/` is the French product page.
- `/privacy/` and `/fr/confidentialite/` are localized privacy pages.
- `/download/` and `/fr/telechargement/` are localized platform and download
  pages.
- `/changelog/` is the changelog and release destination, with a localized
  route only when translated release copy is maintained.

The language switch maps to the equivalent localized route. The theme switch
uses shared names, presents Solarized first, and respects a remembered explicit
choice. Astro output is static only. There are no accounts, forms, cookies,
analytics, CMS, newsletter, or runtime API. Site behavior works without a
client framework except for narrowly justified progressive enhancement.

## Search and social metadata

Every localized page has a verified canonical URL and reciprocal `hreflang`
links, including `x-default` where appropriate. Generate sitemap and robots
files. Titles, descriptions, and Open Graph metadata are localized, concrete,
and based on verified copy plus real application media.

Add `SoftwareApplication` structured data only for verified product name,
description, operating-system support, current release, price, download URL,
and publisher details. Omit any field that cannot be proved at build time.

## Publication gate

Before publishing, review every visible EN/FR string and confirm there are no em
dash characters. Test Solarized, Light, Dark, accessibility preferences, large
text, keyboard navigation, and responsive layouts. Play the real demo, inspect
every frame for private content, validate metadata and platform wording, and
follow every download link to its signed destination.
