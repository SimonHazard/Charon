/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tauriConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
);
const tauriBootstrap = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
const mainCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/main.json'), 'utf8'),
);

const csp =
  "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

describe('desktop window contract', () => {
  it('opens the compact first-run shelf without restricting restored window sizes', () => {
    const [mainWindow] = tauriConfig.app.windows;

    expect(mainWindow).toMatchObject({
      label: 'main',
      width: 480,
      height: 720,
      minWidth: 400,
      minHeight: 480,
      resizable: true,
      fullscreen: false,
    });
    expect(mainWindow.maxWidth).toBeUndefined();
    expect(mainWindow.maxHeight).toBeUndefined();
  });

  it('keeps the native saved window state plugin authoritative', () => {
    expect(tauriBootstrap).toContain(
      '.plugin(tauri_plugin_window_state::Builder::default().build())',
    );
  });

  it('pins the production webview content security policy', () => {
    expect(tauriConfig.app.security.csp).toBe(csp);
  });

  it('grants only the named webview permissions used by the shelf', () => {
    expect(mainCapability.permissions).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:window:allow-destroy',
      'core:window:allow-start-dragging',
      'core:window:allow-internal-toggle-maximize',
      'clipboard-manager:allow-write-text',
      {
        identifier: 'opener:allow-open-url',
        scope: {
          allow: [{ url: 'https://github.com/SimonHazard/Charon/releases/latest' }],
        },
      },
      'process:allow-restart',
      'updater:allow-check',
      'updater:allow-download',
      'updater:allow-install',
    ]);
  });

  it('registers exactly the custom commands invoked by the frontend IPC clients', () => {
    const registered = [...tauriBootstrap.matchAll(/ipc::\w+::(\w+),/gu)]
      .map((match) => match[1])
      .sort();
    const ipcDirectory = resolve(process.cwd(), 'src/lib/ipc');
    const invoked = readdirSync(ipcDirectory)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => {
        const source = readFileSync(resolve(ipcDirectory, file), 'utf8');
        return [...source.matchAll(/invoke(?:<[^>]+>)?\('([^']+)'/gu)].map((match) => match[1]);
      })
      .sort();

    expect(registered).toEqual(invoked);
  });

  it('configures native desktop bundles without mobile or download-only installers', () => {
    expect(tauriConfig.bundle.targets).toEqual(
      expect.arrayContaining(['app', 'deb', 'appimage', 'nsis', 'msi']),
    );
    expect(tauriConfig.bundle.windows.webviewInstallMode.type).not.toBe('downloadBootstrapper');
    expect(tauriConfig.bundle.linux.deb.depends).toContain('libwebkit2gtk-4.1-0');
    expect(tauriConfig.bundle.android).toBeUndefined();
  });

  it('pins the signed updater to the public GitHub release endpoint', () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.plugins.updater).toEqual({
      endpoints: ['https://github.com/SimonHazard/Charon/releases/latest/download/latest.json'],
      pubkey:
        'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVBQjExRENFRTEyRjQ0NzgKUldSNFJDL2h6aDJ4NnBQSDNLNGJZSUlIWFZ4Q29XYzBXV1NIZE9ONWV0M3pKT3NLNWw5M1FZN3oK',
    });
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_updater::Builder::new().build())');
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_opener::init())');
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_process::init())');
  });
});
