/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tauriConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
);
const tauriBootstrap = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

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
});
