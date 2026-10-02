/**
 * Inline Markdown drawings (format v1).
 *
 * A drawing is ordinary Note text: one fenced ```svg block holding a small
 * SVG document that Charon generated and marked `data-charon-drawing="1"`.
 * Parsing is a strict whitelist over a hand-written tokenizer. Nothing parsed
 * here is ever handed to the DOM: callers re-create elements from the
 * validated numbers and enumerated strings returned by `parseDrawingSvg`.
 */

import { scanFences } from '@/features/notes/drawing/markdown-fences';

export type Box = { x: number; y: number; width: number; height: number };

export type PathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number };

export type Stroke = {
  color: string;
  width: number;
  opacity: number | null;
  commands: readonly PathCommand[];
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

const numberPattern = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u;
const colorPattern = /^#[0-9a-f]{6}$/u;
const pathToken = /([MLQ])|(-?(?:\d+(?:\.\d+)?|\.\d+))|([\s,]+)/uy;
const attributeName = /[A-Za-z][A-Za-z0-9-]*/uy;
const whitespace = /[ \t\r\n]/u;
// Printable ASCII plus XML whitespace: no entity, no control, no non-ASCII.
const allowedCharacters = /^[\t\n\r\x20-\x25\x27-\x7e]*$/u;

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

/** Every coordinate pair in order: endpoints and quadratic control points. */
export function strokeCoordinates(stroke: Stroke): number[] {
  const values: number[] = [];
  for (const command of stroke.commands) {
    if (command.op === 'Q') values.push(command.cx, command.cy, command.x, command.y);
    else values.push(command.x, command.y);
  }
  return values;
}

function countNumbers(stroke: Stroke): number {
  return stroke.commands.reduce((total, command) => total + (command.op === 'Q' ? 4 : 2), 0);
}

// ---------------------------------------------------------------------------
// SVG document

type ParsedElement = {
  name: 'svg' | 'path';
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

function readElement(cursor: Cursor, name: 'svg' | 'path'): ParsedElement | null {
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
