# ADR 0033: Drawing shapes, text labels, and image copy

## Status

Accepted on 2026-10-17 by operator decision. Amends ADR 0021's tool set and
format whitelist, and the single-format rule of `Copy as Markdown`, which stays
as it is: image copy is a separate explicit action.

Amended on 2026-10-18 by ADR 0035: a Note that is only one drawing, without
Attachments, copies as that drawing's PNG.

## Context

Quick sketches for an agent need more than freehand ink: boxes, arrows, and a
few words, and they often go straight into a prompt as an image. Charon's
inline drawings (ADR 0021) had a pen, an eraser, five inks, and three widths,
stored as stroked `<path>` elements in a fenced `svg` block.

## Decision

1. **Shapes.** Line, Arrow, Rectangle, and Ellipse tools draw ordinary stroked
   paths with the existing commands (`M`, `L`, `Q`): an arrow is its shaft plus
   a two-segment head, a rectangle closes on its first point, and an ellipse is
   eight quadratic arcs. Shift snaps lines to 45° and makes rectangles square
   and ellipses round. The format is unchanged for them.
2. **Text.** A Text tool places one single-line label. The format gains one
   element, `<text>`, with exactly `x`, `y`, `font-size` (8-96), `fill` (the
   existing ink rule), and `font-family="sans-serif"`, and plain content of
   1-200 characters without `<`, `>`, `&`, control, or format characters, and
   without surrounding spaces. Non-ASCII may appear only as label content;
   every attribute still passes a strict ASCII pattern. Preview re-creates the
   element from the checked values; the content becomes a text node. Older
   Charon builds show a drawing with a label as a plain code block. The
   drawing marker stays `data-charon-drawing="1"`.
3. **Image copy.** Copy image, in the drawing dialog and beside each Preview
   drawing, renders the validated drawing (re-serialized, text ink resolved to
   a fixed dark ink on white) to PNG in the webview through a `data:` image,
   and sends the bytes to `clipboard_write_drawing_image`. `ClipboardComposer`
   decodes them within bounds (8 MiB, 8,192 pixels a side) and performs one
   explicit image write. It reads no Note file or Attachment and changes no
   Note.
4. **New drawing.** The command menu's New drawing opens the same dialog;
   Insert creates a Note whose body is the drawing block, in the focused Tag.
   The dialog stays open until that Note exists: a failed creation keeps the
   strokes beside an inline error, and Insert becomes Retry. While it holds
   strokes, Quit, closing the window where closing quits, and an update
   restart ask first through the dialog's discard prompt, as an editor's
   drawing does.

## Alternatives rejected

- **Arbitrary SVG** (`rect`, `ellipse`, markers): more element types to
  whitelist for shapes that paths already express.
- **Text as vector strokes**: unreadable source and no accents without a font.
- **Copying the image through the webview clipboard API**: support differs
  between WebKit, WebKitGTK, and WebView2; the Rust write is the same on every
  platform.

## Consequences

- Search still ignores drawing source, labels included.
- `Copy as Markdown` still writes one Markdown document; the image is never
  added to it.

## Revisit when

Revisit if labels need several lines or other fonts, or if image copy is asked
for Notes rather than drawings.
