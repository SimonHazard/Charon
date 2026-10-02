/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { themeMediaQuery, themeStorageKey } from '@charon/theme/theme-contract';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { CaptureCapabilities } from '@/bindings/capture';
import type { PreferencesSnapshot } from '@/bindings/preferences';
import { ShelfActions } from '@/components/shelf-chrome';
import type { UpdateClient } from '@/features/updates/update-client';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { setMediaQuery } from '@/test/setup';
import { shellClients } from '@/test/shell-fixture';
import { iconOnlyControlsWithoutTooltip } from '@/test/tooltip-contract';
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
  defaultShortcut: 'CmdOrCtrl+Shift+Space',
  shortcutOrigin: 'default',
  shortcutConfigurable: true,
} as const;

function clients(
  overrides: Partial<CaptureCapabilities> = {},
  installKind: 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'macos' | 'unknown' = 'unknown',
  background: Partial<
    Pick<
      PreferencesSnapshot,
      | 'backgroundMode'
      | 'trayAvailability'
      | 'backgroundActive'
      | 'captureNotifications'
      | 'richCapture'
    >
  > = {},
) {
  // Like Rust: only the macOS adapter offers formatted capture (ADR 0026).
  const resolvedCapabilities: CaptureCapabilities = {
    ...capabilities,
    richCapture:
      (overrides.platform ?? capabilities.platform) === 'macos' ? 'experimental' : 'unsupported',
    ...overrides,
  };
  const requestPermission = vi.fn().mockResolvedValue(resolvedCapabilities);
  // Like Rust: a value becomes the active custom accelerator, null restores the default.
  const setShortcut = vi.fn(
    async (shortcut: string | null): Promise<CaptureCapabilities> => ({
      ...resolvedCapabilities,
      activeShortcut: shortcut ?? resolvedCapabilities.defaultShortcut,
      shortcutOrigin: shortcut ? 'custom' : 'default',
      standardShortcut: 'available',
    }),
  );
  const captureClient: CaptureClient = {
    capabilities: vi.fn().mockResolvedValue(resolvedCapabilities),
    open: vi.fn().mockResolvedValue(resolvedCapabilities),
    requestPermission,
    setShortcut,
    composerReady: vi.fn().mockResolvedValue(undefined),
    subscribeComposerFocus: vi.fn().mockResolvedValue(() => undefined),
    subscribeStatus: vi.fn().mockResolvedValue(() => undefined),
  };
  const preferences: PreferencesSnapshot = {
    schemaVersion: 1,
    workspaceName: 'Charon Notes',
    hasRememberedWorkspace: true,
    installKind,
    backgroundMode: false,
    trayAvailability: 'available',
    backgroundActive: false,
    captureNotifications: false,
    richCapture: false,
    ...background,
  };
  const setBackgroundMode = vi.fn(async (enabled: boolean) => ({
    ...preferences,
    backgroundMode: enabled,
    backgroundActive: enabled,
  }));
  const setCaptureNotifications = vi.fn(async (enabled: boolean) => ({
    ...preferences,
    captureNotifications: enabled,
  }));
  const setRichCapture = vi.fn(async (enabled: boolean) => ({
    ...preferences,
    richCapture: enabled,
  }));
  const preferencesClient: NativePreferencesClient = {
    read: vi.fn().mockResolvedValue(preferences),
    reset: vi.fn(),
    setBackgroundMode,
    setCaptureNotifications,
    setRichCapture,
  };
  return {
    captureClient,
    preferencesClient,
    requestPermission,
    setBackgroundMode,
    setCaptureNotifications,
    setRichCapture,
    setShortcut,
  };
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

// The modal dialog hides the shelf from the accessibility tree, so read the popup state directly.
const preferencesOpen = () =>
  document.querySelector('.preferences-popover')?.hasAttribute('data-open') ?? false;

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
    vi.mocked(openUrl).mockClear();
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
    for (const heading of [
      'Appearance',
      'Language',
      'Notes folder',
      'Capture',
      'Updates',
      'About',
    ]) {
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
    const language = screen.getByRole('combobox', { name: 'Language' });
    expect(language.textContent).toContain('English');
    await user.click(language);
    await user.click(await screen.findByRole('option', { name: 'Français' }));
    expect(document.documentElement.lang).toBe('fr');
    expect(screen.getByRole('combobox', { name: 'Langue' }).textContent).toContain('Français');
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

  it('keeps detailed capture disclosures in toggletips', async () => {
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
    const inputMonitoring = await screen.findByRole('button', { name: 'About Input Monitoring' });

    // Hover still reveals the description, now in a Popover rather than a Tooltip.
    await user.hover(inputMonitoring);
    const content = await screen.findByText(disclosure);
    expect(content.closest('[data-slot="popover-content"]')).not.toBeNull();
    expect(content.closest('[data-slot="tooltip-content"]')).toBeNull();
    await user.unhover(inputMonitoring);
    await waitFor(() => expect(screen.queryByText(disclosure)).toBeNull());

    // A click opens it for keyboard and screen-reader users; Escape closes only the toggletip.
    await user.click(inputMonitoring);
    expect(await screen.findByText(disclosure)).toBeTruthy();
    expect(inputMonitoring.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText(disclosure)).toBeNull());
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(inputMonitoring));

    // A touch tap opens it too.
    const portable = screen.getByRole('button', { name: 'About the portable shortcut' });
    await user.pointer({ keys: '[TouchA]', target: portable });
    expect(await screen.findByText(/Shows Charon/)).toBeTruthy();
    expect(portable.getAttribute('aria-expanded')).toBe('true');
  });

  it('names every icon-only Preferences and Help control in a Tooltip', async () => {
    const native = clients({ accessibility: 'denied' });
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
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findAllByRole('button', { name: /^About / })).toHaveLength(3);
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);

    // The themed language Select names itself with visible text, so it needs no Tooltip.
    const language = screen.getByRole('combobox', { name: 'Language' });
    expect(language.hasAttribute('data-tooltip-trigger')).toBe(false);
    await user.click(language);
    await screen.findByRole('option', { name: 'Français' });
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(preferencesOpen()).toBe(false));

    // Help, including its Notes shortcut section, holds text and kbd only.
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeTruthy();
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
  });

  it('closes Preferences with one Escape while a toggle shows its Tooltip', async () => {
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
    const settings = screen.getByRole('button', { name: 'Settings' });
    settings.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(preferencesOpen()).toBe(true));
    const system = screen.getByRole('button', { name: 'System' });
    if (document.activeElement !== system) system.focus();
    const tooltip = () =>
      [...document.querySelectorAll('[data-slot="tooltip-content"]')].find(
        (element) => element.textContent === 'System',
      );
    await waitFor(() => expect(tooltip()).toBeTruthy());

    // A Tooltip never claims Escape: the key closes it and Preferences together.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(preferencesOpen()).toBe(false));
    await waitFor(() => expect(tooltip()).toBeUndefined());
    await waitFor(() => expect(document.activeElement).toBe(settings));
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
      chooseDirectory: vi.fn().mockResolvedValue({ token: 'synthetic-nonempty-token' }),
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
      chooseDirectory: vi.fn().mockResolvedValue({ token: 'synthetic-new-token' }),
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

  it('shows the version and license without requesting anything', async () => {
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
    const about = screen.getByRole('region', { name: 'About' });
    expect(within(about).getByText(`Charon ${__CHARON_VERSION__}`)).toBeTruthy();
    expect(within(about).getByText(/MIT License/)).toBeTruthy();
    expect(within(about).queryByRole('link')).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens each GitHub link only on explicit activation', async () => {
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
    const repository = screen.getByRole('button', { name: 'Source code on GitHub' });
    const contributing = screen.getByRole('button', { name: 'How to contribute' });
    for (const button of [repository, contributing]) {
      expect(button.getAttribute('aria-describedby')).toBe('preferences-about-links');
    }
    expect(document.getElementById('preferences-about-links')?.textContent).toBe(
      'These links open in your default browser only when you choose them.',
    );
    expect(openUrl).not.toHaveBeenCalled();
    await user.click(repository);
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenLastCalledWith('https://github.com/SimonHazard/Charon');
    await user.click(contributing);
    expect(openUrl).toHaveBeenCalledTimes(2);
    expect(openUrl).toHaveBeenLastCalledWith(
      'https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md',
    );
    expect(preferencesOpen()).toBe(true);
  });

  it('keeps a browser-opening failure local and retryable', async () => {
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
    vi.mocked(openUrl).mockRejectedValueOnce(new Error('denied'));
    const repository = screen.getByRole('button', { name: 'Source code on GitHub' });
    await user.click(repository);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The browser could not be opened');
    expect(within(screen.getByRole('region', { name: 'About' })).getByRole('alert')).toBe(alert);
    expect(preferencesOpen()).toBe(true);
    await user.click(repository);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(openUrl).toHaveBeenCalledTimes(2);
    expect(preferencesOpen()).toBe(true);
  });

  it('matches the desktop manifest version', () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(__CHARON_VERSION__).toBe(manifest.version);
  });

  it('warns Windows that installing closes Charon and keeps it draft-safe', async () => {
    const native = clients({ platform: 'windows' }, 'nsis');
    const install = vi.fn().mockResolvedValue(undefined);
    const updateClient: UpdateClient = {
      check: vi.fn().mockResolvedValue({
        version: '0.2.0',
        notes: 'A small update.',
        download: vi.fn().mockResolvedValue(undefined),
        install,
        close: vi.fn().mockResolvedValue(undefined),
      }),
      relaunch: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        updateClient={updateClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <DirtyDraftControl />
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Enable update checks' }));
    await user.click(await screen.findByRole('button', { name: 'Review update' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/Charon closes to install the update and reopens/),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Download and install' }));

    // The download stops before the step that closes Charon; installing needs a second click.
    const closeAndInstall = await within(dialog).findByRole('button', {
      name: 'Close and install',
    });
    expect((closeAndInstall as HTMLButtonElement).disabled).toBe(false);
    expect(install).not.toHaveBeenCalled();
    // "Close and install" and Cancel are text actions; no icon-only control lacks a Tooltip.
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Make draft dirty' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const blocked = await screen.findByRole('button', { name: 'Close and install' });
    expect((blocked as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Charon closes to install the update and reopens/)).toBeTruthy();
    expect(
      screen.getByText('Finish saving the open note or composer draft before installing.'),
    ).toBeTruthy();
    await user.click(blocked);
    expect(install).not.toHaveBeenCalled();
  });

  it('keeps Preferences open and focus predictable around the install dialog', async () => {
    const native = clients();
    let finishDownload: () => void = () => undefined;
    const download = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        }),
    );
    const updateClient: UpdateClient = {
      check: vi.fn().mockResolvedValue({
        version: '0.2.0',
        notes: 'A small update.',
        download,
        install: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      relaunch: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        updateClient={updateClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Enable update checks' }));
    const review = await screen.findByRole('button', { name: 'Review update' });
    await user.click(review);

    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(preferencesOpen()).toBe(true);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Review update' })),
    );
    expect(preferencesOpen()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Review update' }));
    const reopened = await screen.findByRole('alertdialog');
    await user.click(within(reopened).getByRole('button', { name: 'Download and install' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Downloading the signed update…')).toBeTruthy();
    expect(preferencesOpen()).toBe(true);
    finishDownload();
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
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/After the update, macOS may ask again for Input Monitoring/),
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
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('A small update.')).toBeTruthy();
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
      defaultShortcut: 'Alt+Shift+Space',
      shortcutOrigin: 'desktop',
      shortcutConfigurable: false,
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

describe('composer shortcut', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  async function openPreferences(native: ReturnType<typeof clients>) {
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
    await screen.findByRole('button', { name: 'Change…' });
    return user;
  }

  const recorder = () =>
    screen.getByRole('textbox', { name: 'Press the new shortcut, or Escape to cancel' });

  it('records a new shortcut from the next key combination and shows it at once', async () => {
    const native = clients({ platform: 'windows', activeShortcut: 'Alt+Shift+Space' });
    native.captureClient.capabilities = vi.fn().mockResolvedValue({
      ...capabilities,
      platform: 'windows',
      activeShortcut: 'Alt+Shift+Space',
      defaultShortcut: 'Alt+Shift+Space',
    });
    const user = await openPreferences(native);
    expect(screen.getByText('Alt + Shift + Space').tagName).toBe('KBD');

    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));
    // Modifiers alone keep the recorder waiting and show what is held.
    await user.keyboard('{Control>}{Alt>}');
    expect(recorder().textContent).toBe('Ctrl + Alt');
    expect(native.setShortcut).not.toHaveBeenCalled();
    await user.keyboard('n{/Alt}{/Control}');

    expect(native.setShortcut).toHaveBeenCalledExactlyOnceWith('Ctrl+Alt+N');
    expect((await screen.findByText('Ctrl + Alt + N')).tagName).toBe('KBD');
    expect(screen.queryByRole('textbox')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change…' })),
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(preferencesOpen()).toBe(true);
  });

  it('keeps waiting with a hint for a key Charon cannot use', async () => {
    const native = clients();
    const user = await openPreferences(native);
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));

    await user.keyboard('{Shift>}a{/Shift}');
    // The macOS shortcut backend stops at F20.
    expect(recorder().textContent).toBe(
      'Use a letter, a digit, Space, or F1–F20 with at least two modifier keys.',
    );
    await user.keyboard('{Control>}{Alt>}{Enter}{/Alt}{/Control}');
    await user.keyboard('{Control>}{Alt>}{F21}{/Alt}{/Control}');
    expect(native.setShortcut).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(recorder());
  });

  it('names F24 as the last usable function key on Windows', async () => {
    const native = clients({
      platform: 'windows',
      activeShortcut: 'Alt+Shift+Space',
      defaultShortcut: 'Alt+Shift+Space',
    });
    const user = await openPreferences(native);
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));

    await user.keyboard('{Shift>}a{/Shift}');
    expect(recorder().textContent).toBe(
      'Use a letter, a digit, Space, or F1–F24 with at least two modifier keys.',
    );
    expect(native.setShortcut).not.toHaveBeenCalled();
  });

  it('cancels recording with Escape and keeps Preferences open', async () => {
    const native = clients();
    const user = await openPreferences(native);
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(preferencesOpen()).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change…' })),
    );
    expect(native.setShortcut).not.toHaveBeenCalled();
    expect(screen.getByText('⌘ + ⇧ + Space').tagName).toBe('KBD');
  });

  it('leaves recording with Tab without capturing it', async () => {
    const native = clients();
    const user = await openPreferences(native);
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));

    await user.keyboard('{Tab}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(native.setShortcut).not.toHaveBeenCalled();
    expect(preferencesOpen()).toBe(true);
  });

  it('keeps the previous shortcut and explains a refused one beside the row', async () => {
    const native = clients();
    native.setShortcut.mockRejectedValueOnce({
      code: 'shortcut_conflict',
      messageKey: 'capture_error_shortcut_conflict',
    });
    const user = await openPreferences(native);
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    await waitFor(() => expect(document.activeElement).toBe(recorder()));
    await user.keyboard('{Meta>}{Control>}n{/Control}{/Meta}');

    expect(native.setShortcut).toHaveBeenCalledExactlyOnceWith('Cmd+Ctrl+N');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The system refused this shortcut; another app may use it. Your previous shortcut stays active.',
    );
    expect(screen.getByText('⌘ + ⇧ + Space').tagName).toBe('KBD');
    expect(screen.queryByText('⌘ + ⌃ + N')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('offers Reset only for a custom shortcut and restores the default', async () => {
    const native = clients({ activeShortcut: 'Cmd+Ctrl+N', shortcutOrigin: 'custom' });
    const user = await openPreferences(native);
    expect(screen.getByText('⌘ + ⌃ + N').tagName).toBe('KBD');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(native.setShortcut).toHaveBeenCalledExactlyOnceWith(null);
    expect((await screen.findByText('⌘ + ⇧ + Space')).tagName).toBe('KBD');
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change…' })),
    );
  });

  it('says so when a stored shortcut could not be registered at launch', async () => {
    const native = clients({ shortcutOrigin: 'defaultAfterFailure' });
    await openPreferences(native);
    expect(
      screen.getByText('Your chosen shortcut could not be registered, so the default is active.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('states on macOS that every conflict cannot be detected', async () => {
    await openPreferences(clients());
    expect(screen.getByText(/can’t detect every shortcut used by macOS/)).toBeTruthy();
    cleanup();
    await openPreferences(clients({ platform: 'windows', activeShortcut: 'Alt+Shift+Space' }));
    expect(screen.queryByText(/can’t detect every shortcut/)).toBeNull();
  });

  it('shows the portal shortcut and where to change it on Wayland, with no Change button', async () => {
    const native = clients({
      platform: 'linuxWayland',
      doubleShift: 'unsupported',
      selectedText: 'unsupported',
      inputMonitoring: 'unsupported',
      accessibility: 'unsupported',
      activeShortcut: 'Super+Space',
      defaultShortcut: 'Alt+Shift+Space',
      shortcutOrigin: 'desktop',
      shortcutConfigurable: false,
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
    expect((await screen.findByText('Super + Space')).tagName).toBe('KBD');
    expect(
      screen.getByText('Your desktop manages this shortcut. Change it in its keyboard settings.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    expect(native.setShortcut).not.toHaveBeenCalled();
  });

  it('localizes the shortcut controls in French', async () => {
    applyLocale('fr');
    const native = clients({ activeShortcut: 'Cmd+Ctrl+N', shortcutOrigin: 'custom' });
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
    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByRole('button', { name: 'Réinitialiser' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Modifier…' }));
    expect(
      await screen.findByRole('textbox', {
        name: 'Appuyez sur le nouveau raccourci, ou Échap pour annuler',
      }),
    ).toBeTruthy();
  });
});

describe('background mode', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  async function openBackground(native: ReturnType<typeof clients>) {
    const shell = shellClients();
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
        shellClient={shell.shellClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const section = await screen.findByRole('region', { name: 'Background' });
    return { section, shell };
  }

  it('adds the macOS menu bar icon on request and offers Quit only while it exists', async () => {
    const native = clients();
    const { section } = await openBackground(native);
    expect(within(section).getByText(/adds a menu bar icon/)).toBeTruthy();
    const toggle = within(section).getByRole('button', { name: 'Enable background mode' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(within(section).queryByRole('button', { name: 'Quit Charon' })).toBeNull();

    await userEvent.click(toggle);
    expect(native.setBackgroundMode).toHaveBeenCalledExactlyOnceWith(true);
    const active = await within(section).findByRole('button', { name: 'Disable background mode' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(within(section).getByRole('button', { name: 'Quit Charon' })).toBeTruthy();

    await userEvent.click(active);
    expect(native.setBackgroundMode).toHaveBeenLastCalledWith(false);
    await within(section).findByRole('button', { name: 'Enable background mode' });
    expect(within(section).queryByRole('button', { name: 'Quit Charon' })).toBeNull();
  });

  it('describes the Windows notification area', async () => {
    const native = clients({ platform: 'windows', activeShortcut: 'Alt+Shift+Space' });
    const { section } = await openBackground(native);
    expect(within(section).getByText(/keeps Charon running in the notification area/)).toBeTruthy();
  });

  it('disables the toggle with a visible reason where no tray exists', async () => {
    const native = clients(
      {
        platform: 'linuxX11',
        doubleShift: 'experimental',
        selectedText: 'experimental',
        inputMonitoring: 'experimental',
        accessibility: 'experimental',
        activeShortcut: 'Alt+Shift+Space',
      },
      'deb',
      { trayAvailability: 'unavailable' },
    );
    const { section } = await openBackground(native);
    const toggle = within(section).getByRole('button', { name: 'Enable background mode' });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    const reason = within(section).getByText(
      'Background mode is not available on this system yet. Closing the window quits Charon.',
    );
    expect(toggle.getAttribute('aria-describedby')).toBe(reason.id);
    expect(native.setBackgroundMode).not.toHaveBeenCalled();
  });

  it('keeps the toggle off and explains a tray failure beside it', async () => {
    const native = clients();
    native.setBackgroundMode.mockRejectedValueOnce({
      code: 'tray_unavailable',
      messageKey: 'preferences_error_tray_unavailable',
    });
    const { section } = await openBackground(native);
    await userEvent.click(within(section).getByRole('button', { name: 'Enable background mode' }));

    expect((await within(section).findByRole('alert')).textContent).toBe(
      'The menu bar or notification area icon could not be shown, so background mode is off.',
    );
    expect(
      within(section)
        .getByRole('button', { name: 'Enable background mode' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('warns when a remembered background mode could not show its icon', async () => {
    const native = clients({}, 'macos', { backgroundMode: true, backgroundActive: false });
    const { section } = await openBackground(native);
    expect(
      within(section).getByText(
        'The menu bar or notification area icon could not be shown, so background mode is off.',
      ),
    ).toBeTruthy();
  });

  it('quits from Preferences through the same draft guard as the tray', async () => {
    const native = clients({}, 'macos', { backgroundMode: true, backgroundActive: true });
    const { section, shell } = await openBackground(native);
    await userEvent.click(within(section).getByRole('button', { name: 'Quit Charon' }));
    await waitFor(() => expect(shell.shellClient.quit).toHaveBeenCalledTimes(1));
    expect(shell.shellClient.cancelQuit).not.toHaveBeenCalled();
  });

  it('shows no Background section without the native runtime', async () => {
    render(
      <AppProviders workspaceClient={workspaceClient(snapshot())}>
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Updates' });
    expect(screen.queryByRole('heading', { name: 'Background' })).toBeNull();
  });
});

describe('capture notifications', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  async function openNotifications(native: ReturnType<typeof clients>) {
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
    return screen.findByRole('group', { name: 'Capture notifications' });
  }

  it('is off by default and persists the choice through the native client', async () => {
    const native = clients();
    const group = await openNotifications(native);
    const toggle = within(group).getByRole('button', { name: 'Enable capture notifications' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(toggle);
    expect(native.setCaptureNotifications).toHaveBeenCalledExactlyOnceWith(true);
    const enabled = await within(group).findByRole('button', {
      name: 'Disable capture notifications',
    });
    expect(enabled.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(enabled);
    expect(native.setCaptureNotifications).toHaveBeenLastCalledWith(false);
    await within(group).findByRole('button', { name: 'Enable capture notifications' });
  });

  it('says plainly, without hovering, that the system permission cannot be checked', async () => {
    const native = clients({}, 'macos', { captureNotifications: true });
    const group = await openNotifications(native);
    const unverified = within(group).getByText(
      'Charon can’t check whether your system allows its notifications. If none appear, allow Charon in your system’s notification settings.',
    );
    expect(unverified.closest('[data-slot="popover-content"]')).not.toBeNull();
    expect(unverified.closest('[data-slot="tooltip-content"]')).toBeNull();
    const toggle = within(group).getByRole('button', { name: 'Disable capture notifications' });
    expect(toggle.getAttribute('aria-describedby')?.split(' ')).toContain(unverified.id);
    expect(within(group).getByText(/never includes the note’s text/)).toBeTruthy();
    expect(within(group).queryByText(/permission needed/i)).toBeNull();
  });

  it('keeps the toggle off and explains a failed save beside it', async () => {
    const native = clients();
    native.setCaptureNotifications.mockRejectedValueOnce({
      code: 'io',
      messageKey: 'preferences_error_io',
    });
    const group = await openNotifications(native);
    await userEvent.click(
      within(group).getByRole('button', { name: 'Enable capture notifications' }),
    );

    expect((await within(group).findByRole('alert')).textContent).toBeTruthy();
    expect(
      within(group)
        .getByRole('button', { name: 'Enable capture notifications' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('is offered on Windows and X11 but never where double Shift is unsupported', async () => {
    const windows = clients({ platform: 'windows', activeShortcut: 'Alt+Shift+Space' }, 'nsis');
    expect(await openNotifications(windows)).toBeTruthy();
    cleanup();

    const wayland = clients(
      {
        platform: 'linuxWayland',
        doubleShift: 'unsupported',
        selectedText: 'unsupported',
        inputMonitoring: 'unsupported',
        accessibility: 'unsupported',
        activeShortcut: '',
        defaultShortcut: 'Alt+Shift+Space',
        shortcutOrigin: 'desktop',
        shortcutConfigurable: false,
      },
      'deb',
    );
    render(
      <AppProviders
        captureClient={wayland.captureClient}
        preferencesClient={wayland.preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByText(/selected-text capture is not claimed/i);
    expect(screen.queryByRole('group', { name: 'Capture notifications' })).toBeNull();
    expect(wayland.setCaptureNotifications).not.toHaveBeenCalled();
  });

  it('shows no notification control without the native runtime', async () => {
    render(
      <AppProviders workspaceClient={workspaceClient(snapshot())}>
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Updates' });
    expect(screen.queryByRole('group', { name: 'Capture notifications' })).toBeNull();
  });
});

describe('formatted capture', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLocale('en');
  });

  async function openPreferences(native: ReturnType<typeof clients>) {
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
  }

  it('is off by default on macOS and persists the choice through the native client', async () => {
    const native = clients({}, 'macos');
    await openPreferences(native);
    const group = await screen.findByRole('group', { name: 'Keep formatting' });
    const toggle = within(group).getByRole('button', { name: 'Enable formatting' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(toggle);
    expect(native.setRichCapture).toHaveBeenCalledExactlyOnceWith(true);
    const enabled = await within(group).findByRole('button', { name: 'Disable formatting' });
    expect(enabled.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(enabled);
    expect(native.setRichCapture).toHaveBeenLastCalledWith(false);
    await within(group).findByRole('button', { name: 'Enable formatting' });
  });

  it('marks the setting experimental and discloses the extra read without hovering', async () => {
    const native = clients({}, 'macos', { richCapture: true });
    await openPreferences(native);
    const group = await screen.findByRole('group', { name: 'Keep formatting' });
    const state = within(group).getByText('Experimental');
    const description = within(group).getByText(/also reads the formatted copy/);
    expect(description.textContent).toContain('keeps the plain text');
    expect(description.textContent).toContain('Nothing else is read or stored');
    expect(description.closest('[data-slot="tooltip-content"]')).toBeNull();
    const toggle = within(group).getByRole('button', { name: 'Disable formatting' });
    expect(toggle.getAttribute('aria-describedby')?.split(' ')).toEqual([state.id, description.id]);
  });

  it('keeps the toggle off and explains a failed save beside it', async () => {
    const native = clients({}, 'macos');
    native.setRichCapture.mockRejectedValueOnce({
      code: 'io',
      messageKey: 'preferences_error_io',
    });
    await openPreferences(native);
    const group = await screen.findByRole('group', { name: 'Keep formatting' });
    await userEvent.click(within(group).getByRole('button', { name: 'Enable formatting' }));

    expect((await within(group).findByRole('alert')).textContent).toBeTruthy();
    expect(
      within(group).getByRole('button', { name: 'Enable formatting' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('is not offered on Windows or Linux', async () => {
    for (const [platform, installKind] of [
      ['windows', 'nsis'],
      ['linuxX11', 'deb'],
    ] as const) {
      const native = clients({ platform, activeShortcut: 'Alt+Shift+Space' }, installKind);
      await openPreferences(native);
      await screen.findByRole('group', { name: 'Capture notifications' });
      expect(screen.queryByRole('group', { name: 'Keep formatting' })).toBeNull();
      expect(native.setRichCapture).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('shows no formatting control without the native runtime', async () => {
    render(
      <AppProviders workspaceClient={workspaceClient(snapshot())}>
        <ShelfActions />
      </AppProviders>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Updates' });
    expect(screen.queryByRole('group', { name: 'Keep formatting' })).toBeNull();
  });
});
