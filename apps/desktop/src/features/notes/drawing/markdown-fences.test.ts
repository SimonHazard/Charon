import { parseMarkdown } from '@tanstack/markdown/parser';
import { describe, expect, it } from 'vitest';

import { scanFences } from '@/features/notes/drawing/markdown-fences';

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  items?: { children: Node[] }[];
};

/** Code blocks as the Preview renderer parses them: top-level ones in order, nested ones sorted. */
function rendererCode(body: string) {
  const top: string[] = [];
  const nested: string[] = [];
  const visit = (nodes: Node[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 'code') (depth ? nested : top).push(node.value ?? '');
      if (node.children) visit(node.children, depth + 1);
      for (const item of node.items ?? []) visit(item.children, depth + 1);
    }
  };
  visit(parseMarkdown(body, { frontmatter: false }).children as Node[], 0);
  return { top, nested: nested.sort() };
}

function scannedCode(body: string) {
  const fences = scanFences(body);
  return {
    top: fences.filter(({ nested }) => !nested).map(({ lines }) => lines.join('\n')),
    nested: fences
      .filter(({ nested }) => nested)
      .map(({ lines }) => lines.join('\n'))
      .sort(),
  };
}

const corpus: Record<string, string> = {
  'top-level, tilde, indented, CRLF, and unclosed fences': [
    '# Title',
    '',
    '```svg',
    'a',
    '```',
    '~~~~ svg ',
    'b',
    '~~~~',
    '  ```svg',
    '  c',
    '  ```',
    '```js',
    'unclosed',
  ].join('\r\n'),
  'a fence inside another fence': ['````markdown', '```svg', 'a', '```', '````', 'after'].join(
    '\n',
  ),
  'a quoted fence, then a top-level one': [
    '> Quote',
    '> ```svg',
    '> quoted',
    '> ```',
    '',
    '```svg',
    'top',
    '```',
  ].join('\n'),
  'a quote ended by a fence line': ['> quote', '```js', 'top', '```'].join('\n'),
  'a fence on a list marker line, then a top-level one': [
    '- ```svg',
    '  listed',
    '  ```',
    '- next',
    '',
    '```svg',
    'top',
    '```',
  ].join('\n'),
  'an indented fence in a loose list item': [
    '1. item',
    '',
    '   ```js',
    '   listed',
    '   ```',
    '',
    '```js',
    'top',
    '```',
  ].join('\n'),
  'a fence after a lazy continuation line': [
    '- item',
    'lazy',
    '  ```js',
    '  listed',
    '  ```',
    'after',
  ].join('\n'),
  'a fence in a nested list and in a task': [
    '* a',
    '  * b',
    '    ```js',
    '    deep',
    '    ```',
    '* [x] ```js',
    '  task',
    '  ```',
  ].join('\n'),
  'a fence ending a list': ['- item', '```js', 'top', '```'].join('\n'),
  'ordered text that cannot interrupt a paragraph': [
    'Paragraph',
    '2. still paragraph',
    '   ```js',
    '   top',
    '   ```',
  ].join('\n'),
  'a table, a rule, and a heading before fences': [
    'a | b',
    '--- | ---',
    '1 | 2',
    '```js',
    'top',
    '```',
    '- - -',
    '## Heading',
    '```js',
    'second',
    '```',
  ].join('\n'),
  'a referenced footnote and a reference definition': [
    'Text[^1] and [link][r]',
    '',
    '- item',
    '[r]: https://example.com',
    '  ```js',
    '  listed',
    '  ```',
    '',
    '[^1]: Note',
    '    ```js',
    '    footnote',
    '    ```',
    '',
    '```js',
    'top',
    '```',
  ].join('\n'),
  'an unclosed fence inside a list item': ['- ```js', '  open', '- next', 'tail'].join('\n'),
  'a backtick in the info string': ['```a`b', 'x', '```'].join('\n'),
};

describe('fences as the Preview renderer groups them', () => {
  it.each(Object.entries(corpus))('matches the renderer for %s', (_, body) => {
    expect(scannedCode(body)).toEqual(rendererCode(body));
  });

  it('reports offsets, the opener line, and whether a fence was closed', () => {
    const body = '- ```js\n  code\n  ```\n\n```svg\nopen';
    const [listed, open] = scanFences(body);
    expect(listed).toMatchObject({ nested: true, closed: true, info: 'js', lines: ['code'] });
    expect(body.slice(listed?.start, listed?.end)).toBe('```js\n  code\n  ```');
    expect(listed?.lineStart).toBe(0);
    expect(open).toMatchObject({ nested: false, closed: false, info: 'svg', lines: ['open'] });
    expect(open?.lineStart).toBe(body.indexOf('```svg'));
    expect(open?.end).toBe(body.length);
  });
});
