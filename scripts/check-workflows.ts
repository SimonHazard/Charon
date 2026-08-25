import { readdir } from 'node:fs/promises';

const directory = '.github/workflows';
const files = (await readdir(directory)).filter(
  (file) => file.endsWith('.yml') || file.endsWith('.yaml'),
);
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
  const checkoutCount = text.match(/uses:\s+actions\/checkout@/gu)?.length ?? 0;
  const nonPersistentCheckoutCount = text.match(/persist-credentials:\s+false/gu)?.length ?? 0;
  if (checkoutCount !== nonPersistentCheckoutCount) {
    failures.push(`${file}: every checkout must disable persisted credentials`);
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

const qualityWorkflowName = 'quality.yml';
if (!files.includes(qualityWorkflowName)) {
  failures.push(`${qualityWorkflowName}: routine desktop workflow is missing`);
} else {
  const qualityWorkflow = await Bun.file(`${directory}/${qualityWorkflowName}`).text();
  const requiredFragments = [
    'pull_request:\n    paths:',
    'push:\n    branches: [main]\n    paths:',
    'workflow_dispatch:',
    'permissions:\n  contents: read',
    'cancel-in-progress: true',
    'runs-on: ubuntu-24.04',
    'timeout-minutes: 20',
    'bun install --frozen-lockfile',
    'cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings',
    'cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked',
    'bun run bindings:check',
    'bunx playwright install --with-deps chromium',
    'test:e2e -- --project=chromium',
  ];
  for (const fragment of requiredFragments) {
    if (!qualityWorkflow.includes(fragment)) {
      failures.push(`${qualityWorkflowName}: missing bounded desktop contract ${fragment}`);
    }
  }
  for (const path of [
    "      - '.github/workflows/**'",
    "      - 'apps/desktop/**'",
    "      - 'packages/theme/**'",
    "      - 'scripts/**'",
    "      - 'package.json'",
    "      - 'bun.lock'",
    "      - 'biome.json'",
  ]) {
    const occurrences = qualityWorkflow.split(path).length - 1;
    if (occurrences !== 2) {
      failures.push(`${qualityWorkflowName}: expected PR/main path twice ${path}`);
    }
  }
  const runnerCount = qualityWorkflow.match(/^\s+runs-on:/gmu)?.length ?? 0;
  if (runnerCount !== 1) {
    failures.push(`${qualityWorkflowName}: routine validation must use one runner`);
  }
  for (const forbidden of [
    'strategy:',
    'macos-15',
    'windows-2025',
    'playwright install --with-deps chromium webkit',
    '--project=webkit',
    "      - 'apps/site/**'",
  ]) {
    if (qualityWorkflow.includes(forbidden)) {
      failures.push(`${qualityWorkflowName}: expensive routine behavior ${forbidden}`);
    }
  }
}

const reviewWorkflowName = 'review-builds.yml';
if (!files.includes(reviewWorkflowName)) {
  failures.push(`${reviewWorkflowName}: manual candidate workflow is missing`);
} else {
  const reviewWorkflow = await Bun.file(`${directory}/${reviewWorkflowName}`).text();
  for (const fragment of [
    'on:\n  workflow_dispatch:',
    'permissions:\n  contents: read',
    'group: review-builds-$' + '{{ github.ref }}',
    'cancel-in-progress: true',
    'timeout-minutes: 45',
  ]) {
    if (!reviewWorkflow.includes(fragment)) {
      failures.push(`${reviewWorkflowName}: missing manual budget contract ${fragment}`);
    }
  }
  if (/^ {2}(?:pull_request|push|schedule):/mu.test(reviewWorkflow)) {
    failures.push(`${reviewWorkflowName}: candidate builds must remain manual`);
  }
}

const portabilityWorkflowName = 'portability.yml';
if (!files.includes(portabilityWorkflowName)) {
  failures.push(`${portabilityWorkflowName}: three-OS Rust workflow is missing`);
} else {
  const portabilityWorkflow = await Bun.file(`${directory}/${portabilityWorkflowName}`).text();
  for (const fragment of [
    'matrix:',
    'os: [macos-15, windows-2025]',
    'permissions:\n  contents: read',
    'cancel-in-progress: true',
    'timeout-minutes: 30',
    'cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings',
    'cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked',
  ]) {
    if (!portabilityWorkflow.includes(fragment)) {
      failures.push(`${portabilityWorkflowName}: missing portability contract ${fragment}`);
    }
  }
}

const securityWorkflowName = 'security.yml';
if (!files.includes(securityWorkflowName)) {
  failures.push(`${securityWorkflowName}: scheduled security workflow is missing`);
} else {
  const securityWorkflow = await Bun.file(`${directory}/${securityWorkflowName}`).text();
  for (const fragment of [
    'schedule:',
    'permissions:\n  contents: read',
    'timeout-minutes: 15',
    'bun run build',
    'cargo audit --file apps/desktop/src-tauri/Cargo.lock',
  ]) {
    if (!securityWorkflow.includes(fragment)) {
      failures.push(`${securityWorkflowName}: missing security contract ${fragment}`);
    }
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
  `verified ${files.length} workflow files with immutable actions, scoped permissions, and bounded routine CI`,
);
