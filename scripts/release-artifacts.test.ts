import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleReleaseArtifacts } from './release-artifacts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture(options: { omitWindows?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'charon-release-'));
  roots.push(root);
  const input = join(root, 'incoming');
  const groups: Record<string, string[]> = {
    'macos-x86_64': ['Charon_0.1.0_x64.dmg', 'Charon.app.tar.gz', 'Charon.app.tar.gz.sig'],
    'linux-x86_64': [
      'Charon_0.1.0_amd64.deb',
      'Charon-0.1.0-1.x86_64.rpm',
      'Charon_0.1.0_amd64.AppImage',
      'Charon_0.1.0_amd64.AppImage.sig',
    ],
    'windows-x86_64': [
      'Charon_0.1.0_x64-setup.exe',
      'Charon_0.1.0_x64-setup.exe.sig',
      'Charon_0.1.0_x64_en-US.msi',
      'Charon_0.1.0_x64_en-US.msi.sig',
    ],
  };
  if (options.omitWindows) delete groups['windows-x86_64'];
  for (const [group, names] of Object.entries(groups)) {
    const directory = join(input, group, 'bundle');
    await mkdir(directory, { recursive: true });
    for (const name of names) {
      await writeFile(
        join(directory, name),
        name.endsWith('.sig') ? 'trusted updater signature fixture value 0123456789' : name,
      );
    }
  }
  return {
    input,
    notesFile: join(root, 'RELEASE_NOTES.md'),
    output: join(root, 'output'),
  };
}

describe('release artifact assembly', () => {
  test('fails closed when one platform is missing', async () => {
    const paths = await fixture({ omitWindows: true });
    await expect(
      assembleReleaseArtifacts({
        ...paths,
        repository: 'SimonHazard/Charon',
        version: '0.1.0',
        publishedAt: '2026-09-06T00:00:00.000Z',
      }),
    ).rejects.toThrow('windows-x86_64');
  });

  test('creates complete signed metadata and checksums', async () => {
    const paths = await fixture();
    const result = await assembleReleaseArtifacts({
      ...paths,
      repository: 'SimonHazard/Charon',
      version: '0.1.0',
      publishedAt: '2026-09-06T00:00:00.000Z',
    });
    expect(result.assets).toHaveLength(11);
    expect(Object.keys(result.latest.platforms).sort()).toEqual([
      'darwin-x86_64',
      'linux-x86_64',
      'windows-x86_64',
    ]);
    expect(result.latest.platforms['windows-x86_64'].url).toContain('/releases/download/v0.1.0/');
    expect(await Bun.file(join(paths.output, 'SHA256SUMS.txt')).text()).toContain('latest.json');
    expect(await Bun.file(paths.notesFile).text()).toContain('not notarized');
  });
});
