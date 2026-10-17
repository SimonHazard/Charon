import { describe, expect, it } from 'vitest';

import {
  DRAWING_SPACE,
  DRAWING_TEXT_MAX_LENGTH,
  finalizeDrawing,
  parseDrawingSvg,
  type Stroke,
  sanitizeDrawingText,
  serializeDrawing,
} from '@/features/notes/drawing/drawing-format';
import {
  type ShapeTool,
  shapeCommands,
  shapeIsTiny,
  strokeHit,
} from '@/features/notes/drawing/drawing-geometry';
import { drawingImageSize, drawingImageSvg } from '@/features/notes/drawing/drawing-image';

const shape = (tool: ShapeTool, constrain = false): Stroke => ({
  color: '#e5484d',
  width: 4,
  opacity: null,
  commands: shapeCommands(tool, { x: 100, y: 100 }, { x: 300, y: 220 }, 4, constrain),
});

const label = (content: string, size = 28): Stroke => ({
  color: 'currentColor',
  width: 1,
  opacity: null,
  commands: [],
  text: { x: 120, y: 160, size, content },
});

const textSvg = (attributes: string, content = 'Note') =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200" data-charon-drawing="1">',
    `<text ${attributes}>${content}</text>`,
    '</svg>',
  ].join('\n');
const validAttributes = 'x="10" y="40" font-size="28" fill="currentColor" font-family="sans-serif"';

describe('drawing shapes (ADR 0033)', () => {
  it.each(['line', 'arrow', 'rectangle', 'ellipse'] as const)(
    'stores a %s as an ordinary stroked path that round-trips',
    (tool) => {
      const result = finalizeDrawing([shape(tool)]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(parseDrawingSvg(serializeDrawing(result.drawing))).toEqual(result.drawing);
      expect(serializeDrawing(result.drawing)).not.toContain('<text');
    },
  );

  it('draws an arrow as its shaft plus a two-segment head', () => {
    const commands = shapeCommands('arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(commands.map((command) => command.op)).toEqual(['M', 'L', 'M', 'L', 'L']);
    expect(commands[1]).toEqual({ op: 'L', x: 100, y: 0 });
    expect(commands[3]).toEqual({ op: 'L', x: 100, y: 0 });
  });

  it('closes rectangles and ellipses, and Shift makes them square and round', () => {
    const rectangle = shapeCommands('rectangle', { x: 0, y: 0 }, { x: 80, y: 40 }, 2, true);
    expect(rectangle.at(-1)).toEqual({ op: 'L', x: 0, y: 0 });
    expect(rectangle[2]).toEqual({ op: 'L', x: 80, y: 80 });
    const ellipse = shapeCommands('ellipse', { x: 0, y: 0 }, { x: 100, y: 40 }, 2);
    expect(ellipse).toHaveLength(9);
    expect(ellipse[0]).toEqual({ op: 'M', x: 100, y: 20 });
    expect(ellipse.at(-1)).toMatchObject({ op: 'Q', x: 100, y: 20 });
  });

  it('snaps a constrained line to 45 degree steps', () => {
    const [, end] = shapeCommands('line', { x: 0, y: 0 }, { x: 100, y: 10 }, 2, true);
    expect(end).toMatchObject({ op: 'L', y: 0 });
  });

  it('ignores a shape too small to be intended', () => {
    expect(shapeIsTiny({ x: 0, y: 0 }, { x: 1, y: 2 })).toBe(true);
    expect(shapeIsTiny({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(false);
  });
});

describe('drawing labels (ADR 0033)', () => {
  it('serializes a label as one text element and parses it back, accents included', () => {
    const result = finalizeDrawing([shape('line'), label('Résumé de l’API')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const source = serializeDrawing(result.drawing);
    expect(source).toContain(
      '<text x="120" y="160" font-size="28" fill="currentColor" font-family="sans-serif">Résumé de l’API</text>',
    );
    expect(parseDrawingSvg(source)).toEqual(result.drawing);
  });

  it('accepts exactly the label whitelist', () => {
    expect(parseDrawingSvg(textSvg(validAttributes))?.strokes[0]?.text).toEqual({
      x: 10,
      y: 40,
      size: 28,
      content: 'Note',
    });
    for (const [attributes, content] of [
      [validAttributes, '<b>bold</b>'],
      [validAttributes, 'a &amp; b'],
      [validAttributes, 'tab\there'],
      [validAttributes, ' padded'],
      [validAttributes, ''],
      [validAttributes, 'x'.repeat(DRAWING_TEXT_MAX_LENGTH + 1)],
      [validAttributes.replace('sans-serif', 'serif'), 'Note'],
      [validAttributes.replace(' font-family="sans-serif"', ''), 'Note'],
      [`${validAttributes} onclick="x"`, 'Note'],
      [validAttributes.replace('28', '200'), 'Note'],
      [validAttributes.replace('currentColor', 'url(#x)'), 'Note'],
    ] as const) {
      expect(parseDrawingSvg(textSvg(attributes, content)), `${attributes} ${content}`).toBeNull();
    }
    // Non-ASCII is label content only: never in an attribute.
    expect(
      parseDrawingSvg(textSvg(validAttributes.replace('sans-serif', 'sans-sérif'))),
    ).toBeNull();
  });

  it('makes typed text storable', () => {
    expect(sanitizeDrawingText('  <b>Hi</b> & bye\n\tnow  ')).toBe('b Hi /b bye now');
    expect(sanitizeDrawingText('\u0007')).toBe('');
    expect([...sanitizeDrawingText('é'.repeat(300))]).toHaveLength(DRAWING_TEXT_MAX_LENGTH);
  });

  it('erases a label when the eraser crosses its box', () => {
    const text = label('Hello');
    expect(strokeHit(text, { x: 125, y: 150 }, { x: 126, y: 151 })).toBe(true);
    expect(strokeHit(text, { x: 100, y: 100 }, { x: 260, y: 200 })).toBe(true);
    expect(strokeHit(text, { x: 400, y: 400 }, { x: 420, y: 420 })).toBe(false);
  });
});

describe('drawing image copy (ADR 0033)', () => {
  it('renders validated values with fixed ink on a white sheet', () => {
    const result = finalizeDrawing([shape('rectangle'), label('Plan')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = drawingImageSvg(result.drawing);
    expect(svg).not.toContain('currentColor');
    expect(svg).not.toContain('data-charon-drawing');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#241523" font-family="sans-serif">Plan</text>');
    expect(svg).toContain('stroke="#e5484d"');
  });

  it('renders at twice the drawing size, capped at 4,096 pixels', () => {
    expect(
      drawingImageSize({ viewBox: { x: 0, y: 0, width: 300, height: 100 }, strokes: [] }),
    ).toEqual({ width: 600, height: 200 });
    expect(
      drawingImageSize({ viewBox: { ...DRAWING_SPACE, width: 4096, height: 1024 }, strokes: [] }),
    ).toEqual({ width: 4096, height: 1024 });
  });
});
