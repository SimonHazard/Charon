import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { CaptureCapabilities } from '@/bindings/capture';
import { ShelfActions } from '@/components/shelf-chrome';
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

function clients(overrides: Partial<CaptureCapabilities> = {}) {
  const resolvedCapabilities = { ...capabilities, ...overrides };
  const requestPermission = vi.fn().mockResolvedValue(resolvedCapabilities);
  const captureClient: CaptureClient = {
    capabilities: vi.fn().mockResolvedValue(resolvedCapabilities),
    open: vi.fn().mockResolvedValue(resolvedCapabilities),
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
    }),
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

  it('shows the bounded groups and basename-only Workspace disclosure', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('button', { name: 'Solarized' })).toBeNull();
    for (const heading of ['Appearance', 'Language', 'Notes folder', 'Capture', 'Updates']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(document.querySelector('.preferences-section-icon')).toBeNull();
    await screen.findByText('Charon Notes');
    expect(document.body.textContent).not.toContain('/Users/');
    expect(screen.getByText('⌘ + Shift + Space')).toBeTruthy();
    expect(screen.queryByText(/shortcut is already used/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Enable update checks' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('shows a contextual warning when the portable shortcut registration fails', async () => {
    const native = clients({ standardShortcut: 'error' });
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText(/shortcut is already used/i)).toBeTruthy();
  });

  it('applies immediate theme/language and requests each permission explicitly', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
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

  it('rechecks macOS permissions when Charon regains focus', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('button', { name: 'Open Settings' })).toBeTruthy();

    const refreshedCapabilities = vi.fn().mockResolvedValue({
      ...capabilities,
      inputMonitoring: 'available',
      doubleShift: 'available',
    });
    native.captureClient.capabilities = refreshedCapabilities;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull());
    expect(refreshedCapabilities).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Ready')).toHaveLength(2);
  });

  it('keeps detailed capture disclosures in keyboard-accessible tooltips', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const disclosure = /Required only to observe the double-Shift/;
    expect(screen.queryByText(disclosure)).toBeNull();
    await user.hover(screen.getByRole('button', { name: 'About Input Monitoring' }));
    const content = await screen.findByText(disclosure);
    expect(content).toBeTruthy();
    expect(content.closest('[data-slot="tooltip-content"]')?.parentElement?.className).toContain(
      'z-[60]',
    );
    await user.unhover(screen.getByRole('button', { name: 'About Input Monitoring' }));
    await user.hover(screen.getByRole('button', { name: 'About the portable shortcut' }));
    expect(await screen.findByText(/Shows Charon/)).toBeTruthy();
  });

  it('keeps a local capability error actionable inside the Popover', async () => {
    const native = clients();
    native.captureClient.capabilities = vi.fn().mockRejectedValue(new Error('unavailable'));
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText(/could not be refreshed/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(native.captureClient.capabilities).toHaveBeenCalledTimes(2));
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
        <ShelfActions />
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
