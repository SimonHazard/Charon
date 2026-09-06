import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

type PlatformSpec = {
  directory: string;
  key: string;
  installer: RegExp[];
  updater: RegExp;
  signature: RegExp;
};

const platforms: PlatformSpec[] = [
  {
    directory: 'macos-x86_64',
    key: 'darwin-x86_64',
    installer: [/\.dmg$/u],
    updater: /\.app\.tar\.gz$/u,
    signature: /\.app\.tar\.gz\.sig$/u,
  },
  {
    directory: 'linux-x86_64',
    key: 'linux-x86_64',
    installer: [/\.deb$/u, /\.rpm$/u],
    updater: /\.AppImage$/u,
    signature: /\.AppImage\.sig$/u,
  },
  {
    directory: 'windows-x86_64',
    key: 'windows-x86_64',
    installer: [/\.msi$/u, /(?<!\.sig)\.exe$/u, /\.msi\.sig$/u],
    updater: /(?<!\.sig)\.exe$/u,
    signature: /\.exe\.sig$/u,
  },
];

type AssembleOptions = {
  input: string;
  output: string;
  notesFile: string;
  repository: string;
  version: string;
  publishedAt?: string;
};

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : Promise.resolve([path]);
    }),
  );
  return files.flat().sort();
}

function exactlyOne(files: string[], pattern: RegExp, label: string) {
  const matches = files.filter((file) => pattern.test(basename(file)));
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one matching artifact, found ${matches.length}`);
  }
  return matches[0];
}

function requiredFiles(files: string[], patterns: RegExp[], label: string) {
  return patterns.map((pattern) => exactlyOne(files, pattern, label));
}

async function sha256(path: string) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(await Bun.file(path).arrayBuffer()));
  return hash.digest('hex');
}

export async function assembleReleaseArtifacts(options: AssembleOptions) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(options.version)) {
    throw new Error(`invalid release version ${options.version}`);
  }
  if (!/^[^/]+\/[^/]+$/u.test(options.repository)) {
    throw new Error(`invalid GitHub repository ${options.repository}`);
  }

  const selected = new Map<string, string>();
  const manifestPlatforms: Record<string, { signature: string; url: string }> = {};

  for (const platform of platforms) {
    const directory = join(options.input, platform.directory);
    const files = await filesBelow(directory);
    const updater = exactlyOne(files, platform.updater, platform.directory);
    const signature = exactlyOne(files, platform.signature, platform.directory);
    const installers = requiredFiles(files, platform.installer, platform.directory);
    const signatureContent = (await Bun.file(signature).text()).trim();
    if (signatureContent.length < 40) {
      throw new Error(`${platform.directory}: updater signature is missing or invalid`);
    }
    for (const file of new Set([updater, signature, ...installers])) {
      const name = basename(file);
      if (selected.has(name)) throw new Error(`duplicate release asset ${name}`);
      selected.set(name, file);
    }
    const updaterName = basename(updater);
    manifestPlatforms[platform.key] = {
      signature: signatureContent,
      url: `https://github.com/${options.repository}/releases/download/v${options.version}/${encodeURIComponent(updaterName)}`,
    };
  }

  await rm(options.output, { force: true, recursive: true });
  await mkdir(options.output, { recursive: true });
  for (const [name, source] of selected) await copyFile(source, join(options.output, name));

  const notes = `Charon ${options.version}. See the GitHub release notes for changes and installation guidance.`;
  const latest = {
    version: options.version,
    notes,
    pub_date: options.publishedAt ?? new Date().toISOString(),
    platforms: manifestPlatforms,
  };
  const latestPath = join(options.output, 'latest.json');
  await writeFile(latestPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');

  const checksumNames = [...selected.keys(), 'latest.json'].sort();
  const checksums = await Promise.all(
    checksumNames.map(async (name) => `${await sha256(join(options.output, name))}  ${name}`),
  );
  await writeFile(join(options.output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');

  const releaseNotes = `Charon ${options.version}\n\nThis release was built automatically for macOS, Linux, and Windows after every platform completed successfully.\n\nInstallation notes\n\n- macOS: this build uses an ad-hoc signature and is not notarized. Use Privacy & Security > Open Anyway, or Control-click > Open, on first launch. Input Monitoring and Accessibility may need to be granted again after an update.\n- Windows: this build is unsigned and may show a SmartScreen warning. Use More info > Run anyway only after checking the download.\n- Linux: packages are unsigned.\n- SHA256SUMS.txt provides integrity checks. Tauri updater signatures are separate from Apple or Microsoft code signing.\n`;
  await writeFile(options.notesFile, releaseNotes, 'utf8');

  return { assets: [...selected.keys()].sort(), latest };
}

function argument(name: string) {
  const index = Bun.argv.indexOf(name);
  const value = index === -1 ? undefined : Bun.argv[index + 1];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

if (import.meta.main) {
  await assembleReleaseArtifacts({
    input: argument('--input'),
    output: argument('--output'),
    notesFile: argument('--notes-file'),
    repository: argument('--repository'),
    version: argument('--version'),
  });
}
