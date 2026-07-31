import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { ComposedClipboard } from '@/bindings/clipboard';
import { CopyMenu, NoteCopyMenu } from '@/features/copy/copy-menu';
import { CopyPreviewDialog } from '@/features/copy/copy-preview-dialog';

const result: ComposedClipboard = {
  markdown: '- First\n- Second',
  noteCount: 2,
  omittedEmptyCount: 0,
  preview: '- First\n- Second',
};

describe('copy menu', () => {
  it('copies immediately with the default and can change preset or open preview', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onPresetChange = vi.fn();
    const onPreview = vi.fn();
    render(
      <AppProviders>
        <CopyMenu
          onCopy={onCopy}
          onPresetChange={onPresetChange}
          onPreview={onPreview}
          preset="plain"
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Copy options. Default: Plain Markdown' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Numbered list' }));
    expect(onPresetChange).toHaveBeenCalledWith('numbered');
    await user.click(await screen.findByRole('menuitem', { name: 'Preview copy' }));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('copies one row with an explicit preset', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <AppProviders>
        <NoteCopyMenu defaultPreset="plain" onCopy={onCopy} onPreview={vi.fn()} title="First" />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Copy options for First' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Task list' }));
    expect(onCopy).toHaveBeenCalledWith('task-list');
  });

  it('shows exact preview, copy action, and retryable error state', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onRetry = vi.fn();
    const view = render(
      <AppProviders>
        <CopyPreviewDialog
          error={null}
          loading={false}
          onCopy={onCopy}
          onOpenChange={vi.fn()}
          onRetry={onRetry}
          open
          preset="bulleted"
          result={result}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Exact Markdown to copy' }) as HTMLTextAreaElement)
        .value,
    ).toBe('- First\n- Second');
    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }));
    expect(onCopy).toHaveBeenCalledTimes(1);

    view.rerender(
      <AppProviders>
        <CopyPreviewDialog
          error={{ code: 'write_failed', messageKey: 'clipboard_error_write_failed' }}
          loading={false}
          onCopy={onCopy}
          onOpenChange={vi.fn()}
          onRetry={onRetry}
          open
          preset="plain"
          result={null}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'The clipboard could not be written. Your selection is preserved; retry.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
