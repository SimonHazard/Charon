# ADR 0019: Follow the system appearance by default

## Status

Accepted on 2026-09-23 by operator decision. Amends ADR 0012 Decision 5.

## Context

ADR 0012 made Light the first-run appearance and stored only `light` or `dark`.
Charon never read `prefers-color-scheme`, so a first launch on a dark macOS,
GNOME, or Windows desktop opened a bright window, and the app never followed
the OS when it switched appearance. The window also had no configured
background colour, so the OS showed a white or grey rectangle until the
stylesheet loaded. A native-feeling desktop app follows the system by default
and lets the user pin a choice.

## Decision

1. The appearance preference has three values: `system`, `light`, and `dark`
   (Graphite). A first run, or unavailable storage, uses `system`.
2. `system` resolves through `prefers-color-scheme` and follows live OS
   changes while it stays selected. Light and Graphite are explicit choices
   that never flip with the OS.
3. `data-theme` still receives only `light` or `dark`, so the semantic token
   contract is unchanged. A stored legacy `solarized` value, or any other
   unknown value, still resolves to Light.
4. The inline pre-paint script resolves the preference before React and paints
   the resolved `--canvas` colour on the document; the stylesheet takes over
   once React applies the theme. The Tauri window's `backgroundColor` is the
   Light canvas so no unstyled rectangle appears before the webview paints.
5. Preferences offers System, Light, and Graphite as one compact toggle group
   with localized accessible names and Tooltips.

## Consequences

- Users on a dark desktop see Graphite on first launch; existing explicit
  choices are preserved.
- The two canvas literals in `index.html` and `tauri.conf.json` must follow any
  later `--canvas` change; contract tests fail until they do.
- The native window background is Light before the webview paints, even on a
  dark desktop; the webview then paints the resolved canvas immediately.
- Linux WebKitGTK support for `prefers-color-scheme` depends on the desktop
  environment; Charon claims only what native sessions confirm.

## Revisit when

Revisit if a platform webview cannot report `prefers-color-scheme`, or if the
native window background can be resolved from the OS appearance before the
webview loads.
