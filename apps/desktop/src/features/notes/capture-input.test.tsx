import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { CaptureInput } from '@/features/notes/capture-input';

describe('notes capture input', () => {
  it('ignores empty text and clears only after a successful note command', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} sectionName="Ideas" />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Add a note to Ideas' });
    await user.type(input, '   {Enter}');
    expect(onCreate).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'A quick thought{Enter}');
    expect(onCreate).toHaveBeenCalledWith('A quick thought');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('preserves text after a failed command so Enter can retry', async () => {
    const user = userEvent.setup();
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} sectionName="Ideas" />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Add a note to Ideas' });
    await user.type(input, 'Keep this{Enter}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/text is preserved/i);
    expect((input as HTMLInputElement).value).toBe('Keep this');
    await user.type(input, '{Enter}');
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect((input as HTMLInputElement).value).toBe('');
  });
});
