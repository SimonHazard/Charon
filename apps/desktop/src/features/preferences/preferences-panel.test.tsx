import { themeMediaQuery, themeStorageKey } from '@charon/theme/theme-contract';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { CaptureCapabilities } from '@/bindings/capture';
import { ShelfActions } from '@/components/shelf-chrome';
import type { UpdateClient } from '@/features/updates/update-client';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { setMediaQuery } from '@/test/setup';
import { snapshot, workspaceClient } from '@/test/workspace-fixture';

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

const capabilities = {
  platform: 'macos',
  standardShortcut: 'available',
  inputMonitoring: 'denied',
  accessibility: 'available',
  doubleShift: 'denied',
  selectedText: 'available',
  activeShortcut: 'CmdOrCtrl+Shift+Space',
} as const;

function clients(
  overrides: Partial<CaptureCapabilities> = {},
  installKind: 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'macos' | 'unknown' = 'unknown',
) {
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
      installKind,
    }),
    reset: vi.fn(),
  };
  return { captureClient, preferencesClient, requestPermission };
}

function availableUpdate(): UpdateClient {
  return {
    check: vi.fn().mockResolvedValue({
      version: '0.2.0',
      notes: 'A small update.',
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    relaunch: vi.fn().mockResolvedValue(undefined),
  };
}

function WorkspaceActivity() {
  const workspace = useWorkspace();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void workspace.executeWorkspaceCommand({ type: 'createNote', body: 'A new note' })
        }
      >
        Save note
      </button>
      <button type="button" onClick={() => void workspace.refreshWorkspace()}>
        Refresh notes
      </button>
    </>
  );
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
    expect(screen.getByText('⌘ + ⇧ + Space')).toBeTruthy();
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

  it('applies immediate theme/language and requests each macOS permission explicitly', async () => {
    const native = clients({ accessibility: 'denied', selectedText: 'denied' });
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(screen.getByText(/ajoutez le Charon.app actuel/)).toBeTruthy();
    const settingsButtons = screen.getAllByRole('button', { name: 'Ouvrir Réglages' });
    await user.click(settingsButtons[0]);
    await user.click(settingsButtons[1]);
    expect(native.requestPermission).toHaveBeenNthCalledWith(1, 'inputMonitoring');
    expect(native.requestPermission).toHaveBeenNthCalledWith(2, 'accessibility');
  });

  it('offers System, Light, and Graphite and follows the OS only while System is chosen', async () => {
    localStorage.setItem(themeStorageKey, 'dark');
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
    const appearance = screen.getByRole('group', { name: 'Choose theme' });
    expect(
      within(appearance)
        .getAllByRole('button')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['System', 'Light', 'Graphite']);
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(within(appearance).getByRole('button', { name: 'System' }));
    expect(localStorage.getItem(themeStorageKey)).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    setMediaQuery(themeMediaQuery, true);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    await user.click(within(appearance).getByRole('button', { name: 'Light' }));
    setMediaQuery(themeMediaQuery, false);
    setMediaQuery(themeMediaQuery, true);
    expect(localStorage.getItem(themeStorageKey)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('reports a macOS Settings opening failure beside the permission actions', async () => {
    const native = clients();
    native.captureClient.requestPermission = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'settings_open_failed',
        messageKey: 'capture_error_settings_open_failed',
      })
      .mockResolvedValue(capabilities);
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
    await user.click(await screen.findByRole('button', { name: 'Open Settings' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'System Settings could not be opened. Try Open Settings again.',
    );
    await user.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(native.captureClient.requestPermission).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rechecks macOS permissions when Charon regains focus', async () => {
    const native = clients({ accessibility: 'denied', selectedText: 'denied' });
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
    expect(await screen.findAllByRole('button', { name: 'Open Settings' })).toHaveLength(2);

    const refreshedCapabilities = vi.fn().mockResolvedValue({
      ...capabilities,
      inputMonitoring: 'available',
      accessibility: 'available',
      doubleShift: 'available',
    });
    native.captureClient.capabilities = refreshedCapabilities;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: 'Open Settings' })).toHaveLength(0),
    );
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

  it('keeps a folder error through note writes, refreshes, cancellation and reopening Preferences', async () => {
    const native = clients();
    const client = {
      ...workspaceClient(snapshot()),
      chooseDirectory: vi.fn().mockResolvedValue('/synthetic/nonempty'),
      openOrCreate: vi.fn().mockRejectedValue({
        code: 'directory_not_empty',
        messageKey: 'workspace_error_directory_not_empty',
      }),
    };
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        workspaceClient={client}
      >
        <WorkspaceActivity />
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Choose…' }));
    expect(await screen.findByText(/Choose an empty folder/)).toBeTruthy();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    await user.click(screen.getByRole('button', { name: 'Refresh notes' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText(/Choose an empty folder/)).toBeTruthy();
    client.chooseDirectory.mockResolvedValueOnce(null);
    await user.click(screen.getByRole('button', { name: 'Choose…' }));
    expect(screen.getByText(/Choose an empty folder/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss folder error' }));
    expect(screen.queryByText(/Choose an empty folder/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Choose…' }));
    expect(await screen.findByText(/Choose an empty folder/)).toBeTruthy();
    client.openOrCreate.mockResolvedValueOnce(snapshot());
    await user.click(screen.getByRole('button', { name: 'Choose…' }));
    await waitFor(() => expect(screen.queryByText(/Choose an empty folder/)).toBeNull());
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

  it('explains manual package installation and links to GitHub Releases', async () => {
    const native = clients({}, 'deb');
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        updateClient={availableUpdate()}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Enable update checks' }));
    expect(await screen.findByText(/This installation was made with a package/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open GitHub Releases' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review update' })).toBeNull();
  });

  it('warns macOS users about permission re-grants in the install dialog', async () => {
    const native = clients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        updateClient={availableUpdate()}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Enable update checks' }));
    await user.click(await screen.findByRole('button', { name: 'Review update' }));
    expect(
      await screen.findByText(/After the update, macOS may ask again for Input Monitoring/),
    ).toBeTruthy();
  });

  it('does not show the macOS permission notice on Windows', async () => {
    const native = clients({ platform: 'windows' });
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        updateClient={availableUpdate()}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Enable update checks' }));
    await user.click(await screen.findByRole('button', { name: 'Review update' }));
    expect(screen.queryByText(/After the update, macOS may ask again/)).toBeNull();
  });
});

describe('experimental platform capture', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });
  it.each(['windows', 'linuxX11'] as const)(
    'labels %s capture experimental without macOS permission actions',
    async (platform) => {
      const native = clients({
        platform,
        doubleShift: 'experimental',
        selectedText: 'experimental',
        inputMonitoring: 'experimental',
        accessibility: 'experimental',
        activeShortcut: 'Alt+Shift+Space',
      });
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
      expect(await screen.findByText(/Experimental selected-text capture/)).toBeTruthy();
      expect(screen.getAllByText('Experimental')).toHaveLength(2);
      expect(native.requestPermission).not.toHaveBeenCalled();
    },
  );
  it('shows the shortcut assigned by the Wayland portal and no double Shift claim', async () => {
    const native = clients({
      platform: 'linuxWayland',
      doubleShift: 'unsupported',
      selectedText: 'unsupported',
      activeShortcut: 'Super+Space',
    });
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
    expect(await screen.findByText('Super + Space')).toBeTruthy();
    expect(screen.queryByText(/Experimental selected-text capture/)).toBeNull();
  });
});
