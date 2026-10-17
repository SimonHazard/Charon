# ADR 0029: A ⌘K command menu over the shelf

## Status

Accepted on 2026-10-17 by operator decision. Amends the keyboard contract of
`docs/UX.md` (one new shortcut) and the "no other product destination" rule
only as written below.

## Context

Charon reached every action through scattered controls: Tags only from a chip
on a visible row, appearance and language only inside Preferences, a Note only
by scrolling or searching. A keyboard-first capture tool needs one fast way
through all of them. The single shelf stays the product; the menu is a fast way
through it, not a new place.

## Decision

1. `CmdOrCtrl+K` toggles one transient command menu, a modal glass dialog
   anchored high in the shelf. It never opens over another modal dialog. A
   Commands icon button beside Help and Settings opens it too.
2. The menu is a combobox with one listbox. The query filters, accent- and
   case-insensitively, in this order:
   - **Tags**: focus any Tag of the Workspace (ADR 0030), or show all Notes;
   - **Notes**: at most six Notes matching the query, which open in the editor;
   - **Actions**: New note, New drawing, Search notes, Show keyboard shortcuts,
     Open settings, Hide Charon (ADR 0031);
   - **Appearance** and **Language**, with the current choice checked;
   - **New tag**: a query that names no Tag can become one, offered last so
     that a query naming an action runs the action first.
3. Arrow keys, PageUp/PageDown, `Ctrl+N`/`Ctrl+P`, and the pointer move the
   highlight; Enter or a click runs it; Escape closes. A chosen entry runs
   after the dialog has finished closing, so focus it moves (the composer,
   search, an editor) is not taken back by the dialog's focus restoration.
4. The menu adds no command of its own: every entry calls the same code as the
   control it stands for. It reads only the snapshot React already holds.

## Alternatives rejected

- **Base UI Autocomplete**: it would select a value into the input rather than
  run a command, and the menu needs grouped, checked rows that a plain ARIA
  combobox expresses directly.
- **A menu that searches Note bodies beyond the existing index**: it would
  duplicate search; the menu reuses the shelf's search index.

## Consequences

- Help lists `CmdOrCtrl+K`.
- New entries must call an existing control's code path and join this ADR's
  list in the same change.

## Revisit when

Revisit if the menu grows past a screenful of actions, or if a second modal
destination is proposed through it.
