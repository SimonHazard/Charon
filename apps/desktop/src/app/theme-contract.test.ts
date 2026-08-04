/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const tokensCss = readFileSync(resolve(repositoryRoot, 'packages/theme/src/tokens.css'), 'utf8');
const desktopHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

const requiredSemanticTokens = [
  '--canvas',
  '--surface',
  '--surface-elevated',
  '--surface-inset',
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
  '--selection-text',
  '--selection-border',
  '--focus',
  '--danger',
  '--danger-text',
  '--danger-surface',
  '--warning',
  '--warning-text',
  '--warning-surface',
  '--success',
  '--success-text',
  '--success-surface',
  '--material-titlebar',
  '--material-titlebar-solid',
  '--material-transient',
  '--material-transient-solid',
  '--font-system',
  '--font-monospace',
  '--radius-surface',
  '--radius-field',
  '--radius-control',
  '--shadow-floating',
] as const;

type ThemeFixture = 'light' | 'solarized' | 'dark';

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
  'src/assets/brand/charon-icon-lavender.svg':
    '54dfbefe7e8900315ecacaa095b5813790df69a771df1eb3da9c5b072b62f785',
  'src/assets/brand/charon-icon-dark.svg':
    'e1b28047e915c483bcb53918c9770608239efa1a1bc235d41fc168886c6d0283',
  'src/assets/brand/charon-icon-light.svg':
    'a756df75f47e6aa094a6f02f11f3a4e1184c8a92a6352f817f7cf01ba0213758',
  'src/assets/brand/charon-wordmark-color.svg':
    '312bc0ef2f5ec7ac90ba5306f20c6bf05af143ede6d06ef9602ca7b2cc75abc7',
  'src/assets/brand/charon-wordmark-reversed.svg':
    '9b506740e53ce12545799ebb019c251b9b7db88d4e0dbc250a1cdcd50cf858f1',
  'src-tauri/icons/charon-app-icon-1024.png':
    '301bd102040763a2d33460f6433d483831d9fff5433fb0405a17ba05b550dea6',
} as const;

describe('theme token contract', () => {
  it('paints Solarized before React when no valid preference exists', () => {
    expect(desktopHtml).toContain("? value : 'solarized'");
    expect(desktopHtml).toContain("dataset.theme = 'solarized'");
  });

  it('exposes the complete semantic system and removes obsolete roles', () => {
    for (const token of requiredSemanticTokens) expect(tokensCss).toContain(`${token}:`);
    for (const removedFamily of ['chart', 'sidebar']) {
      expect(tokensCss).not.toContain(`--${removedFamily}-`);
    }
    expect(tokensCss).not.toContain(['--focus', 'ring'].join('-'));
  });

  it.each(['light', 'solarized', 'dark'] as const)(
    '%s meets the required WCAG contrast fixtures',
    (theme) => {
      const token = readTheme(theme);
      const textPairs = [
        ['--text', '--canvas'],
        ['--text-muted', '--canvas'],
        ['--text-subtle', '--canvas'],
        ['--action-text', '--action'],
        ['--action-text', '--action-hover'],
        ['--action-text', '--action-pressed'],
        ['--selection-text', '--selection-surface'],
        ['--danger', '--canvas'],
        ['--danger-text', '--danger-surface'],
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
        ['--focus', '--selection-surface'],
        ['--selection-border', '--selection-surface'],
      ] as const;
      for (const [foreground, background] of nonTextPairs) {
        expect(
          contrast(token(foreground), token(background)),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(3);
      }
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
});
