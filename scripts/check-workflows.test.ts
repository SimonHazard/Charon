import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'check-workflows.ts');
const workflows = join(import.meta.dir, '../.github/workflows');
const originalRelease = await Bun.file(join(workflows, 'release.yml')).text();
let fixture: string;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'charon-workflows-'));
  await cp(workflows, join(fixture, '.github/workflows'), { recursive: true });
});

afterAll(async () => {
  await rm(fixture, { recursive: true, force: true });
});

async function check(release: string) {
  await Bun.write(join(fixture, '.github/workflows/release.yml'), release);
  const result = Bun.spawnSync([process.execPath, script], { cwd: fixture });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

describe('release workflow regression checks', () => {
  test('accepts the checked-in workflows', async () => {
    expect((await check(originalRelease)).exitCode).toBe(0);
  });

  test('rejects the original clean-checkout failure with no build', async () => {
    const result = await check(originalRelease.replace('      - run: bun run build\n', ''));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('gate must build both apps before the privacy scan');
  });

  test('rejects building only after the privacy scan', async () => {
    const result = await check(
      originalRelease.replace(
        '      - run: bun run build\n      - run: bun run check:privacy\n',
        '      - run: bun run check:privacy\n      - run: bun run build\n',
      ),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('gate must build both apps before the privacy scan');
  });

  test('rejects removing the privacy scan', async () => {
    const result = await check(originalRelease.replace('      - run: bun run check:privacy\n', ''));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('gate must build both apps before the privacy scan');
  });

  test('rejects a generic macOS runner for Intel updater artifacts', async () => {
    const result = await check(originalRelease.replace('os: macos-15-intel', 'os: macos-15'));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('missing release contract os: macos-15-intel');
  });
});
