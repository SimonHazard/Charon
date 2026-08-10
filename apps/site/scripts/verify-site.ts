import { access, readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
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
  if (html.includes('charon.example')) failures.push(`${route} contains placeholder origin`);
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

if (failures.length) throw new Error(failures.join('\n'));
console.log(`verified ${routes.length} static routes and ${media.length} media budgets`);
