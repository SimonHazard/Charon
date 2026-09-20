import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NotePreview } from '@/features/notes/note-preview';

describe('Note preview', () => {
  it('preserves heading depth and groups consecutive bullets and tasks into lists', () => {
    render(
      <AppProviders>
        <NotePreview
          body={
            '# Title\n### Detail\n###### Deep\n\n- First\n- Second\n\n- [ ] Open\n- [x] Done\nParagraph'
          }
          label="Preview"
        />
      </AppProviders>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Detail' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 6, name: 'Deep' })).toBeTruthy();
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(1);
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    const tasks = within(lists[0] as HTMLElement).getAllByRole('checkbox');
    expect(tasks.map((task) => (task as HTMLInputElement).checked)).toEqual([false, true]);
    expect(screen.getByText(/Paragraph/)).toBeTruthy();
  });
  it('renders rich syntax without interpreting HTML or creating resource/navigation elements', () => {
    const { container } = render(
      <AppProviders>
        <NotePreview
          label="Preview"
          body={[
            '**Bold** and *italic* and ~~removed~~ with `code`',
            '',
            '1. Ordered',
            '2. List',
            '',
            '> Quoted',
            '',
            '```js',
            'const value = "<script>";',
            '```',
            '',
            '| Column | Value |',
            '| --- | --- |',
            '| Cell | Content |',
            '',
            '[Documentation](https://example.com/docs)',
            '',
            '![Remote image](https://example.com/pixel.png)',
            '',
            '![Local image](file:///private/image.png)',
            '',
            '[Unsafe](javascript:alert(1))',
            '',
            '<img src="https://example.com/raw.png" onerror="alert(1)">',
            '<script>alert(1)</script>',
          ].join('\n')}
        />
      </AppProviders>,
    );
    expect(container.querySelector('strong')?.textContent).toBe('Bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('del')?.textContent).toBe('removed');
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelector('blockquote')).toBeTruthy();
    expect(container.querySelector('pre code')?.textContent).toContain('<script>');
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('https://example.com/docs')).toBeTruthy();
    expect(screen.getByText('Remote image')).toBeTruthy();
    expect(container.querySelector('a, img, script, iframe, object, video, audio')).toBeNull();
  });
});
