# Charon public site contract

## Design read

The site is a product landing page for developers and agent users. Its language
is premium and Apple-like but restrained, built from the same cold-luxury tokens
as the desktop instead of imitating a native application shell.

Design variance is 7/10, motion is 5/10, and density is 3/10. The result should
feel editorial and composed, not templated, playful, or corporate.

## Visual system

Use a system sans stack, cold off-white and silver light surfaces, graphite dark
surfaces, Solarized semantics, and one cobalt accent. Use semantic tokens shared
through `@charon/theme`. Surface, field, and compact-control radii are 14px,
10px, and 8px respectively. Borders and space create structure. Do not use
gradients, glow, permanent glass, a warm beige luxury palette, or an equal row
of three feature cards.

Visible copy contains zero em-dash characters. It uses concrete product claims,
short paragraphs, and one consistent label for each call-to-action intent. No
stock testimonial, customer logo, usage number, privacy claim, or platform claim
appears without evidence.

## Page composition

The hero is asymmetric: concise value and primary download action on one side,
one real image captured from Charon on the other. The image is not a collection
of styled rectangles, a generated fake UI, or a stock device mockup. Hero copy,
action, and media fit the initial viewport at common desktop sizes.

Lower on the page, one real video demonstrates the complete capture and copy
journey. It has a poster frame, dimensions reserved before load, captions or a
text transcript, direct controls, and no autoplay with sound. A reduced-motion
visitor gets the poster and direct playback without scroll-driven movement.

Sections use varied layouts: asymmetric media and copy, a full-width privacy
statement, a compact platform capability table, and a single focused download
section. Do not repeat an image-copy zigzag more than twice, use an equal
three-card row, add decorative card grids, or place fake product UI on the page.

Real app media is captured from a release candidate in both themes and reviewed
for private sample content. Open Graph images use this real media. Every visible
download link resolves to a signed release asset or a real GitHub Release before
publication.

## Motion and accessibility

Animate only transform and opacity. Motion explains hierarchy, feedback, or a
state change and stays within the motion level of 5. Controls respond on press,
entrances and exits use related origins, and no looping decoration competes with
the demo.

Honor `prefers-reduced-motion` with static placement or short opacity fades.
Honor reduced transparency with solid surfaces and increased contrast with
stronger semantic borders. The site remains keyboard navigable, preserves a
visible focus indicator, uses meaningful alt text, and meets WCAG AA contrast.
Theme changes avoid abrupt full-page brightness flashes.

## Information architecture

- `/` is the English product page.
- `/fr/` is the French product page.
- `/privacy/` and `/fr/confidentialite/` are localized privacy pages.
- `/download/` and `/fr/telechargement/` are localized platform and download
  pages.
- `/changelog/` is the changelog and release destination, with a localized
  route if translated release copy is maintained.

The language switch maps to the equivalent localized route. The theme switch
uses the shared theme names and respects system preference before a visitor
chooses an override.

Astro output is static only. There are no accounts, forms, cookie banner,
analytics, CMS, newsletter, or runtime API. Site behavior must work without a
client framework except for narrowly justified progressive enhancement.

## Search and social metadata

Every localized page has a verified canonical URL and reciprocal `hreflang`
links, including `x-default` where appropriate. Generate a sitemap and robots
file. Titles, descriptions, and Open Graph metadata are localized and based on
verified copy and real application media.

Add `SoftwareApplication` structured data only for verified product name,
description, operating-system support, current release, price, download URL,
and publisher details. Omit any field that cannot be proved at build time.

## Publication gate

Before publishing, review every visible string for EN/FR meaning, confirm there
are no em-dash characters, test both themes and preference fallbacks, play the
real demo, inspect responsive layouts, validate metadata, and follow every
download link to its signed destination.
