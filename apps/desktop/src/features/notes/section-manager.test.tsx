import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import { SectionManager } from '@/features/notes/section-manager';

const snapshot: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspaceId: 'workspace',
  revision: 1,
  sections: [
    { id: 'ideas', name: 'Ideas', sortKey: 0, createdAt: '1', updatedAt: '1' },
    { id: 'archive', name: 'Archive', sortKey: 1, createdAt: '1', updatedAt: '1' },
  ],
  notes: [
    {
      id: 'note',
      sectionId: 'ideas',
      body: 'body',
      status: 'open',
      sortKey: 0,
      createdAt: '1',
      updatedAt: '1',
      completedAt: null,
      trashedAt: null,
    },
  ],
};

describe('section manager', () => {
  it('blocks deletion while notes would be orphaned', () => {
    render(
      <AppProviders>
        <SectionManager onCommand={vi.fn()} onOpenChange={vi.fn()} open snapshot={snapshot} />
      </AppProviders>,
    );
    const deleteIdeas = screen.getByRole('button', { name: 'Delete Ideas' });
    expect((deleteIdeas as HTMLButtonElement).disabled).toBe(true);
    expect(deleteIdeas.getAttribute('title')).toBe(
      'Move every note out of this section before deleting it.',
    );
  });
});
