# Testing Charon

`bun run verify:release` is the consolidated local release gate. It verifies
generated Rust-to-TypeScript bindings, formatting, type safety, desktop and site
unit suites, static builds, Chromium and WebKit user journeys, serious/critical
axe findings, privacy sentinels, focused performance budgets, Rust formatting,
Clippy, and Rust tests.

Browser tests use only the deterministic `?fixture=media` Workspace. Its Notes,
Tags, Attachment names, paths, and timestamps are synthetic. The fixture is
compiled only by the Vite development server and is eliminated from production
builds. Browser tests never invoke Tauri or touch a real Workspace.

## Performance reference

The reference host is Apple Silicon macOS, measured from a clean production
build with Bun 1.3.12. The gate budgets total desktop JavaScript at 230 KiB gzip
and measures a direct 20,000-Note body, Tag, and Attachment-name scan across nine
runs with a median below 50 ms. The virtual list component separately asserts
fewer than 150 rendered rows. Browser media reserves width and height to keep
layout shift below the site target of 0.1.

Native capture latency, Accessibility behavior, the bounded 700 ms Copy
fallback, 100 MiB Attachment peak memory, and signed artifact behavior remain
physical protocols because a browser fixture cannot prove operating-system
behavior.

## Accessibility protocols

- macOS VoiceOver: traverse titlebar, search, Open/Done, virtual Note list,
  expanded editor, Preferences, permanent Delete confirmation, and composer.
  Record focus order, accessible names, selection state, error announcement,
  and focus return.
- Linux Orca: repeat standard shortcut, composer, search, status, Note actions,
  Preferences, and Delete confirmation. Do not test or claim modifier-only
  selected-text capture.
- At 200% WebView zoom, confirm no action or contextual error is clipped and the
  bottom composer stays visible.
