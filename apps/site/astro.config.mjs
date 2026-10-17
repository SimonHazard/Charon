// @ts-check

import { readdir, readFile, writeFile } from 'node:fs/promises';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { inlineScriptHashes, withScriptHashes } from './scripts/csp.mjs';

/**
 * Writes the hashes of every emitted inline script into the static CSP header.
 * @returns {import('astro').AstroIntegration}
 */
function inlineScriptPolicy() {
  return {
    name: 'charon-inline-script-policy',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const files = await readdir(dir, { recursive: true });
        const pages = await Promise.all(
          files
            .filter((file) => file.endsWith('.html'))
            .map((file) => readFile(new URL(file, dir), 'utf8')),
        );
        const headers = new URL('_headers', dir);
        const policy = withScriptHashes(
          await readFile(headers, 'utf8'),
          pages.flatMap(inlineScriptHashes),
        );
        await writeFile(headers, policy);
      },
    },
  };
}

export default defineConfig({
  output: 'static',
  site: process.env.CHARON_SITE_ORIGIN ?? 'https://charon.simonhazard.com',
  base: process.env.CHARON_SITE_BASE ?? '/',
  integrations: [react(), sitemap(), inlineScriptPolicy()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
