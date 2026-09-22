import { readdir, stat } from 'node:fs/promises';

const defaultRoots = ['apps/desktop/dist', 'apps/site/dist'];
const requestedRoots = Bun.argv.slice(2);
const roots = requestedRoots.length > 0 ? requestedRoots : defaultRoots;
const commonPatterns = [
  /\/Users\/[A-Za-z0-9._-]+/u,
  /\/home\/[A-Za-z0-9._-]+/u,
  /[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+/u,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/iu,
  /Agent handoff/u,
  /release-brief\.pdf/u,
  /charon:fixture-composer-focus/u,
];
const desktopNetworkPatterns = [
  /\bfetch\(/u,
  /XMLHttpRequest/u,
  /sendBeacon/u,
  /new WebSocket\(/u,
  /https?:\/\/(?!ipc\.localhost)/u,
];
// Static dependency metadata and DOM namespace constants are not network sinks.
const desktopNetworkAllowlist = [
  'fetch(e.href,n)', // React DOM stylesheet preloading; Charon emits no preload links.
  // Explicit user-triggered release link opened through Tauri's opener plugin.
  'https://github.com/SimonHazard/Charon/releases/latest',
  'https://react.dev/errors/',
  'https://base-ui.com/production-error',
  'https://paraglidejs.com/errors#no-locale-found',
  'https://tailwindcss.com',
  'http://example.com',
  'http://fallback.com',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/XML/1998/namespace',
];
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.xml', '.txt', '.svg', '.map']);
const failures: string[] = [];

function patternsFor(root: string): RegExp[] {
  return root === 'apps/desktop/dist' ? desktopPatterns : commonPatterns;
}

async function walk(path: string, patterns: RegExp[]): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(child, patterns);
    else if ([...textExtensions].some((extension) => entry.name.endsWith(extension))) {
      let text = await Bun.file(child).text();
      if (patterns === desktopPatterns) {
        for (const allowed of desktopNetworkAllowlist) text = text.replaceAll(allowed, '');
      }
      for (const pattern of patterns) if (pattern.test(text)) failures.push(`${child}: ${pattern}`);
    }
  }
}

const desktopPatterns = [...commonPatterns, ...desktopNetworkPatterns];

for (const root of roots) {
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`privacy scan root missing: ${root} — run \`bun run build\` first`);
  }
  const patterns = patternsFor(root);
  await walk(root, patterns);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`privacy scan passed for ${roots.join(', ')}`);
