import { readdir } from 'node:fs/promises';

const defaultRoots = ['apps/desktop/dist', 'apps/site/dist'];
const requestedRoots = Bun.argv.slice(2);
const roots = requestedRoots.length > 0 ? requestedRoots : defaultRoots;
const forbidden = [
  /\/Users\/[A-Za-z0-9._-]+/u,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/iu,
  /selected text sentinel/iu,
  /clipboard sentinel/iu,
];
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.xml', '.txt', '.svg', '.map']);
const failures: string[] = [];

async function walk(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(child);
    else if ([...textExtensions].some((extension) => entry.name.endsWith(extension))) {
      const text = await Bun.file(child).text();
      for (const pattern of forbidden)
        if (pattern.test(text)) failures.push(`${child}: ${pattern}`);
    }
  }
}

for (const root of roots) await walk(root);
if (failures.length) throw new Error(failures.join('\n'));
console.log(`privacy scan passed for ${roots.join(', ')}`);
