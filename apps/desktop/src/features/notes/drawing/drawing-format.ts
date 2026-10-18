/**
 * Inline Markdown drawings (format v1, ADR 0021 as amended by ADR 0033).
 *
 * A drawing is ordinary Note text: one fenced ```svg block holding a small
 * SVG document that Charon generated and marked `data-charon-drawing="1"`.
 * Pen strokes and shapes (lines, arrows, rectangles, ellipses) are stroked
 * `<path>` elements; a label is one `<text>` element with plain content.
 * Parsing is a strict whitelist over a hand-written tokenizer. Nothing parsed
 * here is ever handed to the DOM: callers re-create elements from the
 * validated numbers, enumerated strings, and checked text returned by
 * `parseDrawingSvg`.
 */

import { scanFences } from '@/features/notes/drawing/markdown-fences';

export type Box = { x: number; y: number; width: number; height: number };

export type PathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number };

/** A text label: its baseline start, font size, and plain single-line content. */
export type DrawingText = { x: number; y: number; size: number; content: string };

/** One mark: a stroked path, or a text label (`text` set, no path commands). */
export type Stroke = {
  color: string;
  width: number;
  opacity: number | null;
  commands: readonly PathCommand[];
  text?: DrawingText;
};

export type Drawing = { viewBox: Box; strokes: readonly Stroke[] };

export type DrawingBlock = {
  /** Offset of the opening fence line. */
  start: number;
  /** Offset just past the closing fence line (its line break excluded). */
  end: number;
  /** The SVG text between the fences. */
  source: string;
  drawing: Drawing;
};

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const DRAWING_MARKER = 'data-charon-drawing';
/** Logical canvas space that pointer input is mapped into. */
export const DRAWING_SPACE: Box = { x: 0, y: 0, width: 960, height: 600 };
export const DRAWING_MAX_PATHS = 2_000;
export const DRAWING_MAX_NUMBERS_PER_PATH = 20_000;
export const DRAWING_MAX_BLOCK_BYTES = 256 * 1024;
export const DRAWING_MAX_VIEWBOX_SIZE = 4_096;
export const DRAWING_PADDING = 16;
export const DRAWING_MIN_WIDTH = 0.5;
export const DRAWING_MAX_WIDTH = 48;
export const DRAWING_TEXT_MAX_LENGTH = 200;
export const DRAWING_TEXT_MIN_SIZE = 8;
export const DRAWING_TEXT_MAX_SIZE = 96;
/** The one font family a label names, so a copied image renders it like Preview. */
export const DRAWING_TEXT_FONT = 'sans-serif';

/** Stored ink data. These literals are content, never UI styling. */
export const drawingInks = [
  { id: 'text', value: 'currentColor' },
  { id: 'lavender', value: '#8f8be8' },
  { id: 'red', value: '#e5484d' },
  { id: 'blue', value: '#3e63dd' },
  { id: 'green', value: '#30a46c' },
] as const;
export type DrawingInk = (typeof drawingInks)[number]['id'];

export const drawingWidths = [
  { id: 'thin', value: 2 },
  { id: 'medium', value: 4 },
  { id: 'bold', value: 8 },
] as const;
export type DrawingWidth = (typeof drawingWidths)[number]['id'];

/** Label sizes that match the three widths. */
export const drawingTextSizes: Record<DrawingWidth, number> = { thin: 20, medium: 28, bold: 44 };

const numberPattern = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u;
const colorPattern = /^#[0-9a-f]{6}$/u;
const pathToken = /([MLQ])|(-?(?:\d+(?:\.\d+)?|\.\d+))|([\s,]+)/uy;
const attributeName = /[A-Za-z][A-Za-z0-9-]*/uy;
const whitespace = /[ \t\r\n]/u;
// XML whitespace plus printable characters: no entity (`&`), no control. Non-ASCII text can only
// pass as label content; every attribute and path value is checked by a strict ASCII pattern.
const allowedCharacters =
  /^[\t\n\r\x20-\x25\x27-\x7e\u00a0-\ud7ff\ue000-\ufffc\u{10000}-\u{10ffff}]*$/u;
// One line of printable text without markup characters.
const textContentPattern = /^[^\p{Cc}\p{Cf}<>&]+$/u;

const rootAttributes = ['xmlns', 'viewBox', 'width', 'height', DRAWING_MARKER] as const;
const pathAttributes = new Set([
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
]);
const textAttributes = ['x', 'y', 'font-size', 'fill', 'font-family'] as const;
const commandArity = { M: 2, L: 2, Q: 4 } as const;

export function roundCoordinate(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumber(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function parseNumber(value: string): number | null {
  if (!numberPattern.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Path data

export function parsePathData(data: string): PathCommand[] | null {
  const commands: PathCommand[] = [];
  let op: keyof typeof commandArity | null = null;
  let pending: number[] = [];
  let numbers = 0;
  let sawGroup = false;
  pathToken.lastIndex = 0;
  while (pathToken.lastIndex < data.length) {
    const start = pathToken.lastIndex;
    const match = pathToken.exec(data);
    if (!match || match.index !== start) return null;
    const [, letter, value] = match;
    if (letter) {
      if (pending.length || (op && !sawGroup)) return null;
      if (!op && letter !== 'M') return null;
      op = letter as keyof typeof commandArity;
      sawGroup = false;
    } else if (value !== undefined) {
      if (!op) return null;
      numbers += 1;
      if (numbers > DRAWING_MAX_NUMBERS_PER_PATH) return null;
      const parsed = parseNumber(value);
      if (parsed === null) return null;
      pending.push(parsed);
      if (pending.length === commandArity[op]) {
        const [a = 0, b = 0, c = 0, d = 0] = pending;
        // SVG treats extra pairs after a moveto as implicit linetos.
        const effective = op === 'M' && sawGroup ? 'L' : op;
        commands.push(
          effective === 'Q' ? { op: 'Q', cx: a, cy: b, x: c, y: d } : { op: effective, x: a, y: b },
        );
        pending = [];
        sawGroup = true;
      }
    }
  }
  if (!op || pending.length || !sawGroup) return null;
  return commands;
}

export function formatPathData(commands: readonly PathCommand[]): string {
  let data = '';
  for (const command of commands) {
    data +=
      command.op === 'Q'
        ? `Q${formatNumber(command.cx)} ${formatNumber(command.cy)} ${formatNumber(command.x)} ${formatNumber(command.y)}`
        : `${command.op}${formatNumber(command.x)} ${formatNumber(command.y)}`;
  }
  return data;
}

const pathDataCache = new WeakMap<Stroke, string>();

export function strokePathData(stroke: Stroke): string {
  let data = pathDataCache.get(stroke);
  if (data === undefined) {
    data = formatPathData(stroke.commands);
    pathDataCache.set(stroke, data);
  }
  return data;
}

/** Plain label text a user typed, made storable: one line, no markup or control characters. */
export function sanitizeDrawingText(value: string): string {
  return [
    ...value
      .replace(/[\p{Cc}\p{Cf}<>&]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  ]
    .slice(0, DRAWING_TEXT_MAX_LENGTH)
    .join('')
    .trim();
}

/** An estimate of a label's box from its size and length; no font is measured. */
export function textBox(text: DrawingText): Box {
  const width = Math.max(text.size * 0.6, [...text.content].length * text.size * 0.56);
  return { x: text.x, y: text.y - text.size * 0.82, width, height: text.size * 1.04 };
}

/** Every coordinate pair in order: endpoints and quadratic control points, or a label's box. */
export function strokeCoordinates(stroke: Stroke): number[] {
  if (stroke.text) {
    const { x, y, width, height } = textBox(stroke.text);
    return [x, y, x + width, y, x + width, y + height, x, y + height, x, y];
  }
  const values: number[] = [];
  for (const command of stroke.commands) {
    if (command.op === 'Q') values.push(command.cx, command.cy, command.x, command.y);
    else values.push(command.x, command.y);
  }
  return values;
}

function countNumbers(stroke: Stroke): number {
  if (stroke.text) return 3;
  return stroke.commands.reduce((total, command) => total + (command.op === 'Q' ? 4 : 2), 0);
}

// ---------------------------------------------------------------------------
// SVG document

type ParsedElement = {
  name: 'svg' | 'path' | 'text';
  attributes: Map<string, string>;
  selfClosing: boolean;
};

class Cursor {
  index = 0;
  constructor(readonly text: string) {}

  skipWhitespace(): number {
    const start = this.index;
    while (this.index < this.text.length && whitespace.test(this.text[this.index] ?? '')) {
      this.index += 1;
    }
    return this.index - start;
  }

  consume(literal: string): boolean {
    if (!this.text.startsWith(literal, this.index)) return false;
    this.index += literal.length;
    return true;
  }

  get done(): boolean {
    return this.index >= this.text.length;
  }
}

function readElement(cursor: Cursor, name: ParsedElement['name']): ParsedElement | null {
  if (!cursor.consume(`<${name}`)) return null;
  const attributes = new Map<string, string>();
  for (;;) {
    const spaced = cursor.skipWhitespace() > 0;
    if (cursor.consume('/>')) return { name, attributes, selfClosing: true };
    if (cursor.consume('>')) return { name, attributes, selfClosing: false };
    if (!spaced) return null;
    attributeName.lastIndex = cursor.index;
    const match = attributeName.exec(cursor.text);
    if (!match || match.index !== cursor.index) return null;
    const key = match[0];
    cursor.index += key.length;
    cursor.skipWhitespace();
    if (!cursor.consume('=')) return null;
    cursor.skipWhitespace();
    const quote = cursor.text[cursor.index];
    if (quote !== '"' && quote !== "'") return null;
    const close = cursor.text.indexOf(quote, cursor.index + 1);
    if (close < 0) return null;
    const value = cursor.text.slice(cursor.index + 1, close);
    if (value.includes('<') || attributes.has(key)) return null;
    attributes.set(key, value);
    cursor.index = close + 1;
  }
}

function parseViewBox(value: string): Box | null {
  const parts = value.trim().split(/[\s,]+/u);
  if (parts.length !== 4) return null;
  const [x, y, width, height] = parts.map(parseNumber);
  if (x == null || y == null || width == null || height == null) return null;
  if (width <= 0 || height <= 0) return null;
  if (width > DRAWING_MAX_VIEWBOX_SIZE || height > DRAWING_MAX_VIEWBOX_SIZE) return null;
  return { x, y, width, height };
}

function parseRoot(attributes: Map<string, string>): Box | null {
  if (attributes.size !== rootAttributes.length) return null;
  if (!rootAttributes.every((name) => attributes.has(name))) return null;
  if (attributes.get('xmlns') !== SVG_NAMESPACE) return null;
  if (attributes.get(DRAWING_MARKER) !== '1') return null;
  const viewBox = parseViewBox(attributes.get('viewBox') ?? '');
  if (!viewBox) return null;
  if (parseNumber(attributes.get('width') ?? '') !== viewBox.width) return null;
  if (parseNumber(attributes.get('height') ?? '') !== viewBox.height) return null;
  return viewBox;
}

function parseStroke(attributes: Map<string, string>): Stroke | null {
  for (const name of attributes.keys()) if (!pathAttributes.has(name)) return null;
  if (attributes.get('fill') !== 'none') return null;
  if (attributes.get('stroke-linecap') !== 'round') return null;
  if (attributes.get('stroke-linejoin') !== 'round') return null;
  const color = attributes.get('stroke');
  if (color !== 'currentColor' && !(color && colorPattern.test(color))) return null;
  const width = parseNumber(attributes.get('stroke-width') ?? '');
  if (width === null || width < DRAWING_MIN_WIDTH || width > DRAWING_MAX_WIDTH) return null;
  const rawOpacity = attributes.get('stroke-opacity');
  const opacity = rawOpacity === undefined ? null : parseNumber(rawOpacity);
  if (rawOpacity !== undefined && (opacity === null || opacity < 0 || opacity > 1)) return null;
  const commands = parsePathData(attributes.get('d') ?? '');
  if (!commands) return null;
  return { color, width, opacity, commands };
}

function parseText(attributes: Map<string, string>, content: string): Stroke | null {
  if (attributes.size !== textAttributes.length) return null;
  if (!textAttributes.every((name) => attributes.has(name))) return null;
  if (attributes.get('font-family') !== DRAWING_TEXT_FONT) return null;
  const color = attributes.get('fill');
  if (color !== 'currentColor' && !(color && colorPattern.test(color))) return null;
  const x = parseNumber(attributes.get('x') ?? '');
  const y = parseNumber(attributes.get('y') ?? '');
  const size = parseNumber(attributes.get('font-size') ?? '');
  if (x === null || y === null || size === null) return null;
  if (size < DRAWING_TEXT_MIN_SIZE || size > DRAWING_TEXT_MAX_SIZE) return null;
  if (!textContentPattern.test(content) || content.trim() !== content) return null;
  if ([...content].length > DRAWING_TEXT_MAX_LENGTH) return null;
  return { color, width: 1, opacity: null, commands: [], text: { x, y, size, content } };
}

/** Returns a validated drawing, or null for anything outside format v1. */
export function parseDrawingSvg(source: string): Drawing | null {
  if (source.length > DRAWING_MAX_BLOCK_BYTES || !allowedCharacters.test(source)) return null;
  const cursor = new Cursor(source);
  cursor.skipWhitespace();
  const root = readElement(cursor, 'svg');
  if (!root || root.selfClosing) return null;
  const viewBox = parseRoot(root.attributes);
  if (!viewBox) return null;
  const strokes: Stroke[] = [];
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.consume('</svg')) {
      cursor.skipWhitespace();
      if (!cursor.consume('>')) return null;
      cursor.skipWhitespace();
      return cursor.done ? { viewBox, strokes } : null;
    }
    if (/^<text[\s>]/u.test(source.slice(cursor.index, cursor.index + 6))) {
      const element = readElement(cursor, 'text');
      if (!element || element.selfClosing) return null;
      const close = source.indexOf('</text>', cursor.index);
      if (close < 0) return null;
      const label = parseText(element.attributes, source.slice(cursor.index, close));
      cursor.index = close + '</text>'.length;
      if (!label || strokes.length >= DRAWING_MAX_PATHS) return null;
      strokes.push(label);
      continue;
    }
    if (!/^<path[\s/]/u.test(source.slice(cursor.index, cursor.index + 6))) return null;
    const path = readElement(cursor, 'path');
    if (!path?.selfClosing) return null;
    const stroke = parseStroke(path.attributes);
    if (!stroke || strokes.length >= DRAWING_MAX_PATHS) return null;
    strokes.push(stroke);
  }
}

export function serializeDrawing(drawing: Drawing): string {
  const { x, y, width, height } = drawing.viewBox;
  const w = formatNumber(width);
  const h = formatNumber(height);
  const lines = [
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="${formatNumber(x)} ${formatNumber(y)} ${w} ${h}" width="${w}" height="${h}" ${DRAWING_MARKER}="1">`,
  ];
  for (const stroke of drawing.strokes) {
    if (stroke.text) {
      const { x, y, size, content } = stroke.text;
      lines.push(
        `<text x="${formatNumber(x)}" y="${formatNumber(y)}" font-size="${formatNumber(size)}" fill="${stroke.color}" font-family="${DRAWING_TEXT_FONT}">${content}</text>`,
      );
      continue;
    }
    const opacity =
      stroke.opacity === null ? '' : ` stroke-opacity="${formatNumber(stroke.opacity, 2)}"`;
    lines.push(
      `<path d="${strokePathData(stroke)}" fill="none" stroke="${stroke.color}" stroke-width="${formatNumber(stroke.width)}"${opacity} stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  lines.push('</svg>');
  return lines.join('\n');
}

export function toDrawingBlock(drawing: Drawing): string {
  return `\`\`\`svg\n${serializeDrawing(drawing)}\n\`\`\``;
}

export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export type FinalizedDrawing =
  | { ok: true; drawing: Drawing; block: string }
  | { ok: false; reason: 'empty' | 'too-large' };

/** Crops the viewBox to the strokes and enforces every format limit. */
export function finalizeDrawing(
  strokes: readonly Stroke[],
  space: Box = DRAWING_SPACE,
): FinalizedDrawing {
  if (!strokes.length) return { ok: false, reason: 'empty' };
  if (strokes.length > DRAWING_MAX_PATHS) return { ok: false, reason: 'too-large' };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    if (countNumbers(stroke) > DRAWING_MAX_NUMBERS_PER_PATH) {
      return { ok: false, reason: 'too-large' };
    }
    const reach = stroke.width / 2 + DRAWING_PADDING;
    const values = strokeCoordinates(stroke);
    for (let index = 0; index < values.length; index += 2) {
      const px = values[index] ?? 0;
      const py = values[index + 1] ?? 0;
      minX = Math.min(minX, px - reach);
      minY = Math.min(minY, py - reach);
      maxX = Math.max(maxX, px + reach);
      maxY = Math.max(maxY, py + reach);
    }
  }
  if (!Number.isFinite(minX)) return { ok: false, reason: 'empty' };
  const left = Math.max(space.x, Math.floor(minX * 10) / 10);
  const top = Math.max(space.y, Math.floor(minY * 10) / 10);
  const right = Math.min(space.x + space.width, Math.ceil(maxX * 10) / 10);
  const bottom = Math.min(space.y + space.height, Math.ceil(maxY * 10) / 10);
  const viewBox =
    right > left && bottom > top
      ? {
          x: roundCoordinate(left),
          y: roundCoordinate(top),
          width: roundCoordinate(right - left),
          height: roundCoordinate(bottom - top),
        }
      : space;
  if (viewBox.width > DRAWING_MAX_VIEWBOX_SIZE || viewBox.height > DRAWING_MAX_VIEWBOX_SIZE) {
    return { ok: false, reason: 'too-large' };
  }
  const drawing = { viewBox, strokes };
  const block = toDrawingBlock(drawing);
  if (utf8Length(block) > DRAWING_MAX_BLOCK_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true, drawing, block };
}

// ---------------------------------------------------------------------------
// Markdown fences

function drawingBlocks(body: string, nested: boolean): DrawingBlock[] {
  if (!body.includes(DRAWING_MARKER)) return [];
  const blocks: DrawingBlock[] = [];
  for (const fence of scanFences(body)) {
    if (fence.info !== 'svg' || (fence.nested && !nested)) continue;
    const source = fence.lines.join('\n');
    const drawing = parseDrawingSvg(source);
    if (drawing) blocks.push({ start: fence.start, end: fence.end, source, drawing });
  }
  return blocks;
}

/**
 * Top-level fenced ```svg blocks that parse as Charon drawings, in document
 * order: exactly the drawings Preview renders outside quotes, lists, and
 * footnotes, which are the only ones Charon edits or replaces.
 */
export function findDrawingBlocks(body: string): DrawingBlock[] {
  return drawingBlocks(body, false);
}

/**
 * The drawing a Note copies as an image instead of Markdown (ADR 0035): a body
 * that is exactly one top-level drawing block, with no Attachment whose path
 * the image would drop.
 */
export function imageCopyDrawing(note: {
  body: string;
  attachments: readonly unknown[];
}): Drawing | null {
  if (note.attachments.length) return null;
  const blocks = findDrawingBlocks(note.body);
  const [block] = blocks;
  if (blocks.length !== 1 || !block) return null;
  const outside = note.body.slice(0, block.start) + note.body.slice(block.end);
  return outside.trim() ? null : block.drawing;
}

/**
 * Replaces each drawing block, nested ones included, with `label` (headlines)
 * or nothing (search).
 */
export function stripDrawingBlocks(body: string, label: string): string {
  const blocks = drawingBlocks(body, true);
  if (!blocks.length) return body;
  let result = '';
  let cursor = 0;
  for (const block of blocks) {
    result += body.slice(cursor, block.start) + label;
    cursor = block.end;
  }
  return result + body.slice(cursor);
}

export function replaceRange(body: string, start: number, end: number, text: string): string {
  return body.slice(0, start) + text + body.slice(end);
}

/**
 * Inserts `block` on its own lines with one blank line before and after when
 * needed. A caret inside another fence moves past it, or before it when that
 * fence is never closed (inserted after it, the block would be its content);
 * a caret inside a line moves to that line's end so no sentence is split.
 */
export function insertDrawingBlock(
  body: string,
  caret: number,
  block: string,
): { body: string; start: number; end: number } {
  let at = Math.min(Math.max(0, Math.trunc(caret) || 0), body.length);
  const fence = scanFences(body).find((candidate) => candidate.start < at && at <= candidate.end);
  if (fence) at = fence.closed ? fence.end : fence.lineStart;
  const lineStart = body.lastIndexOf('\n', at - 1) + 1;
  if (at > lineStart) {
    const lineBreak = body.indexOf('\n', at);
    at = lineBreak < 0 ? body.length : lineBreak;
    if (at > lineStart && body[at - 1] === '\r') at -= 1;
  }
  const before = body.slice(0, at);
  const after = body.slice(at);
  const prefix =
    before === '' || /(?:^|\n)[ \t]*\r?\n$/u.test(before)
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n';
  const suffix =
    after === '' || /^\r?\n[ \t]*(?:\r?\n|$)/u.test(after)
      ? ''
      : /^\r?\n/u.test(after)
        ? '\n'
        : '\n\n';
  const start = before.length + prefix.length;
  return { body: before + prefix + block + suffix + after, start, end: start + block.length };
}

export type DrawingTarget =
  | { kind: 'new'; caret: number }
  | { kind: 'edit'; index: number; key: string; caret: number };

/** Canonical identity of a drawing, used to find its block again. */
export function drawingKey(drawing: Drawing): string {
  return serializeDrawing(drawing);
}

/**
 * Replaces exactly the targeted block. Matching uses the block index and the
 * canonical drawing; if the body changed so that it no longer exists, the
 * block is inserted as new rather than replacing anything else.
 */
export function applyDrawingBlock(body: string, target: DrawingTarget, block: string): string {
  if (target.kind === 'edit') {
    const blocks = findDrawingBlocks(body);
    const indexed = blocks[target.index];
    const match =
      indexed && drawingKey(indexed.drawing) === target.key
        ? indexed
        : blocks.find((candidate) => drawingKey(candidate.drawing) === target.key);
    if (match) return replaceRange(body, match.start, match.end, block);
  }
  return insertDrawingBlock(body, target.caret, block).body;
}
