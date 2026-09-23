import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'check-workflows.ts');
const workflows = join(import.meta.dir, '../.github/workflows');
const originalRelease = await Bun.file(join(workflows, 'release.yml')).text();
const originalQuality = await Bun.file(join(workflows, 'quality.yml')).text();
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

async function checkQuality(quality: string) {
  await Bun.write(join(fixture, '.github/workflows/quality.yml'), quality);
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

  test('rejects an Intel macOS runner for Apple Silicon updater artifacts', async () => {
    const result = await check(originalRelease.replace('os: macos-15', 'os: macos-15-intel'));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('missing release contract os: macos-15');
  });

  test('forwards --locked to Cargo after Tauri build options', async () => {
    const result = await check(
      originalRelease.replace(
        'run: bun run --cwd apps/desktop tauri:build -- --bundles "$BUNDLE_TARGETS" -- --locked',
        'run: bun run --cwd apps/desktop tauri:build -- --locked --bundles "$BUNDLE_TARGETS"',
      ),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('missing release contract run: bun run --cwd apps/desktop');
  });

  test('rejects an ad-hoc macOS release identity', async () => {
    const result = await check(
      originalRelease.replace(
        'APPLE_SIGNING_IDENTITY: $' + '{{ env.MACOS_SIGNING_IDENTITY }}',
        "APPLE_SIGNING_IDENTITY: '-'",
      ),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Apple credential APPLE_SIGNING_IDENTITY: '-'");
  });

  test('rejects Tauri certificate import variables for the self-signed identity', async () => {
    const result = await check(
      originalRelease.replace(
        '          MACOS_SIGNING_P12: $' + '{{ secrets.MACOS_SIGNING_P12 }}\n',
        '          MACOS_SIGNING_P12: $' +
          '{{ secrets.MACOS_SIGNING_P12 }}\n          APPLE_CERTIFICATE: $' +
          '{{ secrets.MACOS_SIGNING_P12 }}\n',
      ),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Apple credential APPLE_CERTIFICATE');
  });

  test('requires the designated requirement check before upload', async () => {
    const start = originalRelease.indexOf(
      '      - name: Verify the stable macOS designated requirement\n',
    );
    const end = originalRelease.indexOf('      - uses: actions/upload-artifact@', start);
    const result = await check(originalRelease.slice(0, start) + originalRelease.slice(end));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      'macOS must import the stable identity, build, then verify its requirement before upload',
    );
  });

  test('requires the macOS and Windows Rust portability matrix', async () => {
    const result = await checkQuality(
      originalQuality.replace('os: [macos-15, windows-2025]', 'os: [macos-15]'),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      'missing bounded desktop contract os: [macos-15, windows-2025]',
    );
  });

  test('keeps the portability clippy command in the matrix job', async () => {
    const clippyStep =
      '      - run: cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings\n';
    const firstClippy = originalQuality.indexOf(clippyStep);
    const secondClippy = originalQuality.indexOf(clippyStep, firstClippy + clippyStep.length);
    const result = await checkQuality(
      originalQuality.slice(0, secondClippy) +
        originalQuality.slice(secondClippy + clippyStep.length),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('rust-portability job missing cargo clippy');
  });
});
