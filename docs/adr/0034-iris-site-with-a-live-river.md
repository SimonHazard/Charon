# ADR 0034: The Iris site with a live river

## Status

Accepted on 2026-10-17 by operator decision. Amends `docs/SITE.md` (homepage
composition, design direction, client script) and the static-site line of
`AGENTS.md`. ADR 0004's static, cross-application, and privacy boundaries are
unchanged.

Amended on 2026-10-18 by operator decision: how it works is three plain
numbered steps of one sentence each, with no output panels (the try section
already shows the real clipboard text), and the footer carries no visible
River credit; the licence notice stays with the vendored files and in the
shipped script as a legal comment. The footer is as tall as its content,
with a smaller cropped name.

## Context

The site was a quiet holding page: a headline, a download link, and no client
script. The operator asked for it to wear the desktop app's new Iris design and
to look striking, using React Bits components where they help. The page still
has to tell the truth about a local-only app, load nothing from elsewhere, and
show no imitation of the product's interface.

## Decision

1. **Idea.** Charon is named after the ferryman of the Styx. The first screen
   sets a two-line statement ("Keep what matters." / "Gardez l'essentiel.") at
   poster size, and a river runs across the screen between it and the bottom
   row that carries the introduction and the download. The river is React
   Bits' Threads, a dependency-free WebGL2 canvas that is decorative
   (`aria-hidden`), pauses off screen and in hidden tabs, holds still under
   reduced motion, and is hidden in forced colours.
2. **Sections.** Below the hero, in order: how it works, as three steps whose
   responses are Charon's real outputs set as code (the Markdown file in
   `notes/`, the Workspace folder, and the exact `Copy as Markdown` text); a
   try section whose heading is an input, where the visitor's note and a
   sample's Tags are composed live in `ClipboardComposer`'s format, with an
   optional Copy button that writes only that text after a click; privacy, as
   side facts and one paragraph on the page's single field of accent colour;
   and a closing invitation with a second download link above the cropped
   name. Both languages carry the same content.
3. **Appearance.** The page uses Iris Dark from `@charon/theme`; the footer
   switches to Iris Light through its own `data-theme`. Type is the system
   face in five steps. There is no gradient fill, glow, shadow at rest, glass,
   remote font, photograph, or product screenshot. One CSS mask fades the
   river's ends. Motion is a one-time line reveal of the statement and
   scroll-linked entrances where the browser supports view timelines; both
   are skipped under reduced motion, and content never depends on them.
4. **Client code.** `@astrojs/react` hydrates the river as one `client:only`
   island; the try section is one small inline script. Output stays static.
   Scripts load only from `/_astro/`, nothing fetches at runtime, and the CSP
   keeps `script-src 'self'` plus the SHA-256 of every inline script, which
   the build writes into `_headers` and `verify-site.ts` recomputes. Without
   script the page reads completely: the river is absent and the try section
   shows its first sample.
5. **Third-party code.** React Bits components are vendored under
   `apps/site/src/islands/react-bits/` with their MIT + Commons Clause licence
   notice, outside Biome's formatting. Only the files the page uses are kept.

## Alternatives rejected

- **More React Bits effects** (a sheen on text, an orbiting border light,
  spotlight cards): they read as generic decoration and add script without
  carrying the idea.
- **An imitation of the app's window or Note list**: product media must come
  from the real app.
- **`'unsafe-inline'` or a meta-tag CSP**: the header policy stays strict and
  checked.
- **A Light page following the system**: without a script before first paint
  the page cannot pick a theme, and the river reads best on the dark ground.

## Consequences

- The page ships React DOM and the river (about 75 KB compressed) and one
  WebGL2 context; it stays a single static route per language.
- The try section reimplements one formatting function of the desktop app;
  a change to `Copy as Markdown` must update `composeMarkdown` in
  `apps/site/src/content/site.ts`.
- The vendored files are not under Charon's MIT licence; they may not be
  extracted and redistributed on their own.

## Revisit when

Revisit if real product screenshots or footage become available, if the page
grows a second route, or if the river's cost shows in field performance.
