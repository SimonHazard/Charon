/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tauriCaptureClient } from '@/lib/ipc/capture-client';
import { tauriClipboardClient } from '@/lib/ipc/clipboard-client';
import { tauriPreferencesClient } from '@/lib/ipc/preferences-client';
import { tauriShellClient } from '@/lib/ipc/shell-client';
import { tauriWorkspaceClient } from '@/lib/ipc/workspace-client';

type Call = { command: string; args: Record<string, unknown> };

const rustSource = (file: string) =>
  readFileSync(resolve(process.cwd(), 'src-tauri/src', file), 'utf8');

/** Tauri injects these parameters itself; the webview never sends them. */
const injectedParameter = /^(?:tauri::)?(?:AppHandle|State|Window|WebviewWindow)\b/u;

/**
 * The camelCase argument keys Tauri expects for each registered custom
 * command, read from the Rust signatures.
 */
function rustArgumentKeys(): Map<string, string[]> {
  const handler = rustSource('lib.rs').match(/tauri::generate_handler!\[([\s\S]*?)\]/u)?.[1] ?? '';
  const keys = new Map<string, string[]>();
  for (const [, module, command] of handler.matchAll(/ipc::(\w+)::(\w+),/gu)) {
    const signature = rustSource(`ipc/${module}.rs`).match(
      new RegExp(
        `#\\[tauri::command[^\\]]*\\]\\s*pub (?:async )?fn ${command}\\(([\\s\\S]*?)\\)\\s*(?:->|\\{)`,
        'u',
      ),
    )?.[1];
    if (signature === undefined) throw new Error(`Rust command ${command} not found`);
    const parameters = [...signature.matchAll(/(\w+):\s*([^,<]+(?:<[^>]*>)?)/gu)]
      .filter(([, , type]) => !injectedParameter.test((type ?? '').trim()))
      .map(([, name]) =>
        (name ?? '').replace(/_(\w)/gu, (_, letter: string) => letter.toUpperCase()),
      );
    keys.set(command as string, parameters.sort());
  }
  return keys;
}

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  // Event-plugin requests reach this handler too, so subscriptions are recorded.
  mockIPC((command, payload) => {
    calls.push({ command, args: { ...((payload ?? {}) as Record<string, unknown>) } });
    return null;
  });
});

afterEach(() => {
  clearMocks();
});

async function sent(call: () => unknown): Promise<Call> {
  calls = [];
  await call();
  expect(calls).toHaveLength(1);
  return calls[0] as Call;
}

/** One call per client method that reaches a custom Rust command. */
const clientCalls = [
  ['workspace_snapshot', () => tauriWorkspaceClient.snapshot()],
  ['workspace_bootstrap', () => tauriWorkspaceClient.bootstrap?.()],
  ['workspace_bootstrap_default', () => tauriWorkspaceClient.bootstrapDefault?.()],
  ['workspace_choose_directory', () => tauriWorkspaceClient.chooseDirectory?.()],
  ['workspace_choose_attachments', () => tauriWorkspaceClient.chooseAttachments?.()],
  ['workspace_open_or_create', () => tauriWorkspaceClient.openOrCreate?.({ token: 'folder' })],
  [
    'workspace_execute',
    () => tauriWorkspaceClient.execute?.({ type: 'createNote', expectedRevision: 0, body: 'Body' }),
  ],
  [
    'clipboard_compose_and_write',
    () => tauriClipboardClient.composeAndWrite({ expectedRevision: 0, noteId: 'note-1' }),
  ],
  ['capture_capabilities', () => tauriCaptureClient.capabilities()],
  ['capture_open', () => tauriCaptureClient.open()],
  ['capture_request_permission', () => tauriCaptureClient.requestPermission('accessibility')],
  ['capture_composer_ready', () => tauriCaptureClient.composerReady()],
  ['capture_set_shortcut', () => tauriCaptureClient.setShortcut('Ctrl+Alt+N')],
  ['preferences_read', () => tauriPreferencesClient.read()],
  ['preferences_reset', () => tauriPreferencesClient.reset()],
  ['preferences_set_background_mode', () => tauriPreferencesClient.setBackgroundMode(true)],
  [
    'preferences_set_capture_notifications',
    () => tauriPreferencesClient.setCaptureNotifications(true),
  ],
  ['preferences_set_rich_capture', () => tauriPreferencesClient.setRichCapture(true)],
  [
    'shell_set_labels',
    () =>
      tauriShellClient.setLabels({
        trayOpen: 'Open Charon',
        trayQuit: 'Quit Charon',
        trayTooltip: 'Charon',
        notificationTitle: 'Charon',
        notificationBody: 'Note captured.',
      }),
  ],
  ['shell_quit', () => tauriShellClient.quit()],
  ['shell_cancel_quit', () => tauriShellClient.cancelQuit()],
] as const;

describe('IPC argument contract', () => {
  const rust = rustArgumentKeys();

  it('exercises every registered custom command', () => {
    expect(clientCalls.map(([command]) => command).sort()).toEqual([...rust.keys()].sort());
  });

  it.each(clientCalls)('%s sends exactly the Rust argument keys', async (command, call) => {
    const request = await sent(call);

    expect(request.command).toBe(command);
    expect(Object.keys(request.args).sort()).toEqual(rust.get(command));
  });

  it('sends a composer shortcut reset as an explicit null', async () => {
    const request = await sent(() => tauriCaptureClient.setShortcut(null));

    expect(request).toEqual({ command: 'capture_set_shortcut', args: { shortcut: null } });
  });

  it('opens a picked folder by its token only, never by a path', async () => {
    const request = await sent(() =>
      tauriWorkspaceClient.openOrCreate?.({ token: 'folder-token' }),
    );

    expect(request.args).toEqual({ token: 'folder-token' });
  });

  it.each([
    ['workspace://changed', () => tauriWorkspaceClient.subscribe(() => undefined)],
    [
      'capture://composer-focus-requested',
      () => tauriCaptureClient.subscribeComposerFocus(() => undefined),
    ],
    ['capture://status', () => tauriCaptureClient.subscribeStatus(() => undefined)],
    ['shell://quit-requested', () => tauriShellClient.subscribeQuitRequest(() => undefined)],
  ] as const)('listens to %s through the event plugin', async (event, subscribe) => {
    const request = await sent(subscribe);

    expect(request.command).toBe('plugin:event|listen');
    expect(request.args.event).toBe(event);
  });
});
