import { readdir } from 'node:fs/promises';

const directory = '.github/workflows';
const files = (await readdir(directory)).filter(
  (file) => file.endsWith('.yml') || file.endsWith('.yaml'),
);
const failures: string[] = [];
const sha = /^[0-9a-f]{40}$/u;
const expectedWorkflows = new Set([
  'quality.yml',
  'release.yml',
  'security.yml',
  'site-deploy.yml',
]);

for (const file of files) {
  if (!expectedWorkflows.has(file)) failures.push(`${file}: unexpected workflow`);
}

for (const file of files) {
  const text = await Bun.file(`${directory}/${file}`).text();
  const automaticTriggers = text.match(/^ {2}(?:pull_request|push|schedule):/gmu) ?? [];
  if (file === 'release.yml') {
    if (automaticTriggers.some((trigger) => !trigger.trim().startsWith('push:'))) {
      failures.push(`${file}: only main pushes may trigger automatically`);
    }
  } else if (file === 'quality.yml') {
    if (automaticTriggers.some((trigger) => !trigger.trim().startsWith('pull_request:'))) {
      failures.push(`${file}: only pull requests may trigger automatically`);
    }
  } else if (file === 'site-deploy.yml') {
    if (automaticTriggers.some((trigger) => !trigger.trim().startsWith('push:'))) {
      failures.push(`${file}: only main pushes may trigger automatically`);
    }
  } else if (automaticTriggers.length) {
    failures.push(`${file}: automatic triggers are disabled`);
  }
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

const releaseWorkflowName = 'release.yml';
if (!files.includes(releaseWorkflowName)) {
  failures.push(`${releaseWorkflowName}: automatic desktop release workflow is missing`);
} else {
  const releaseWorkflow = await Bun.file(`${directory}/${releaseWorkflowName}`).text();
  for (const fragment of [
    'on:\n  push:\n    branches:\n      - main',
    'should_release:',
    'environment: release',
    'macos-15',
    'ubuntu-24.04',
    'windows-2025',
    'TAURI_SIGNING_PRIVATE_KEY: $' + '{{ secrets.TAURI_SIGNING_PRIVATE_KEY }}',
    'actions/upload-artifact@',
    'actions/download-artifact@',
    'bun scripts/check-release-version.ts',
    'bun scripts/release-artifacts.ts',
    'gh release view',
    '--target "$RELEASE_SHA"',
    'gh release create',
    'gh release edit',
  ]) {
    if (!releaseWorkflow.includes(fragment)) {
      failures.push(`${releaseWorkflowName}: missing release contract ${fragment}`);
    }
  }
  for (const forbidden of [
    'pull_request:',
    'schedule:',
    'workflow_dispatch:',
    'tags:',
    'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  ]) {
    if (releaseWorkflow.includes(forbidden)) {
      failures.push(`${releaseWorkflowName}: forbidden trigger or unused secret ${forbidden}`);
    }
  }
  const contentsWriteCount = releaseWorkflow.match(/contents:\s+write/gu)?.length ?? 0;
  if (contentsWriteCount !== 1) {
    failures.push(`${releaseWorkflowName}: exactly one final job may receive contents write`);
  }
}

const qualityWorkflowName = 'quality.yml';
if (!files.includes(qualityWorkflowName)) {
  failures.push(`${qualityWorkflowName}: routine desktop workflow is missing`);
} else {
  const qualityWorkflow = await Bun.file(`${directory}/${qualityWorkflowName}`).text();
  const requiredFragments = [
    'pull_request:\n    branches:\n      - main',
    'workflow_dispatch:',
    'permissions:\n  contents: read',
    'cancel-in-progress: true',
    'runs-on: ubuntu-24.04',
    'timeout-minutes: 20',
    'bun install --frozen-lockfile',
    'cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings',
    'cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked',
    'bun run bindings:check',
    'bun run --cwd apps/desktop playwright install --with-deps chromium',
    'test:e2e -- --project=chromium',
  ];
  for (const fragment of requiredFragments) {
    if (!qualityWorkflow.includes(fragment)) {
      failures.push(`${qualityWorkflowName}: missing bounded desktop contract ${fragment}`);
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

const securityWorkflowName = 'security.yml';
if (!files.includes(securityWorkflowName)) {
  failures.push(`${securityWorkflowName}: manual security workflow is missing`);
} else {
  const securityWorkflow = await Bun.file(`${directory}/${securityWorkflowName}`).text();
  for (const fragment of [
    'workflow_dispatch:',
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
    'on:\n  push:\n    branches:\n      - main',
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
    'schedule:',
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
