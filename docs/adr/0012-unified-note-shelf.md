# ADR 0012: Unified Note shelf

## Status

Accepted on 2026-08-13 after operator review of the compact desktop shelf.

## Context

The compact shelf implemented the Open/Done filter and one Actions menu per
Note required by ADR 0011. In use, those controls made a small personal capture
tool feel like a management dashboard: completed Notes disappeared into a
second view, common row actions were hidden behind a menu, and the Solarized
palette competed with the Charon identity. The editor also mounted from an
empty React draft before synchronizing the Note, which could produce a visible
flash, while the webview lacked the explicit Tauri capability required to open
the Attachment file picker.

The operator asked for one calmer list in which completion remains directly
visible, a direct permanent-Delete action with confirmation, Light and Graphite
Charon appearances only, and an editor that unfolds from the live Note row.
These requests change ADR 0011's desktop and theme decisions but do not change
the schema, deletion guarantee, clipboard format, Attachment ownership, native
capture contract, or local-only privacy boundary.

## Decision

1. The desktop shows one ordered Note result. Search and an optional Tag match
   reconcile `Selection` against that unified result; status is not a filter.
   A Done Note stays in place, retains its status control, and is distinguished
   by a checked control, muted surface, and struck-through primary text so the
   state never depends on color alone.
2. The compact per-Note Actions menu is removed. A hover, focus, or coarse-
   pointer row exposes direct Edit and permanent Delete controls. Delete always
   opens the existing count-specific irreversible confirmation before the Rust
   command runs. Multi-Note status, `Copy as Markdown`, and Delete remain in the
   contextual Selection controls.
3. Attachment import is available from the expanded editor only. The webview
   receives `dialog:allow-open`, which permits the explicit native picker but
   grants no filesystem API to React. Rust continues to validate and copy every
   selected regular file into its owning Note before persisting metadata.
4. The editor draft is initialized from the Note before first paint. Opening
   and closing use one interruptible shared-layout transition rooted in the
   live row, expressed through transform and opacity only. Reduced motion uses
   a crossfade or static swap, and input is never locked during motion.
5. Light becomes the first-run appearance and Graphite (`dark` internally)
   remains optional. Solarized
   is removed from the theme contract and Preferences. A persisted legacy
   `solarized` value resolves to Light on the next launch. Charon Prune,
   Lavender, and Cream remain the only named brand primitives; semantic roles
   map them to a quiet neutral shelf, white Light surfaces, restrained lavender
   interaction states, and the existing dark counterpart.
6. The bottom composer uses conventional product language: `Add a note…` in
   English and `Ajouter une note…` in French. Charon does not use motivational,
   playful, or startup-style capture copy.

This ADR supersedes ADR 0011 Decision 6 only where it says Selection reconciles
to the current Open or Done result, Decision 10's Open/Done filters and compact
row Actions menu, and Decision 11's Solarized default and palette. All other
ADR 0011 decisions remain authoritative.

## Consequences

- Completion becomes a reversible property visible in context rather than a
  navigation mode.
- A single Note can still be selected natively, including Shift ranges, before
  using `Copy as Markdown`; removing the row menu does not change the explicit
  clipboard boundary or format.
- Direct Delete is easier to find but never bypasses confirmation or the
  irreversible cleanup guarantee.
- The Attachment picker gains only the minimum Tauri dialog capability. The
  source path remains transient command input and is never persisted.
- Light/Graphite tests, screenshots, documentation, and preference migration
  replace the former three-theme matrix.

## Revisit when

Revisit if measured use shows that a unified result is unmanageable at large
Note counts, or if a third appearance can be designed and physically reviewed
without diluting the Charon identity. Any later row action must justify its
frequency and must not recreate a catch-all menu.
