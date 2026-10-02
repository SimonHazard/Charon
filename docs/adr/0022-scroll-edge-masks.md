# ADR 0022: Scroll-edge alpha masks on the Note list

## Status

Accepted on 2026-09-23 by operator decision, after a UX review of the shelf.
Narrows the "no gradients" rule of `AGENTS.md` and `docs/UX.md`; every other
visual-language rule is unchanged.

## Context

The Note list scrolls between two solid, fixed surfaces: search above and the
composer below. A row that scrolls past either edge is cut by a hard line
through its border and text, which reads as a clipping bug rather than as "the
list continues". Charon shows no permanent scrollbar gutter, so nothing else
says that more Notes exist beyond the edge.

The visual language rejects gradients because painted gradients are
decoration: coloured backgrounds, borders, or text that add no information.
An alpha mask paints no colour. It only lowers the opacity of the content that
is already there, so the canvas shows through at the edge where content is
clipped.

## Decision

1. The "no gradients" rule rejects painted decoration. An alpha mask that fades
   scrolled content into the canvas is allowed only on the Note list's top and
   bottom scroll edges.
2. An edge fades only while content is clipped there: at rest at the top of the
   list, at its end, or for a list that fits, that edge shows no fade.
3. Each fade is at most 1rem deep (0.75rem at the top, 1rem at the bottom).
   Keyboard navigation and `scrollToIndex` keep a matching scroll padding, so
   a focused row never parks under a fade.
4. The fade is never animated. Which edges clip is read from the virtualizer
   at render; Charon adds no scroll listener and no per-frame state.
5. The mask is removed under increased contrast and reduced transparency.

## Alternatives rejected

- **A painted gradient overlay** in the canvas colour: it is decoration, must
  track each theme's canvas, and covers focus rings and text with colour.
- **A permanent scrollbar or gutter**: rejected by the UX contract; the list
  reserves no empty gutter.
- **A scroll listener toggling the fade per pixel**: rejected by `AGENTS.md`
  (no raw scroll listeners) and costs a style recalculation per frame.

## Consequences

- One mask on one scroll container. The fade may lag the very top or bottom by
  the virtualizer's scroll-reset delay, which is accepted.
- The fade depths and the virtualizer scroll padding change together.
- Any other mask, fade, or gradient (Preferences, Help, the editor, Preview,
  dialogs, the site) needs a new ADR.

## Revisit when

Revisit if a performance trace attributes long frames to the mask on a
supported platform, if WebKitGTK stutters while scrolling with it, or if the
shelf gains another scroll container that clips content against a solid
surface.
