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

const siteWorkflowName = 'site-deploy.yml';
if (!files.includes(siteWorkflowName)) {
  failures.push(`${siteWorkflowName}: production deployment workflow is missing`);
} else {
  const siteWorkflow = await Bun.file(`${directory}/${siteWorkflowName}`).text();
  const requiredFragments = [
    'on:\n  push:\n    branches: [main]\n    paths:',
    "      - '.github/workflows/site-deploy.yml'",
    "      - 'apps/site/**'",
    "      - 'packages/theme/**'",
    "      - 'package.json'",
    "      - 'bun.lock'",
    'permissions:\n  contents: read',
    'group: site-production',
    'environment: site-production',
    'bun install --frozen-lockfile',
    'bun run test:site',
    'bun run check:site:cloudflare',
    'CLOUDFLARE_ACCOUNT_ID: $' + '{{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
    'CLOUDFLARE_API_TOKEN: $' + '{{ secrets.CLOUDFLARE_API_TOKEN }}',
  ];
  for (const fragment of requiredFragments) {
    if (!siteWorkflow.includes(fragment)) {
      failures.push(`${siteWorkflowName}: missing production contract ${fragment}`);
    }
  }
  for (const forbidden of [
    'pull_request:',
    'workflow_dispatch:',
    'wrangler versions upload',
    'preview',
  ]) {
    if (siteWorkflow.includes(forbidden)) {
      failures.push(`${siteWorkflowName}: forbidden non-production behavior ${forbidden}`);
    }
  }
  const verifyIndex = siteWorkflow.indexOf('bun run check:site:cloudflare');
  const deployIndex = siteWorkflow.indexOf('name: Deploy the verified static site');
  if (verifyIndex === -1 || deployIndex === -1 || deployIndex < verifyIndex) {
    failures.push(`${siteWorkflowName}: deployment must follow all verification`);
  } else if (siteWorkflow.slice(0, deployIndex).includes('CLOUDFLARE_')) {
    failures.push(`${siteWorkflowName}: Cloudflare secrets are exposed before deployment`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(
  `verified ${files.length} workflow files with immutable actions and scoped permissions`,
);
