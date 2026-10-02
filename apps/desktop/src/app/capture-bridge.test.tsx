import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCaptureAcknowledgement } from '@/app/capture-acknowledgement-context';
import { AppProviders } from '@/app/providers';
import { toast } from '@/components/ui/toast';
import { captureClients } from '@/test/capture-fixture';

function AcknowledgementProbe() {
  const { acknowledgement } = useCaptureAcknowledgement();
  return <output data-testid="acknowledgement">{acknowledgement?.noteId ?? ''}</output>;
}

function renderBridge() {
  const native = captureClients();
  const subscribed = vi.spyOn(native.captureClient, 'composerReady');
  render(
    <AppProviders captureClient={native.captureClient} preferencesClient={native.preferencesClient}>
      <AcknowledgementProbe />
    </AppProviders>,
  );
  return { ...native, subscribed };
}

describe('capture bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acknowledges a created capture in the shelf without a toast', async () => {
    const add = vi.spyOn(toast, 'add');
    const { emitStatus, subscribed } = renderBridge();
    await waitFor(() => expect(subscribed).toHaveBeenCalled());

    act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured-1' }));
    expect(screen.getByTestId('acknowledgement').textContent).toBe('captured-1');

    act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured-2' }));
    expect(screen.getByTestId('acknowledgement').textContent).toBe('captured-2');
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps warnings and errors as toasts that acknowledge nothing', async () => {
    const add = vi.spyOn(toast, 'add');
    const { emitStatus, subscribed } = renderBridge();
    await waitFor(() => expect(subscribed).toHaveBeenCalled());

    act(() => emitStatus({ messageKey: 'capture_warning_clipboard_not_restored', noteId: null }));
    act(() => emitStatus({ messageKey: 'workspace_error_not_open', noteId: null }));

    expect(add.mock.calls.map(([options]) => options.type)).toEqual(['warning', 'error']);
    expect(screen.getByTestId('acknowledgement').textContent).toBe('');
  });
});
