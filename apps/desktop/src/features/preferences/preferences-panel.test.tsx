import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import { Titlebar } from '@/components/titlebar';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { snapshot, workspaceClient } from '@/test/workspace-fixture';

const capabilities = {
  platform: 'macos',
  standardShortcut: 'available',
  inputMonitoring: 'denied',
  accessibility: 'available',
  doubleShift: 'denied',
  selectedText: 'available',
  activeShortcut: 'CmdOrCtrl+Shift+Space',
} as const;

function clients() {
  const requestPermission = vi.fn().mockResolvedValue(capabilities);
  const captureClient: CaptureClient = {
    capabilities: vi.fn().mockResolvedValue(capabilities),
    open: vi.fn().mockResolvedValue(capabilities),
    requestPermission,
    composerReady: vi.fn().mockResolvedValue(undefined),
    subscribeComposerFocus: vi.fn().mockResolvedValue(() => undefined),
    subscribeStatus: vi.fn().mockResolvedValue(() => undefined),
  };
  const preferencesClient: NativePreferencesClient = {
    read: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      workspaceName: 'Charon Notes',
      hasRememberedWorkspace: true,
      captureHintDismissed: false,
    }),
    update: vi.fn(),
    reset: vi.fn(),
  };
  return { captureClient, preferencesClient, requestPermission };
}

function DirtyDraftControl() {
  const workspace = useWorkspace();
  return (
    <button onClick={() => workspace.setWorkspaceSwitchBlocked(true)} type="button">
      Make draft dirty
    </button>
  );
}

describe('compact Preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  it('shows the four bounded groups and basename-only Workspace disclosure', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <Titlebar />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    for (const heading of ['Appearance', 'Language', 'Notes folder', 'Capture']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    await screen.findByText('Charon Notes');
    expect(document.body.textContent).not.toContain('/Users/');
    expect(screen.getByText('CmdOrCtrl+Shift+Space')).toBeTruthy();
  });

  it('applies immediate theme/language and requests each permission explicitly', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <Titlebar />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Graphite' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'French' }));
    expect(document.documentElement.lang).toBe('fr');
    await user.click(screen.getByRole('button', { name: 'Ouvrir Réglages' }));
    expect(native.requestPermission).toHaveBeenCalledWith('inputMonitoring');
  });

  it('keeps detailed capture disclosures in keyboard-accessible tooltips', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <Titlebar />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const disclosure = /Required only to observe the double-Shift/;
    expect(screen.queryByText(disclosure)).toBeNull();
    await user.hover(screen.getByRole('button', { name: 'About Input Monitoring' }));
    expect(await screen.findByText(disclosure)).toBeTruthy();
  });

  it('blocks folder switching while an editor draft is dirty', async () => {
    const native = clients();
    const client = {
      ...workspaceClient(snapshot()),
      chooseDirectory: vi.fn().mockResolvedValue('/synthetic/new'),
      openOrCreate: vi.fn().mockResolvedValue(snapshot()),
    };
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={client}
      >
        <DirtyDraftControl />
        <Titlebar />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Make draft dirty' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const choose = screen.getByRole('button', { name: 'Choose…' });
    expect((choose as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(screen.getByText(/Finish saving/)).toBeTruthy());
    expect(client.chooseDirectory).not.toHaveBeenCalled();
  });
});
