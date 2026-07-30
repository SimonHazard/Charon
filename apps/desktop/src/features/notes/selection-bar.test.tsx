import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { SelectionBar } from '@/features/notes/selection-bar';

const props = {
  sections: [{ id: 'section', name: 'Ideas', sortKey: 0, createdAt: '1', updatedAt: '1' }],
  onSetDone: vi.fn(),
  onSetOpen: vi.fn(),
  onMove: vi.fn(),
  moveOpen: false,
  onMoveOpenChange: vi.fn(),
  onMerge: vi.fn(),
  onTrash: vi.fn(),
};

describe('selection bar', () => {
  it('pluralizes the selected count in English and French', () => {
    applyLocale('en');
    const view = render(
      <AppProviders>
        <SelectionBar {...props} count={2} />
      </AppProviders>,
    );
    expect(screen.getByText('2 notes selected')).toBeTruthy();
    view.unmount();
    applyLocale('fr');
    render(
      <AppProviders>
        <SelectionBar {...props} count={2} />
      </AppProviders>,
    );
    expect(screen.getByText('2 notes sélectionnées')).toBeTruthy();
    applyLocale('en');
  });

  it('accepts rapid hide and reopen without locking the surface', async () => {
    const view = render(
      <AppProviders>
        <SelectionBar {...props} count={1} />
      </AppProviders>,
    );
    view.rerender(
      <AppProviders>
        <SelectionBar {...props} count={0} />
      </AppProviders>,
    );
    view.rerender(
      <AppProviders>
        <SelectionBar {...props} count={1} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText('1 note selected')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Move to trash' })).toBeTruthy();
  });
});
