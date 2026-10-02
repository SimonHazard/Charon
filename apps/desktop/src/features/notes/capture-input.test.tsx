import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { CaptureInput } from '@/features/notes/capture-input';
import { iconOnlyControlsWithoutTooltip } from '@/test/tooltip-contract';

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
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    await user.type(input, '   {Enter}');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('accents the submit button only while there is text to add', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <CaptureInput onCreate={vi.fn().mockResolvedValue(undefined)} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    const submit = screen.getByRole('button', { name: 'Add note' });
    expect(submit.className).not.toContain('bg-primary');
    await user.type(input, 'a thought');
    expect(submit.className).toContain('bg-primary');
    await user.clear(input);
    await user.type(input, '   ');
    expect(submit.className).not.toContain('bg-primary');
  });

  it('names the send button in a Tooltip', async () => {
    applyLocale('en');
    const user = userEvent.setup();
    render(
      <AppProviders>
        <CaptureInput onCreate={vi.fn().mockResolvedValue(undefined)} />
      </AppProviders>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Capture a note' }), 'a thought');
    const submit = screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.type).toBe('submit');
    expect(submit.getAttribute('data-slot')).toBe('button');
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
  });

  it('creates the Note once when the enabled send button is clicked', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    const submit = screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(input, 'from the button');
    await user.click(submit);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('from the button'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect((input as HTMLTextAreaElement).value).toBe('');
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
    expect((input as HTMLTextAreaElement).value).toBe('keep me');
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('keeps pasted line breaks and creates the multi-line body on Enter', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    expect(input.tagName).toBe('TEXTAREA');
    await user.click(input);
    await user.paste('a\nb');
    expect((input as HTMLTextAreaElement).value).toBe('a\nb');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('a\nb'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('inserts a line break on Shift+Enter without creating a Note', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Shift+Enter adds a line',
    );
    await user.type(input, 'first{Shift>}{Enter}{/Shift}second');
    expect((input as HTMLTextAreaElement).value).toBe('first\nsecond');
    expect(onCreate).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('first\nsecond'));
  });

  it('keeps a failed multi-line body intact and focused', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('failed'));
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.click(input);
    await user.paste('first line\n\n- second line');
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/text is preserved/i)).toBeTruthy();
    expect(onCreate).toHaveBeenCalledWith('first line\n\n- second line');
    expect((input as HTMLTextAreaElement).value).toBe('first line\n\n- second line');
    expect(document.activeElement).toBe(input);
  });

  it('does nothing on Enter for empty or whitespace-only input', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <CaptureInput onCreate={onCreate} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.click(input);
    await user.keyboard('{Enter}');
    await user.paste(' \n  ');
    await user.keyboard('{Enter}');
    expect(onCreate).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toBe(' \n  ');
  });
});
