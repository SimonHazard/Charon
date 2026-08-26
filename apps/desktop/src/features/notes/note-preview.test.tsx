import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotePreview } from '@/features/notes/note-preview';

describe('Note preview', () => {
  it('preserves heading depth and groups consecutive bullets and tasks into lists', () => {
    render(
      <NotePreview
        body={
          '# Title\n### Detail\n###### Deep\n\n- First\n* Second\n\n- [ ] Open\n- [x] Done\nParagraph'
        }
        label="Preview"
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Detail' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 6, name: 'Deep' })).toBeTruthy();
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    const tasks = within(lists[1] as HTMLElement).getAllByRole('checkbox');
    expect(tasks.map((task) => task.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(screen.getByText('Paragraph').tagName).toBe('P');
  });
});
