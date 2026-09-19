import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { CaptureInput } from '@/features/notes/capture-input';

describe('flat capture input', () => {
  it('does not submit while confirming an IME composition', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '日本語' } });
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(false);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(false);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('日本語'));
  });
  it('creates on Enter, ignores whitespace, and clears only after success', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.type(input, '  a thought  {Enter}');
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('a thought'));
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    await user.type(input, '   {Enter}');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('preserves and refocuses failed text for retry', async () => {
    const user = userEvent.setup();
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.type(input, 'keep me{Enter}');
    expect(await screen.findByText(/text is preserved/i)).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('keep me');
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });
});
