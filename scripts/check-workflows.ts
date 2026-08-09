import { readdir } from 'node:fs/promises';

const directory = '.github/workflows';
const files = (await readdir(directory)).filter((file) => file.endsWith('.yml'));
const failures: string[] = [];
const sha = /^[0-9a-f]{40}$/u;

for (const file of files) {
  const text = await Bun.file(`${directory}/${file}`).text();
  for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    const revision = reference.split('@')[1] ?? '';
    if (!sha.test(revision)) failures.push(`${file}: mutable action ${reference}`);
  }
  if (/permissions:\s*(?:write-all|read-all)/u.test(text))
    failures.push(`${file}: broad permissions`);
  if (/pull_request_target:/u.test(text))
    failures.push(`${file}: pull_request_target is forbidden`);
  if (/run:.*\$\{\{\s*(?:github\.event|inputs\.)/u.test(text)) {
    failures.push(`${file}: untrusted expression interpolated into run`);
  }
  if (/pull_request:[\s\S]*?secrets\./u.test(text) && !file.includes('release')) {
    failures.push(`${file}: PR workflow references secrets`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(
  `verified ${files.length} workflow files with immutable actions and scoped permissions`,
);
