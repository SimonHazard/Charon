import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const productionOrigin = 'https://charon.simonhazard.com';
const routes = ['index.html', 'fr/index.html', '404.html'];
const removedRoutes = [
  'privacy/index.html',
  'fr/confidentialite/index.html',
  'download/index.html',
  'fr/telechargement/index.html',
  'changelog/index.html',
  'fr/changelog/index.html',
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
for (const route of removedRoutes) {
  try {
    await access(new URL(route, root));
    failures.push(`obsolete route still emitted: ${route}`);
  } catch {
    // The holding site intentionally emits no supporting content routes.
  }
}

const homes = await Promise.all(
  ['index.html', 'fr/index.html'].map((route) => readFile(new URL(route, root), 'utf8')),
);
for (const banned of [
  'CopyPreset',
  'Insights',
  'customer logo',
  'testimonial',
  'charon-shelf-solarized',
  'charon-demo.webm',
  '<video',
  'theme-control',
  'locale-link',
  'View source',
  'Voir le code source',
  'View releases',
  'Voir les versions',
  'github.com/SimonHazard/Charon/releases',
]) {
  if (homes.some((html) => html.includes(banned))) failures.push(`banned home claim: ${banned}`);
}
for (const required of [
  '<title>Charon</title>',
  'charon-icon-lavender-32.png',
  'charon-icon-lavender-1024.png',
  'twitter:card" content="summary',
]) {
  if (homes.some((html) => !html.includes(required)))
    failures.push(`localized home misses ${required}`);
}
if (!homes[0]?.includes('Keep what matters.')) failures.push('English home copy changed');
if (!homes[1]?.includes('Gardez l’essentiel.')) failures.push('French home copy changed');
for (const [href, label] of [
  ['https://ko-fi.com/simonhazard', 'Ko-fi'],
  ['https://simonhazard.com/', 'simonhazard.com'],
]) {
  for (const [index, html] of homes.entries()) {
    if (!html.includes(`href="${href}"`) || !html.includes(`>${label}</a>`)) {
      failures.push(`localized home ${index + 1} misses footer link ${href}`);
    }
  }
}
for (const [index, html] of homes.entries()) {
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/u)?.[1] ?? '';
  if (footer.includes('Charon')) {
    failures.push(`localized home ${index + 1} keeps Charon footer text`);
  }
  if ((footer.match(/<a\b/gu) ?? []).length !== 2) {
    failures.push(`localized home ${index + 1} footer must contain exactly two links`);
  }
}

const icons = [
  [
    'brand/charon-icon-lavender-16.png',
    1_000,
    '47a9245018175b872566dd8e397b9c640bcf024bb59b9ac95b8e956124abdf4d',
  ],
  [
    'brand/charon-icon-lavender-32.png',
    2_000,
    '50ed773e5919d90610a16b8283defc6edbe27eaedc4dfa90b3a7eb66f707854c',
  ],
  [
    'brand/charon-icon-lavender-180.png',
    8_000,
    '6249410ed98c238dabfe5d2068a294e64be46222f6a96228a92a67b70efdf01b',
  ],
  [
    'brand/charon-icon-lavender-512.png',
    24_000,
    '185beef3c031c03439b29983030d6aa26fa3cda87b589661cb2b92cb8fea7956',
  ],
  [
    'brand/charon-icon-lavender-1024.png',
    48_000,
    '509ec806fcad6c1ab8805fac6f3b5f085fc7bf8b30f374ff8da20ad5b4cdeb04',
  ],
] as const;
for (const [path, budget, expectedHash] of icons) {
  const info = await stat(new URL(path, root));
  if (info.size > budget) failures.push(`${path} exceeds ${budget} bytes`);
  const hash = createHash('sha256')
    .update(await readFile(new URL(path, root)))
    .digest('hex');
  if (hash !== expectedHash) failures.push(`${path} differs from the approved brand kit`);
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
for (const icon of ['/brand/charon-icon-lavender-180.png', '/brand/charon-icon-lavender-512.png']) {
  if (!manifest.icons?.some(({ src }) => src === icon)) {
    failures.push(`web manifest misses ${icon}`);
  }
}

const sitemapIndex = await readFile(new URL('sitemap-index.xml', root), 'utf8');
const sitemap = await readFile(new URL('sitemap-0.xml', root), 'utf8');
if (
  !sitemapIndex.includes(productionOrigin) ||
  !sitemap.includes(productionOrigin) ||
  sitemapIndex.includes('simonhazard.github.io') ||
  sitemap.includes('simonhazard.github.io')
) {
  failures.push('sitemap origin is not production');
}
for (const removedRoute of [
  '/privacy/',
  '/download/',
  '/changelog/',
  '/fr/confidentialite/',
  '/fr/telechargement/',
  '/fr/changelog/',
]) {
  if (sitemap.includes(`${productionOrigin}${removedRoute}`)) {
    failures.push(`sitemap contains obsolete route ${removedRoute}`);
  }
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
  `verified ${routes.length} static routes, ${removedRoutes.length} removed routes, ${icons.length} Charon PNG icons, and Cloudflare static hosting`,
);
