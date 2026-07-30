import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { BulkTrashDialog, TrashView } from '@/features/notes/trash-view';

describe('trash workflows', () => {
  it('pluralizes bulk scope and preserves the dialog after transaction failure', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AppProviders>
        <BulkTrashDialog
          context="Ideas"
          count={3}
          onConfirm={vi.fn().mockRejectedValue(new Error('failed'))}
          onOpenChange={onOpenChange}
          open
        />
      </AppProviders>,
    );
    expect(screen.getByText(/These 3 notes from Ideas/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('requires a separate irreversible confirmation', async () => {
    const user = userEvent.setup();
    const permanentlyDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <TrashView count={1} onPermanentlyDelete={permanentlyDelete} onRestore={vi.fn()} />
      </AppProviders>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(screen.getByText('This removes the Markdown file and cannot be undone.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(permanentlyDelete).toHaveBeenCalledTimes(1);
  });
});
