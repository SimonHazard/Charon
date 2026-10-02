/**
 * Fenced code blocks located the way the Preview renderer (`@tanstack/markdown`
 * 0.0.15, front matter off, HTML off) groups lines into blocks, with offsets into
 * the raw Note body. A fence inside a blockquote, list item, or footnote is
 * `nested`: Preview renders it inside that container, where Charon never edits
 * or inserts a drawing. `markdown-fences.test.ts` checks this mirror against the
 * renderer's own parser, so a renderer upgrade that changes block grouping fails
 * there first.
 */

export type Fence = {
  /** Offset of the opening fence marker's line content. */
  start: number;
  /** Offset of the body line that holds the opening fence. */
  lineStart: number;
  /** Offset just past the closing fence line, or past the last line of an unclosed fence. */
  end: number;
  closed: boolean;
  nested: boolean;
  info: string;
  /** Content lines with the opener's indentation removed. */
  lines: string[];
};

/** A body line, or the part of one that a container leaves to its children. */
type Line = { text: string; start: number; end: number };

/** The renderer stops nesting blocks at this depth. */
const MAX_DEPTH = 64;

const fenceOpener = /^( {0,3})(`{3,}|~{3,})(.*)$/u;
const fenceCloser = /^ {0,3}(?:`+|~+)\s*$/u;
const heading = /^ {0,3}#{1,6}(?:[ \t]+.*|[ \t]*)$/u;
const thematicBreak = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/u;
const quoteMarker = /^ {0,3}>\s?(.*)$/u;
const listItem = /^(\s{0,8})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/u;
const taskItem = /^\[([ xX])\]\s+(.*)$/u;
const blockStart = /^ {0,3}(?:`{3,}|~{3,}|#{1,6}(?:\s|$)|([-*_])(?:\s*\1){2,}\s*$|>)/u;
const footnoteDefinition = /^ {0,3}\[\^([^\]\n]+)\]:[ \t]*(.*)$/u;
const footnoteContinuation = /^(?: {4,}|\t)/u;
const referenceDefinition = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(\S.*)$/u;
const destination = /^(?:<([^<>\n]*)>|([^<>\s]*?))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/u;

type Marker = {
  ordered: boolean;
  number: number;
  indent: number;
  marker: string;
  contentIndent: number;
  content: string;
};

function listMarker(text: string): Marker | null {
  const match = listItem.exec(text);
  if (!match) return null;
  const marker = match[2] ?? '';
  const ordered = /\d/u.test(marker[0] ?? '');
  return {
    ordered,
    number: ordered ? Number.parseInt(marker, 10) : 0,
    indent: match[1]?.length ?? 0,
    marker: ordered ? marker.slice(-1) : marker,
    contentIndent: (match[1]?.length ?? 0) + marker.length + (match[3]?.length ?? 1),
    content: match[4] ?? '',
  };
}

const isBlank = (text: string) => /^\s*$/u.test(text);
const leadingSpaces = (text: string) => /^ */u.exec(text)?.[0].length ?? 0;

/** The part of `line` that ends where it ends and holds `text`. */
const tail = (line: Line, text: string): Line => ({
  text,
  start: line.end - text.length,
  end: line.end,
});

function stripSpaces(line: Line, size: number): Line {
  let index = 0;
  while (index < line.text.length && index < size && line.text[index] === ' ') index += 1;
  return tail(line, line.text.slice(index));
}

function splitTableRow(value: string): string[] {
  const row = value.trim();
  const cells: string[] = [];
  let current = '';
  for (let index = row.startsWith('|') ? 1 : 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '\\' && row[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current || !row.endsWith('|') || !cells.length) cells.push(current.trim());
  return cells;
}

function looksLikeTableHeader(header: string, delimiter: string): boolean {
  if (!header.includes('|')) return false;
  const cells = splitTableRow(delimiter);
  return (
    cells.length === splitTableRow(header).length &&
    cells.every((cell) => /^:?-+:?$/u.test(cell.trim()))
  );
}

function isBlockStart(text: string, next: string | undefined): boolean {
  const marker = listMarker(text);
  return (
    blockStart.test(text) ||
    (marker !== null && (!marker.ordered || marker.number === 1)) ||
    (!!next && looksLikeTableHeader(text, next))
  );
}

function bodyLines(body: string): Line[] {
  const lines: Line[] = [];
  let cursor = body.startsWith('﻿') ? 1 : 0;
  for (;;) {
    const lineBreak = body.indexOf('\n', cursor);
    const lineEnd = lineBreak < 0 ? body.length : lineBreak;
    const end = lineEnd > cursor && body[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
    lines.push({ text: body.slice(cursor, end), start: cursor, end });
    if (lineBreak < 0) return lines;
    cursor = lineBreak + 1;
  }
}

/**
 * Takes footnote and link reference definitions out of the block flow, as the
 * renderer does before parsing blocks. Footnote bodies render in the footnote
 * list, so their lines come back as nested documents.
 */
function extractDefinitions(lines: Line[]): { flow: Line[]; footnotes: Line[][] } {
  const flow: Line[] = [];
  const footnotes: Line[][] = [];
  let activeFence = '';
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as Line;
    const fence =
      !activeFence || line.text.includes(activeFence)
        ? /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text)
        : null;
    if (fence) {
      const marker = fence[1] ?? '';
      if (!activeFence) activeFence = marker;
      else if (marker.startsWith(activeFence) && isBlank(fence[2] ?? '')) activeFence = '';
    } else if (!activeFence) {
      const footnote = footnoteDefinition.exec(line.text);
      if (footnote) {
        const content = [tail(line, footnote[2] ?? '')];
        index += 1;
        while (index < lines.length) {
          const continuation = lines[index] as Line;
          if (!footnoteContinuation.test(continuation.text)) break;
          content.push(tail(continuation, continuation.text.replace(/^(?: {4}|\t)/u, '')));
          index += 1;
        }
        footnotes.push(content);
        continue;
      }
      const reference = referenceDefinition.exec(line.text);
      if (reference && destination.test((reference[2] ?? '').trimEnd())) {
        index += 1;
        continue;
      }
    }
    flow.push(line);
    index += 1;
  }
  return { flow, footnotes };
}

function parseBlocks(
  lines: Line[],
  depth: number,
  fences: Fence[],
  bodyLineStart: (offset: number) => number,
) {
  if (depth >= MAX_DEPTH) return;
  let cursor = 0;
  const current = () => lines[cursor]?.text ?? '';
  const next = () => lines[cursor + 1]?.text;

  const parseFence = (): boolean => {
    const opener = lines[cursor] as Line;
    const match = fenceOpener.exec(opener.text);
    if (!match) return false;
    const marker = match[2] ?? '';
    const indent = match[1]?.length ?? 0;
    const fence: Fence = {
      start: opener.start,
      lineStart: bodyLineStart(opener.start),
      end: opener.end,
      closed: false,
      nested: depth > 0,
      info: (match[3] ?? '').trim(),
      lines: [],
    };
    cursor += 1;
    while (cursor < lines.length) {
      const line = lines[cursor] as Line;
      cursor += 1;
      fence.end = line.end;
      if (line.text.includes(marker) && fenceCloser.test(line.text)) {
        fence.closed = true;
        break;
      }
      fence.lines.push(stripSpaces(line, indent).text);
    }
    fences.push(fence);
    return true;
  };

  const parseQuote = (): boolean => {
    if (!/^ {0,3}>\s?/u.test(current())) return false;
    const quoted: Line[] = [];
    while (cursor < lines.length) {
      const line = lines[cursor] as Line;
      const match = quoteMarker.exec(line.text);
      if (!match && !isBlank(line.text)) break;
      quoted.push(tail(line, match?.[1] ?? ''));
      cursor += 1;
    }
    parseBlocks(quoted, depth + 1, fences, bodyLineStart);
    return true;
  };

  const parseList = (): boolean => {
    const first = listMarker(current());
    if (!first) return false;
    while (cursor < lines.length) {
      const marker = listMarker(current());
      if (!marker || marker.marker !== first.marker || marker.indent !== first.indent) break;
      const markerLine = lines[cursor] as Line;
      const task = taskItem.exec(marker.content);
      const item: Line[] = [tail(markerLine, task ? (task[2] ?? '') : marker.content)];
      cursor += 1;
      while (cursor < lines.length) {
        const line = lines[cursor] as Line;
        if (listMarker(line.text)?.indent === first.indent) break;
        if (isBlank(line.text)) {
          let following = cursor;
          while (following < lines.length && isBlank(lines[following]?.text ?? '')) following += 1;
          const after = lines[following];
          if (!after) break;
          const afterMarker = listMarker(after.text);
          if (afterMarker?.indent === first.indent) {
            if (afterMarker.marker === first.marker) cursor = following;
            break;
          }
          if (leadingSpaces(after.text) < marker.contentIndent) break;
          while (cursor < following) {
            item.push(stripSpaces(lines[cursor] as Line, marker.contentIndent));
            cursor += 1;
          }
          continue;
        }
        if (leadingSpaces(line.text) >= marker.contentIndent) {
          item.push(stripSpaces(line, marker.contentIndent));
          cursor += 1;
          continue;
        }
        if (isBlockStart(line.text, next())) break;
        item.push(tail(line, line.text.trimStart()));
        cursor += 1;
      }
      parseBlocks(item, depth + 1, fences, bodyLineStart);
    }
    return true;
  };

  const parseTable = (): boolean => {
    const delimiter = next();
    if (!delimiter || !looksLikeTableHeader(current(), delimiter)) return false;
    cursor += 2;
    while (cursor < lines.length && !isBlank(current()) && !isBlockStart(current(), next())) {
      cursor += 1;
    }
    return true;
  };

  const parseParagraph = () => {
    let first = true;
    while (cursor < lines.length) {
      if (isBlank(current()) || (!first && isBlockStart(current(), next()))) return;
      first = false;
      cursor += 1;
    }
  };

  while (cursor < lines.length) {
    const text = current();
    if (isBlank(text)) {
      cursor += 1;
      continue;
    }
    // Letter-led text cannot open a fence, heading, rule, quote, or list.
    if (!/^[a-z]/iu.test(text)) {
      if (parseFence()) continue;
      if (heading.test(text) || thematicBreak.test(text)) {
        cursor += 1;
        continue;
      }
      if (parseQuote() || parseList()) continue;
    }
    if (!parseTable()) parseParagraph();
  }
}

/** Every fenced code block in document order, at any depth. */
export function scanFences(body: string): Fence[] {
  const fences: Fence[] = [];
  const bodyLineStart = (offset: number) => body.lastIndexOf('\n', offset - 1) + 1;
  const { flow, footnotes } = extractDefinitions(bodyLines(body));
  parseBlocks(flow, 0, fences, bodyLineStart);
  for (const footnote of footnotes) parseBlocks(footnote, 1, fences, bodyLineStart);
  return fences.sort((a, b) => a.start - b.start);
}
