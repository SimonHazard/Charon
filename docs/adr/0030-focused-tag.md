# ADR 0030: A focused Tag for the shelf and new Notes

## Status

Accepted on 2026-10-17 by operator decision. Amends ADR 0011's flat-collection
rule only as written below; ADR 0012's single shelf and the Tag rules of
`AGENTS.md` are unchanged. The Tag filter of `docs/UX.md` becomes the focused
Tag.

## Context

Users work in short streams: a run of captures about one project, then another.
Charon forbids sections, hierarchy, and multiple destinations, but already has
flat Tags and a one-Tag filter that a chip click applied and nothing
remembered. Every capture of a stream then had to be tagged by hand.

## Decision

1. The Tag filter becomes the **focused Tag**: at most one Tag, remembered in
   native preferences (`focusedTag`, schema v1, absent in older files) until
   the user leaves it. Focusing a Tag that no Note has yet is allowed, so a
   stream can start empty.
2. While a Tag is focused, the shelf shows only its Notes (search still
   applies within it), and every new Note starts with that Tag: one created in
   the composer, a selected-text capture (Rust reads the preference at capture
   time), a drawing, or files dropped or pasted onto the shelf (ADR 0032).
3. A Tag is focused from its chip, the command menu (ADR 0029), or a new name
   typed there. It is left with the chip's leave button, the menu's Show all
   Notes, or Escape in search. A quiet strip under the composer names the Tag
   new Notes receive.
4. `preferences_set_focused_tag` trims the Tag and checks it with the Note Tag
   rules before storing it. A stored Tag that no longer satisfies them is
   skipped when a capture creates a Note, so an invalid preference never costs
   a capture.
5. `createNote` gains an optional `tags` list, validated like `setNoteTags`.
   Recovery records written before this change omit it and replay unchanged.

## Alternatives rejected

- **A `# Name` composer syntax**: in Charon a leading `#` is a Markdown heading
  that titles the Note.
- **Sections stored in the Workspace**: a hierarchy and a second destination,
  both rejected by ADR 0011.

## Consequences

- The focused Tag is view and capture state, never Note content: changing it
  edits no Note.
- Tags keep no IDs, colours, nesting, or registry.

## Revisit when

Revisit if users need several focused Tags at once, or if captures landing in
a forgotten focus prove surprising.
