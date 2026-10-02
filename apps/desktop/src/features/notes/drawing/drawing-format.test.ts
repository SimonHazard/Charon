import { describe, expect, it } from 'vitest';

import {
  applyDrawingBlock,
  DRAWING_MAX_BLOCK_BYTES,
  DRAWING_MAX_NUMBERS_PER_PATH,
  DRAWING_MAX_PATHS,
  DRAWING_SPACE,
  type Drawing,
  drawingInks,
  drawingKey,
  drawingWidths,
  finalizeDrawing,
  findDrawingBlocks,
  formatPathData,
  insertDrawingBlock,
  parseDrawingSvg,
  parsePathData,
  replaceRange,
  type Stroke,
  serializeDrawing,
  stripDrawingBlocks,
  toDrawingBlock,
  unionBox,
  utf8Length,
} from '@/features/notes/drawing/drawing-format';

const root = (attributes = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 20 410.5 233" width="410.5" height="233" data-charon-drawing="1"${attributes}>`;
const path = (attributes = '') =>
  `<path d="M14.2 31.5Q20 33 25.1 40.2L30 41" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${attributes}/>`;
const svg = (...children: string[]) => [root(), ...children, '</svg>'].join('\n');

const stroke = (overrides: Partial<Stroke> = {}): Stroke => ({
  color: 'currentColor',
  width: 4,
  opacity: null,
  commands: [
    { op: 'M', x: 100, y: 100 },
    { op: 'Q', cx: 120, cy: 110, x: 130.5, y: 120.2 },
    { op: 'L', x: 140, y: 130 },
  ],
  ...overrides,
});

const drawing: Drawing = {
  viewBox: { x: 12, y: 20, width: 410.5, height: 233 },
  strokes: [
    stroke(),
    stroke({
      color: '#8f8be8',
      width: 8,
      commands: [
        { op: 'M', x: 5, y: 6 },
        { op: 'L', x: 5, y: 6 },
      ],
    }),
  ],
};

describe('drawing format v1', () => {
  it('serializes the documented shape and round-trips byte-exactly', () => {
    const text = serializeDrawing(drawing);
    expect(text.split('\n')).toEqual([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 20 410.5 233" width="410.5" height="233" data-charon-drawing="1">',
      '<path d="M100 100Q120 110 130.5 120.2L140 130" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M5 6L5 6" fill="none" stroke="#8f8be8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>',
    ]);
    const parsed = parseDrawingSvg(text);
    expect(parsed).toEqual(drawing);
    expect(parsed && serializeDrawing(parsed)).toBe(text);
    expect(toDrawingBlock(drawing)).toBe(`\`\`\`svg\n${text}\n\`\`\``);
  });

  it('keeps the ink palette and widths as stored content data', () => {
    expect(drawingInks.map((ink) => ink.value)).toEqual([
      'currentColor',
      '#8f8be8',
      '#e5484d',
      '#3e63dd',
      '#30a46c',
    ]);
    expect(drawingWidths.map((width) => width.value)).toEqual([2, 4, 8]);
    expect(DRAWING_SPACE).toEqual({ x: 0, y: 0, width: 960, height: 600 });
  });

  it('accepts free attribute order, single quotes, opacity, and whitespace between elements', () => {
    const reordered = [
      `<svg data-charon-drawing='1' height="233" width="410.5" viewBox="12,20,410.5,233" xmlns="http://www.w3.org/2000/svg" >`,
      '  ',
      `<path stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.5" stroke-width="0.5" stroke="#e5484d" fill="none" d="M 1 2 3 4 L5,6 Q 7 8 9 10" />`,
      '</svg >\n',
    ].join('\r\n');
    const parsed = parseDrawingSvg(reordered);
    expect(parsed?.strokes[0]).toEqual({
      color: '#e5484d',
      width: 0.5,
      opacity: 0.5,
      commands: [
        { op: 'M', x: 1, y: 2 },
        { op: 'L', x: 3, y: 4 },
        { op: 'L', x: 5, y: 6 },
        { op: 'Q', cx: 7, cy: 8, x: 9, y: 10 },
      ],
    });
    expect(parseDrawingSvg(svg())).toEqual({ viewBox: drawing.viewBox, strokes: [] });
  });

  it.each([
    ['a script element', svg('<script>alert(1)</script>')],
    [
      'an event attribute on the root',
      svg().replace('data-charon-drawing="1"', 'data-charon-drawing="1" onload="alert(1)"'),
    ],
    ['an event attribute on a path', svg(path(' onclick="alert(1)"'))],
    ['an href', svg(path(' href="https://example.com"'))],
    ['an xlink:href', svg(path(' xlink:href="#a"'))],
    ['a style attribute', svg(path(' style="fill:red"'))],
    ['a class attribute', svg(path(' class="x"'))],
    ['an image element', svg('<image href="https://example.com/a.png"/>')],
    ['a foreignObject element', svg('<foreignObject><div>x</div></foreignObject>')],
    ['a use element', svg('<use href="#a"/>')],
    ['a nested svg', svg(root(), '</svg>')],
    ['a group', svg('<g>', path(), '</g>')],
    ['a DOCTYPE entity declaration', `<!DOCTYPE svg [<!ENTITY x "y">]>\n${svg(path())}`],
    ['an entity reference', svg(path()).replace('currentColor', '&x;')],
    ['a numeric character reference', svg(path()).replace('round"/>', 'round"/>&#60;')],
    ['an XML declaration', `<?xml version="1.0"?>\n${svg(path())}`],
    ['a comment', svg('<!-- note -->', path())],
    ['CDATA', svg('<![CDATA[x]]>')],
    ['text content', svg('hello', path())],
    ['a non-self-closing path', svg(path().replace('/>', '></path>'))],
    ['trailing content', `${svg(path())}\n<p>x</p>`],
    ['a self-closing root', root().replace('>', '/>')],
    ['a missing closing tag', [root(), path()].join('\n')],
    ['a missing marker', svg(path()).replace(' data-charon-drawing="1"', '')],
    [
      'a wrong marker value',
      svg(path()).replace('data-charon-drawing="1"', 'data-charon-drawing="2"'),
    ],
    ['a wrong namespace', svg(path()).replace('2000/svg', '1999/xhtml')],
    [
      'an extra root attribute',
      svg(path()).replace('data-charon-drawing="1"', 'data-charon-drawing="1" id="a"'),
    ],
    ['a duplicated attribute', svg(path(' fill="none"'))],
    ['a width that differs from the viewBox', svg(path()).replace('width="410.5"', 'width="400"')],
    ['a zero-sized viewBox', svg(path()).replace('410.5 233"', '0 233"')],
    [
      'an oversized viewBox',
      svg(path()).replace('410.5 233" width="410.5"', '4097 233" width="4097"'),
    ],
    ['a NaN coordinate', svg(path().replace('M14.2', 'MNaN'))],
    ['an Infinity coordinate', svg(path().replace('M14.2', 'MInfinity'))],
    ['an exponent', svg(path().replace('M14.2', 'M1e3'))],
    ['a NaN viewBox', svg(path()).replace('viewBox="12', 'viewBox="NaN')],
    ['a relative command', svg(path().replace('L30 41', 'l30 41'))],
    ['an arc command', svg(path().replace('L30 41', 'A1 1 0 0 1 2 2'))],
    ['a cubic command', svg(path().replace('L30 41', 'C1 2 3 4 5 6'))],
    ['a close-path command', svg(path().replace('L30 41', 'Z'))],
    ['an incomplete coordinate group', svg(path().replace('L30 41', 'L30'))],
    ['a path not starting with M', svg(path().replace('M14.2 31.5', 'L14.2 31.5'))],
    ['a filled path', svg(path().replace('fill="none"', 'fill="red"'))],
    ['a named colour', svg(path().replace('currentColor', 'red'))],
    ['an uppercase hex colour', svg(path().replace('currentColor', '#AABBCC'))],
    ['a url() paint', svg(path().replace('currentColor', 'url(#g)'))],
    ['a width below 0.5', svg(path().replace('stroke-width="3"', 'stroke-width="0.4"'))],
    ['a width above 48', svg(path().replace('stroke-width="3"', 'stroke-width="49"'))],
    ['an opacity above 1', svg(path(' stroke-opacity="1.5"'))],
    ['a square cap', svg(path().replace('linecap="round"', 'linecap="square"'))],
    ['a missing stroke width', svg(path().replace(' stroke-width="3"', ''))],
    ['non-ASCII content', svg(path()).replace('currentColor', 'currentColör')],
  ])('rejects %s', (_name, source) => {
    expect(parseDrawingSvg(source)).toBeNull();
  });

  it('rejects oversized input, too many paths, and too many numbers in one path', () => {
    expect(parseDrawingSvg(`${svg(path())}${' '.repeat(DRAWING_MAX_BLOCK_BYTES)}`)).toBeNull();
    const manyPaths = Array.from(
      { length: DRAWING_MAX_PATHS + 1 },
      () =>
        '<path d="M1 1L1 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    );
    expect(parseDrawingSvg(svg(...manyPaths))).toBeNull();
    expect(parseDrawingSvg(svg(...manyPaths.slice(1)))?.strokes).toHaveLength(DRAWING_MAX_PATHS);
    const longData = `M0 0${'L1 1'.repeat(DRAWING_MAX_NUMBERS_PER_PATH / 2)}`;
    expect(parsePathData(longData)).toBeNull();
    expect(
      parsePathData(`M0 0${'L1 1'.repeat(DRAWING_MAX_NUMBERS_PER_PATH / 2 - 1)}`),
    ).not.toBeNull();
  });

  it('formats path numbers with one decimal and no negative zero', () => {
    expect(
      formatPathData([
        { op: 'M', x: -0.04, y: 12.25 },
        { op: 'L', x: -12.5, y: 3 },
      ]),
    ).toBe('M0 12.3L-12.5 3');
    expect(parsePathData('M-12.5-3L.5 1')).toEqual([
      { op: 'M', x: -12.5, y: -3 },
      { op: 'L', x: 0.5, y: 1 },
    ]);
  });
});

describe('finalizing a drawing', () => {
  it('crops the viewBox to the strokes plus padding and half the stroke width', () => {
    const result = finalizeDrawing([
      stroke({
        width: 4,
        commands: [
          { op: 'M', x: 100, y: 200 },
          { op: 'L', x: 300, y: 250 },
        ],
      }),
    ]);
    expect(result.ok && result.drawing.viewBox).toEqual({ x: 82, y: 182, width: 236, height: 86 });
    expect(result.ok && parseDrawingSvg(result.block.slice(7, -4))).toEqual(
      result.ok ? result.drawing : null,
    );
  });

  it('clamps the crop to the logical space and handles a single dot', () => {
    const result = finalizeDrawing([
      stroke({
        width: 2,
        commands: [
          { op: 'M', x: 0, y: 600 },
          { op: 'L', x: 0, y: 600 },
        ],
      }),
    ]);
    expect(result.ok && result.drawing.viewBox).toEqual({ x: 0, y: 583, width: 17, height: 17 });
  });

  it('refuses empty and oversized drawings', () => {
    expect(finalizeDrawing([])).toEqual({ ok: false, reason: 'empty' });
    const commands = Array.from({ length: 4_000 }, (_, index) => ({
      op: 'L' as const,
      x: 100 + (index % 700) + 0.1,
      y: 100 + (index % 400) + 0.1,
    }));
    const heavy = Array.from({ length: 6 }, () =>
      stroke({ commands: [{ op: 'M', x: 1, y: 1 }, ...commands] }),
    );
    expect(utf8Length(toDrawingBlock({ viewBox: DRAWING_SPACE, strokes: heavy }))).toBeGreaterThan(
      DRAWING_MAX_BLOCK_BYTES,
    );
    expect(finalizeDrawing(heavy)).toEqual({ ok: false, reason: 'too-large' });
    expect(finalizeDrawing(Array.from({ length: DRAWING_MAX_PATHS + 1 }, () => stroke()))).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('unions the logical space with an edited drawing viewBox', () => {
    expect(unionBox(DRAWING_SPACE, { x: -10, y: 500, width: 100, height: 200 })).toEqual({
      x: -10,
      y: 0,
      width: 970,
      height: 700,
    });
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4);
  });
});

describe('drawing blocks in Markdown', () => {
  const block = toDrawingBlock(drawing);

  it('finds closed, tilde, indented, CRLF, and final unclosed svg fences', () => {
    const lines = serializeDrawing(drawing).split('\n');
    const body = [
      '# Title',
      '',
      ...block.split('\n'),
      '',
      '~~~~ svg ',
      ...lines,
      '~~~~',
      '',
      '  ```svg',
      ...lines.map((line) => `  ${line}`),
      '  ```',
      '',
      '```svg',
      ...lines,
    ].join('\r\n');
    const blocks = findDrawingBlocks(body);
    expect(blocks).toHaveLength(4);
    for (const found of blocks) expect(found.drawing).toEqual(drawing);
    expect(body.slice(blocks[0]?.start, blocks[0]?.end)).toBe(block.replaceAll('\n', '\r\n'));
    expect(blocks[3]?.end).toBe(body.length);
  });

  it('ignores invalid svg blocks, other languages, and fences nested in other fences', () => {
    const body = [
      '````markdown',
      block,
      '````',
      '',
      '```svg title="x"',
      serializeDrawing(drawing),
      '```',
      '',
      '```SVG',
      serializeDrawing(drawing),
      '```',
      '',
      '```svg',
      '<svg data-charon-drawing="1"><script/></svg>',
      '```',
      '',
      '    ```svg',
    ].join('\n');
    expect(findDrawingBlocks(body)).toEqual([]);
  });

  it('strips drawing blocks for headlines and search', () => {
    const body = `# Plan\n\n${block}\n\nAfter`;
    expect(stripDrawingBlocks(body, 'Drawing')).toBe('# Plan\n\nDrawing\n\nAfter');
    expect(stripDrawingBlocks(body, '')).toBe('# Plan\n\n\n\nAfter');
    expect(stripDrawingBlocks('No drawing', 'Drawing')).toBe('No drawing');
  });

  it('inserts on its own lines with blank lines only where needed', () => {
    expect(insertDrawingBlock('', 0, 'B').body).toBe('B');
    expect(insertDrawingBlock('Hello world', 5, 'B').body).toBe('Hello world\n\nB');
    expect(insertDrawingBlock('One\nTwo', 4, 'B').body).toBe('One\n\nB\n\nTwo');
    expect(insertDrawingBlock('One\n\nTwo', 4, 'B').body).toBe('One\n\nB\n\nTwo');
    expect(insertDrawingBlock('One\n\n\nTwo', 5, 'B').body).toBe('One\n\nB\n\nTwo');
    expect(insertDrawingBlock('One\n', 4, 'B').body).toBe('One\n\nB');
    expect(insertDrawingBlock('One', 0, 'B').body).toBe('B\n\nOne');
    expect(insertDrawingBlock('One', 99, 'B')).toEqual({ body: 'One\n\nB', start: 5, end: 6 });
    const fenced = '```js\nconst a = 1;\n```\nAfter';
    expect(insertDrawingBlock(fenced, 8, 'B').body).toBe('```js\nconst a = 1;\n```\n\nB\n\nAfter');
  });

  it('inserts before a fence that is never closed, never inside it', () => {
    const unclosed = 'Intro\n\n```js\nconst a = 1;';
    // Preview has no caret, so it inserts at the end of the body.
    expect(insertDrawingBlock(unclosed, unclosed.length, 'B')).toEqual({
      body: 'Intro\n\nB\n\n```js\nconst a = 1;',
      start: 7,
      end: 8,
    });
    expect(insertDrawingBlock(unclosed, unclosed.indexOf('const'), 'B').body).toBe(
      'Intro\n\nB\n\n```js\nconst a = 1;',
    );
    expect(insertDrawingBlock('```js', 5, 'B').body).toBe('B\n\n```js');
    // A listed fence left open: the block goes before its list item's line.
    expect(insertDrawingBlock('Intro\n- ```js\n  code', 19, 'B').body).toBe(
      'Intro\n\nB\n\n- ```js\n  code',
    );
    // A closed fence in a list item is skipped like a top-level one.
    expect(insertDrawingBlock('- ```js\n  code\n  ```\n- next', 10, 'B').body).toBe(
      '- ```js\n  code\n  ```\n\nB\n\n- next',
    );
    expect(
      applyDrawingBlock(
        unclosed,
        { kind: 'edit', index: 0, key: 'gone', caret: unclosed.length },
        'B',
      ),
    ).toBe('Intro\n\nB\n\n```js\nconst a = 1;');
  });

  it('finds only top-level drawings and strips nested ones too', () => {
    const quoted = block
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const listed = block
      .split('\n')
      .map((line, index) => (index ? `  ${line}` : `- ${line}`))
      .join('\n');
    const body = `${quoted}\n\n${listed}\n\n${block}`;
    const blocks = findDrawingBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(body.slice(blocks[0]?.start)).toBe(block);
    expect(stripDrawingBlocks(body, 'D')).toBe('> D\n\n- D\n\nD');
  });

  it('replaces exactly the targeted block and falls back to inserting', () => {
    const other: Drawing = { ...drawing, strokes: [stroke({ color: '#30a46c' })] };
    const body = `A\n\n${block}\n\nB\n\n${toDrawingBlock(other)}\n\nC`;
    const replacement = toDrawingBlock({ ...drawing, strokes: [stroke({ width: 2 })] });
    const second = { kind: 'edit', index: 1, key: drawingKey(other), caret: 0 } as const;
    expect(applyDrawingBlock(body, second, replacement)).toBe(
      `A\n\n${block}\n\nB\n\n${replacement}\n\nC`,
    );
    // Index drift: the same drawing is still found by its canonical key.
    expect(applyDrawingBlock(body, { ...second, index: 0 }, replacement)).toBe(
      `A\n\n${block}\n\nB\n\n${replacement}\n\nC`,
    );
    // The target disappeared: insert rather than replace anything else.
    const missing = { ...second, key: 'gone' };
    expect(applyDrawingBlock('A', missing, replacement)).toBe(`${replacement}\n\nA`);
    expect(applyDrawingBlock('A', { kind: 'new', caret: 1 }, replacement)).toBe(
      `A\n\n${replacement}`,
    );
    expect(replaceRange('abcdef', 1, 3, 'X')).toBe('aXdef');
  });
});
