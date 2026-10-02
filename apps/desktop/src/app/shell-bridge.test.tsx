import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders, usePreferences } from '@/app/providers';
import { type QuitHandler, useQuitRequest } from '@/app/quit-request-context';
import { captureClients } from '@/test/capture-fixture';
import { shellClients } from '@/test/shell-fixture';

function LocaleSwitch() {
  const { setLocale } = usePreferences();
  return (
    <button onClick={() => setLocale('fr')} type="button">
      French
    </button>
  );
}

function QuitGuard({ handler }: { handler: QuitHandler }) {
  const { registerQuitHandler } = useQuitRequest();
  useEffect(() => registerQuitHandler(handler), [handler, registerQuitHandler]);
  return null;
}

function renderBridge(handler?: QuitHandler) {
  const native = captureClients();
  const shell = shellClients();
  const read = vi.spyOn(native.preferencesClient, 'read');
  render(
    <AppProviders
      captureClient={native.captureClient}
      preferencesClient={native.preferencesClient}
      shellClient={shell.shellClient}
    >
      <LocaleSwitch />
      {handler ? <QuitGuard handler={handler} /> : null}
    </AppProviders>,
  );
  return { ...shell, read };
}

describe('shell bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listens for tray quits before sending the labels, then resends them in the new language', async () => {
    const { shellClient, read } = renderBridge();
    await waitFor(() => expect(shellClient.setLabels).toHaveBeenCalledTimes(1));
    expect(shellClient.subscribeQuitRequest.mock.invocationCallOrder[0]).toBeLessThan(
      shellClient.setLabels.mock.invocationCallOrder[0] ?? 0,
    );
    expect(shellClient.setLabels).toHaveBeenLastCalledWith({
      trayOpen: 'Open Charon',
      trayQuit: 'Quit Charon',
      trayTooltip: 'Charon',
      notificationTitle: 'Charon',
      notificationBody: 'Note captured.',
    });
    // Sending labels can restore a persisted background mode, so Preferences re-reads it.
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThanOrEqual(2));

    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    await waitFor(() => expect(shellClient.setLabels).toHaveBeenCalledTimes(2));
    expect(shellClient.setLabels).toHaveBeenLastCalledWith({
      trayOpen: 'Ouvrir Charon',
      trayQuit: 'Quitter Charon',
      trayTooltip: 'Charon',
      notificationTitle: 'Charon',
      notificationBody: 'Note capturée.',
    });
  });

  it('quits at once when no draft guard is registered', async () => {
    const { shellClient, requestQuit } = renderBridge();
    await waitFor(() => expect(shellClient.setLabels).toHaveBeenCalled());

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.quit).toHaveBeenCalledTimes(1));
    expect(shellClient.cancelQuit).not.toHaveBeenCalled();
  });

  it('keeps Charon running and reveals it when the draft guard refuses', async () => {
    const handler = vi.fn<QuitHandler>().mockResolvedValue(false);
    const { shellClient, requestQuit } = renderBridge(handler);
    await waitFor(() => expect(shellClient.setLabels).toHaveBeenCalled());

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.cancelQuit).toHaveBeenCalledTimes(1));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(shellClient.quit).not.toHaveBeenCalled();
  });

  it('quits once the draft guard passes', async () => {
    const handler = vi.fn<QuitHandler>().mockResolvedValue(true);
    const { shellClient, requestQuit } = renderBridge(handler);
    await waitFor(() => expect(shellClient.setLabels).toHaveBeenCalled());

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.quit).toHaveBeenCalledTimes(1));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(shellClient.cancelQuit).not.toHaveBeenCalled();
  });
});
