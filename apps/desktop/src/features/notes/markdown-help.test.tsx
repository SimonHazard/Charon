import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { toDrawingBlock } from '@/features/notes/drawing/drawing-format';
import {
  MarkdownHelp,
  type MarkdownHelpEntry,
  markdownHelpExamples,
  markdownHelpUnsupported,
} from '@/features/notes/markdown-help';
import { NotePreview } from '@/features/notes/note-preview';
import { m } from '@/paraglide/messages.js';

const unsafeElements = 'a, img, script, iframe, object, video, audio';

function preview(source: string) {
  return render(
    <AppProviders>
      <NotePreview body={source} label="Preview" />
    </AppProviders>,
  ).container;
}

const all = (container: HTMLElement, selector: string) => [...container.querySelectorAll(selector)];
const texts = (container: HTMLElement, selector: string) =>
  all(container, selector).map((element) => element.textContent);

// What the safe Preview must render for each documented source: the contract between the two.
const expectations: Record<string, (container: HTMLElement) => void> = {
  heading: (container) => {
    expect(texts(container, 'h2')).toEqual(['Text']);
    expect(texts(container, 'h3')).toEqual(['Text']);
  },
  emphasis: (container) => {
    expect(texts(container, 'strong')).toEqual(['Text']);
    expect(texts(container, 'em')).toEqual(['Text']);
    expect(texts(container, 'del')).toEqual(['Text']);
    expect(container.textContent).not.toContain('·');
  },
  breaks: (container) => {
    expect(all(container, 'br')).toHaveLength(1);
    expect(all(container, 'p')).toHaveLength(2);
  },
  list: (container) => {
    expect(container.querySelector('ul ul li')?.textContent).toBe('Item');
    expect(all(container, 'ol > li')).toHaveLength(2);
  },
  task: (container) => {
    const tasks = all(container, 'input[type="checkbox"][disabled]') as HTMLInputElement[];
    expect(tasks.map((task) => task.checked)).toEqual([false, true]);
  },
  quote: (container) => {
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('Text');
  },
  code: (container) => {
    expect(container.querySelector('p code')?.textContent).toBe('Text');
    expect(container.querySelector('pre code')?.textContent?.trim()).toBe('Text');
  },
  table: (container) => {
    expect(container.querySelector('table')).toBeTruthy();
    expect(texts(container, 'th')).toEqual(['Column', 'Column']);
    expect(texts(container, 'td')).toEqual(['Text', 'Text']);
  },
  divider: (container) => {
    expect(all(container, 'hr')).toHaveLength(1);
  },
  link: (container) => {
    expect(container.querySelector('.note-preview-link')?.textContent).toBe('Text (notes.md)');
  },
  html: (container) => {
    expect(container.textContent).toContain('<b>Text</b>');
    expect(container.querySelector('b')).toBeNull();
  },
  image: (container) => {
    expect(container.querySelector('.note-preview-image')?.textContent).toBe('Text');
  },
};

describe('Markdown help', () => {
  beforeEach(() => {
    applyLocale('en');
  });

  it('documents ten rendered examples and two unrendered ones with unique ids', () => {
    const examples = markdownHelpExamples(m);
    const unsupported = markdownHelpUnsupported(m);
    expect(examples).toHaveLength(10);
    expect(unsupported).toHaveLength(2);
    const ids = [...examples, ...unsupported].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(12);
    expect(Object.keys(expectations).sort()).toEqual([...ids].sort());
  });

  it.each([...markdownHelpExamples(m), ...markdownHelpUnsupported(m)])(
    'renders the $id example in the safe Preview exactly as described',
    (entry: MarkdownHelpEntry) => {
      const container = preview(entry.source);
      expectations[entry.id]?.(container);
      expect(container.querySelector(unsafeElements)).toBeNull();
    },
  );

  it('localizes the example text and titles', () => {
    applyLocale('fr');
    const [heading, emphasis] = markdownHelpExamples(m);
    expect(heading?.source).toBe('# Texte\n## Texte');
    expect(heading?.title).toBe('Titre');
    expect(emphasis?.title).toBe('Gras, italique et texte barré');
    expect(emphasis?.source).toContain('**Texte**');
    expect(markdownHelpUnsupported(m).map((entry) => entry.title)).toEqual(['HTML', 'Images']);
  });

  it('describes the Draw output truthfully: one svg code block that Preview draws safely', () => {
    const block = toDrawingBlock({
      viewBox: { x: 84, y: 84, width: 132, height: 72 },
      strokes: [
        {
          color: 'currentColor',
          width: 4,
          opacity: null,
          commands: [
            { op: 'M', x: 100, y: 100 },
            { op: 'L', x: 200, y: 140 },
          ],
        },
      ],
    });
    // "a small SVG code block": plain Markdown text, so Copy as Markdown carries it verbatim.
    expect(block.startsWith('```svg\n<svg ')).toBe(true);
    expect(block.endsWith('</svg>\n```')).toBe(true);
    const container = preview(`Before\n\n${block}\n\nAfter`);
    expect(container.querySelector('figure.note-drawing svg[role="img"]')).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector(unsafeElements)).toBeNull();
  });

  it('opens from the keyboard, lists every entry, and Escape restores the trigger', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <MarkdownHelp />
      </AppProviders>,
    );
    const trigger = screen.getByRole('button', { name: 'Markdown help' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Not rendered' })).toBeTruthy();
    expect(screen.getAllByRole('term')).toHaveLength(12);
    expect(screen.getByText('Leave a space after #.')).toBeTruthy();
    expect(screen.getByText(/End a line with \\ to keep the break/)).toBeTruthy();
    expect(
      screen.getByText('Preview makes no network request and never opens files.'),
    ).toBeTruthy();
    expect(screen.getByText(m.drawing_help())).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Not rendered' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
