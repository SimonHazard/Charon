/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const tokensCss = readFileSync(resolve(repositoryRoot, 'packages/theme/src/tokens.css'), 'utf8');
const desktopHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const tauriConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
);
const mainCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/main.json'), 'utf8'),
);
const cargoManifest = readFileSync(resolve(process.cwd(), 'src-tauri/Cargo.toml'), 'utf8');
const appCss = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
const buttonSource = readFileSync(resolve(process.cwd(), 'src/components/ui/button.tsx'), 'utf8');
const inputSource = readFileSync(resolve(process.cwd(), 'src/components/ui/input.tsx'), 'utf8');
const textareaSource = readFileSync(
  resolve(process.cwd(), 'src/components/ui/textarea.tsx'),
  'utf8',
);

const generatedNativeIcons = [
  '32x32.png',
  '64x64.png',
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.icns',
  'icon.ico',
  'StoreLogo.png',
  'Square30x30Logo.png',
  'Square44x44Logo.png',
  'Square71x71Logo.png',
  'Square89x89Logo.png',
  'Square107x107Logo.png',
  'Square142x142Logo.png',
  'Square150x150Logo.png',
  'Square284x284Logo.png',
  'Square310x310Logo.png',
] as const;

const requiredSemanticTokens = [
  '--canvas',
  '--surface',
  '--surface-elevated',
  '--field-surface',
  '--surface-inset',
  '--surface-hover',
  '--surface-pressed',
  '--control-hover',
  '--control-pressed',
  '--text',
  '--text-muted',
  '--text-subtle',
  '--border-subtle',
  '--border-strong',
  '--action',
  '--action-hover',
  '--action-pressed',
  '--action-text',
  '--selection-surface',
  '--selection-subtle',
  '--selection-text',
  '--selection-border',
  '--focus',
  '--separator',
  '--danger',
  '--danger-text',
  '--danger-surface',
  '--danger-hover',
  '--danger-pressed',
  '--warning',
  '--warning-text',
  '--warning-surface',
  '--success',
  '--success-text',
  '--success-surface',
  '--material-transient',
  '--material-transient-solid',
  '--material-scrim',
  '--material-scrim-solid',
  '--font-system',
  '--font-monospace',
  '--radius-surface',
  '--radius-field',
  '--radius-control',
  '--shadow-floating',
  '--shadow-transient',
] as const;

type ThemeFixture = 'light' | 'dark';

function readDeclarations(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)].map((match) => [match[1], match[2].trim()]),
  );
}

function readTheme(theme: ThemeFixture) {
  const primitives = tokensCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
  const themeBlock = tokensCss.match(
    new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`),
  )?.[1];
  if (!primitives || !themeBlock) throw new Error(`Missing ${theme} token block`);

  const values = { ...readDeclarations(primitives), ...readDeclarations(themeBlock) };
  const resolve = (name: string, seen = new Set<string>()): string => {
    if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
    const value = values[name];
    if (!value) throw new Error(`Missing token: ${name}`);
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
    return reference ? resolve(reference, new Set([...seen, name])) : value;
  };

  return resolve;
}

function relativeLuminance(color: string) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (channels?.length !== 3) throw new Error(`Expected a hex color, got ${color}`);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const approvedChecksums = {
  'src/assets/brand/charon-app-icon.svg':
    '4d6874a7fbb883652321d2ae3a4da373606382ed9fee1c1a291e60024ef05dbc',
} as const;

describe('theme token contract', () => {
  it('paints Light before React when no valid preference exists', () => {
    expect(desktopHtml).toContain("? value : 'light'");
    expect(desktopHtml).toContain("dataset.theme = 'light'");
    expect(desktopHtml).not.toContain('solarized');
  });

  it('exposes the complete semantic system and removes obsolete roles', () => {
    for (const token of requiredSemanticTokens) expect(tokensCss).toContain(`${token}:`);
    for (const removedFamily of ['chart', 'sidebar']) {
      expect(tokensCss).not.toContain(`--${removedFamily}-`);
    }
    expect(tokensCss).not.toContain(['--focus', 'ring'].join('-'));
  });

  it.each(['light', 'dark'] as const)('%s meets the required WCAG contrast fixtures', (theme) => {
    const token = readTheme(theme);
    const textPairs = [
      ['--text', '--canvas'],
      ['--text-muted', '--canvas'],
      ['--text-subtle', '--canvas'],
      ['--text', '--surface-hover'],
      ['--text-muted', '--surface-hover'],
      ['--text', '--surface-pressed'],
      ['--text-muted', '--surface-pressed'],
      ['--text', '--control-hover'],
      ['--text-muted', '--control-hover'],
      ['--text', '--control-pressed'],
      ['--text-muted', '--control-pressed'],
      ['--text', '--field-surface'],
      ['--text-muted', '--field-surface'],
      ['--text', '--selection-subtle'],
      ['--text-muted', '--selection-subtle'],
      ['--action-text', '--action'],
      ['--action-text', '--action-hover'],
      ['--action-text', '--action-pressed'],
      ['--selection-text', '--selection-surface'],
      ['--danger', '--canvas'],
      ['--danger-text', '--danger-surface'],
      ['--danger-text', '--danger-hover'],
      ['--danger-text', '--danger-pressed'],
      ['--warning', '--canvas'],
      ['--warning-text', '--warning-surface'],
      ['--success', '--canvas'],
      ['--success-text', '--success-surface'],
    ] as const;
    for (const [foreground, background] of textPairs) {
      expect(
        contrast(token(foreground), token(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    const nonTextPairs = [
      ['--focus', '--canvas'],
      ['--focus', '--surface'],
      ['--focus', '--surface-elevated'],
      ['--focus', '--field-surface'],
      ['--focus', '--selection-surface'],
      ['--focus', '--surface-hover'],
      ['--focus', '--surface-pressed'],
      ['--focus', '--control-hover'],
      ['--focus', '--control-pressed'],
      ['--focus', '--selection-subtle'],
      ['--selection-border', '--selection-surface'],
      ['--selection-border', '--selection-subtle'],
    ] as const;
    for (const [foreground, background] of nonTextPairs) {
      expect(
        contrast(token(foreground), token(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['light', 'dark'] as const)(
    '%s uses an undiluted focus ring with at least 3:1 canvas contrast',
    (theme) => {
      const token = readTheme(theme);
      expect(contrast(token('--focus'), token('--canvas'))).toBeGreaterThanOrEqual(3);
      expect(buttonSource).toContain('focus-visible:ring-ring ');
      expect(inputSource).toContain('focus-visible:ring-ring ');
      expect(textareaSource).toContain('focus-visible:ring-ring ');
      expect(appCss).toContain('var(--focus) 90%');
    },
  );

  it('keeps every copied canonical asset byte-identical', () => {
    for (const [path, expected] of Object.entries(approvedChecksums)) {
      const actual = createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), path)))
        .digest('hex');
      expect(actual, path).toBe(expected);
    }
  });

  it('ships the stable Charon bundle identity and complete generated icon families', () => {
    expect(tauriConfig.productName).toBe('Charon');
    expect(tauriConfig.mainBinaryName).toBe('Charon');
    expect(cargoManifest).toMatch(/\[\[bin\]\]\s+name = "Charon"\s+path = "src\/main\.rs"/u);
    expect(tauriConfig.identifier).toBe('dev.simonhazard.charon');
    expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe('14.0');
    expect(tauriConfig.bundle.macOS.signingIdentity).toBe('-');
    for (const icon of generatedNativeIcons) {
      expect(statSync(resolve(process.cwd(), 'src-tauri/icons', icon)).size, icon).toBeGreaterThan(
        0,
      );
    }
  });

  it('allows only explicit event, window lifecycle, and clipboard commands', () => {
    expect(mainCapability.permissions).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:window:allow-destroy',
      'core:window:allow-start-dragging',
      'core:window:allow-internal-toggle-maximize',
      'clipboard-manager:allow-write-text',
      'process:allow-restart',
      'updater:allow-check',
      'updater:allow-download',
      'updater:allow-install',
    ]);
  });
});
