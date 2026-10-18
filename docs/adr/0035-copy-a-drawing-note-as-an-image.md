# ADR 0035: Copy a drawing Note as an image

## Status

Accepted on 2026-10-18 by operator decision. Amends ADR 0033's rule that
`Copy as Markdown` never carries an image, for one kind of Note only.

## Context

The operator's native check of ADR 0033 copied a drawing with the Note's own
Copy action and pasted SVG source into a chat. A Note made with New drawing
holds nothing but its drawing block, so its Markdown is SVG text that no agent
reads as a picture; the image was one button deeper, beside the Preview.
ADR 0033 asked to revisit when image copy is wanted for Notes.

## Decision

1. **Which Notes.** A Note copies as an image when its body is exactly one
   top-level drawing block (whitespace around it allowed) and it has no
   Attachment. Any other text, a second drawing, a drawing inside a quote,
   list, or footnote, or an Attachment keeps `Copy as Markdown`, so no text
   and no Attachment path is ever dropped silently.
2. **Same write.** The row's Copy action and its `Cmd/Ctrl+C` shortcut render
   that drawing exactly as Copy image does and send the PNG to
   `clipboard_write_drawing_image`. Nothing else enters the clipboard; the
   Note's Tags are not part of the image.
3. **Labels.** The row action reads Copy as image ("Copier en image") and
   drops the local-path disclosure, which does not apply. Success and failure
   stay in place, as for Markdown.

## Alternatives rejected

- **Markdown and image together** in one clipboard write: the cross-platform
  clipboard adapter writes one representation, and paste targets disagree on
  which one they take.
- **An image for every Note that contains a drawing**: it would lose the
  Note's text.

## Consequences

- Copying a drawing-only Note never writes its SVG source; a user who wants
  the source opens the editor and copies it there.
- The webview decides between the two writes from the snapshot's body; Rust
  still validates the PNG within ADR 0033's bounds.

## Revisit when

Revisit if Notes mixing text and drawings need an image, or if the clipboard
adapter gains multi-representation writes.
