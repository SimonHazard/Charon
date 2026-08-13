import { access, readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const productionOrigin = 'https://charon.simonhazard.com';
const routes = [
  'index.html',
  'fr/index.html',
  'privacy/index.html',
  'fr/confidentialite/index.html',
  'download/index.html',
  'fr/telechargement/index.html',
  'changelog/index.html',
  'fr/changelog/index.html',
  '404.html',
];

const failures: string[] = [];
for (const route of routes) {
  const file = new URL(route, root);
  try {
    await access(file);
  } catch {
    failures.push(`missing route: ${route}`);
    continue;
  }
  const html = await readFile(file, 'utf8');
  for (const marker of ['<title>', 'rel="canonical"', 'hreflang="x-default"', 'og:title']) {
    if (!html.includes(marker)) failures.push(`${route} misses ${marker}`);
  }
  if (!html.includes(productionOrigin)) failures.push(`${route} misses production origin`);
  if (html.includes('charon.example')) failures.push(`${route} contains placeholder origin`);
  if (html.includes('simonhazard.github.io') || html.includes('href="/Charon/')) {
    failures.push(`${route} contains obsolete GitHub Pages base`);
  }
}

const homes = await Promise.all(
  ['index.html', 'fr/index.html'].map((route) => readFile(new URL(route, root), 'utf8')),
);
for (const banned of ['CopyPreset', 'Insights', 'customer logo', 'testimonial']) {
  if (homes.some((html) => html.includes(banned))) failures.push(`banned home claim: ${banned}`);
}
for (const required of ['charon-shelf-solarized.webp', 'charon-demo.webm', '<video']) {
  if (homes.some((html) => !html.includes(required)))
    failures.push(`localized home misses ${required}`);
}

const media = [
  ['media/charon-shelf-solarized.webp', 300_000],
  ['media/charon-shelf-solarized.avif', 250_000],
  ['media/charon-editor-dark.webp', 300_000],
  ['media/charon-editor-dark.avif', 250_000],
  ['media/charon-demo.webm', 2_000_000],
] as const;
for (const [path, budget] of media) {
  const info = await stat(new URL(path, root));
  if (info.size > budget) failures.push(`${path} exceeds ${budget} bytes`);
}

const output = (
  await Promise.all(routes.map((route) => readFile(new URL(route, root), 'utf8')))
).join('\n');
for (const sentinel of ['/Users/', 'selected text sentinel', 'BEGIN PRIVATE KEY', 'analytics.js']) {
  if (output.includes(sentinel)) failures.push(`static output leaked ${sentinel}`);
}
if (output.includes('fetch(')) failures.push('static output contains a runtime fetch');

const robots = await readFile(new URL('robots.txt', root), 'utf8');
if (!robots.includes(`${productionOrigin}/sitemap-index.xml`)) {
  failures.push('robots.txt misses the production sitemap');
}

const manifest = JSON.parse(await readFile(new URL('site.webmanifest', root), 'utf8')) as {
  start_url?: string;
  icons?: Array<{ src?: string }>;
};
if (manifest.start_url !== '/') failures.push('web manifest does not start at root');
if (manifest.icons?.some(({ src }) => src?.startsWith('/Charon/'))) {
  failures.push('web manifest contains obsolete GitHub Pages paths');
}

const sitemap = await readFile(new URL('sitemap-index.xml', root), 'utf8');
if (!sitemap.includes(productionOrigin) || sitemap.includes('simonhazard.github.io')) {
  failures.push('sitemap origin is not production');
}

const privacyPages = await Promise.all(
  ['privacy/index.html', 'fr/confidentialite/index.html'].map((route) =>
    readFile(new URL(route, root), 'utf8'),
  ),
);
for (const disclosure of ['Cloudflare Workers Static Assets', 'connection metadata']) {
  if (!privacyPages[0].includes(disclosure)) failures.push(`English privacy misses ${disclosure}`);
}
for (const disclosure of ['Cloudflare Workers Static Assets', 'métadonnées de connexion']) {
  if (!privacyPages[1].includes(disclosure)) failures.push(`French privacy misses ${disclosure}`);
}

const wrangler = JSON.parse(
  await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const expectedConfig = {
  name: 'charon-site',
  compatibility_date: '2026-08-12',
  send_metrics: false,
  workers_dev: false,
  preview_urls: false,
};
for (const [key, value] of Object.entries(expectedConfig)) {
  if (wrangler[key] !== value) failures.push(`wrangler config has unexpected ${key}`);
}
const assets = wrangler.assets as Record<string, unknown> | undefined;
if (
  assets?.directory !== './dist' ||
  assets.not_found_handling !== '404-page' ||
  assets.html_handling !== 'auto-trailing-slash'
) {
  failures.push('wrangler static asset contract changed');
}
const routesConfig = wrangler.routes as Array<Record<string, unknown>> | undefined;
if (
  routesConfig?.length !== 1 ||
  routesConfig[0]?.pattern !== 'charon.simonhazard.com' ||
  routesConfig[0]?.custom_domain !== true
) {
  failures.push('wrangler custom domain contract changed');
}
if ((wrangler.observability as Record<string, unknown> | undefined)?.enabled !== false) {
  failures.push('wrangler observability must remain disabled');
}
if (
  (wrangler.dependencies_instrumentation as Record<string, unknown> | undefined)?.enabled !== false
) {
  failures.push('wrangler dependency instrumentation must remain disabled');
}
for (const forbidden of [
  'main',
  'vars',
  'secrets',
  'd1_databases',
  'kv_namespaces',
  'r2_buckets',
]) {
  if (forbidden in wrangler) failures.push(`wrangler config contains forbidden ${forbidden}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(
  `verified ${routes.length} static routes, ${media.length} media budgets, and Cloudflare static hosting`,
);
