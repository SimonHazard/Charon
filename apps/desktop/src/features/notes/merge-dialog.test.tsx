import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { NoteDto } from '@/bindings/workspace';
import { MERGE_SEPARATOR, MergeDialog, mergePreview } from '@/features/notes/merge-dialog';

const note = (id: string, body: string): NoteDto => ({
  id,
  sectionId: 'section',
  body,
  status: 'open',
  sortKey: 0,
  createdAt: id,
  updatedAt: id,
  completedAt: null,
  trashedAt: null,
});
const notes = [note('one', 'First  '), note('two', 'Second')];
const sections = [{ id: 'section', name: 'Ideas', sortKey: 0, createdAt: '1', updatedAt: '1' }];

describe('merge dialog', () => {
  it('uses the exact deterministic Workspace separator and confirms source order once', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <AppProviders>
        <MergeDialog
          notes={notes}
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
          open
          sections={sections}
        />
      </AppProviders>,
    );
    expect(mergePreview(notes)).toBe(`First${MERGE_SEPARATOR}Second`);
    expect(
      screen.getByText('Exact Markdown preview').parentElement?.querySelector('pre')?.textContent,
    ).toBe(`First${MERGE_SEPARATOR}Second`);
    await user.click(screen.getByRole('button', { name: 'Create composite' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(['one', 'two'], 'section');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and reports an atomic transaction failure', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AppProviders>
        <MergeDialog
          notes={notes}
          onConfirm={vi.fn().mockRejectedValue(new Error('transaction failed'))}
          onOpenChange={onOpenChange}
          open
          sections={sections}
        />
      </AppProviders>,
    );
    await user.click(screen.getByRole('button', { name: 'Create composite' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
