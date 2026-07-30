import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '..');
const generatedPath = join(repositoryRoot, 'apps/desktop/src/bindings/workspace.ts');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'charon-bindings-'));
const temporaryPath = join(temporaryDirectory, 'workspace.ts');

try {
  const cargoProcess = Bun.spawn(
    [
      'cargo',
      'test',
      '--manifest-path',
      'apps/desktop/src-tauri/Cargo.toml',
      '--locked',
      'export_bindings',
      '--',
      '--ignored',
      '--nocapture',
    ],
    {
      cwd: repositoryRoot,
      env: { ...Bun.env, CHARON_BINDINGS_OUT: temporaryPath },
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  const exitCode = await cargoProcess.exited;
  if (exitCode !== 0) {
    throw new Error(`Rust binding generation exited with ${exitCode}`);
  }

  const formatProcess = Bun.spawn(['bun', 'x', 'biome', 'format', '--write', temporaryPath], {
    cwd: repositoryRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const formatExitCode = await formatProcess.exited;
  if (formatExitCode !== 0) {
    throw new Error(`binding formatting exited with ${formatExitCode}`);
  }

  const generated = await readFile(temporaryPath, 'utf8');
  if (process.argv.includes('--write')) {
    await Bun.write(generatedPath, generated);
    console.log(`updated ${generatedPath}`);
  } else {
    const existing = await readFile(generatedPath, 'utf8').catch(() => '');
    if (existing !== generated) {
      console.error('Rust/TypeScript bindings are stale. Run `bun run bindings:generate`.');
      process.exitCode = 1;
    } else {
      console.log('Rust/TypeScript bindings are current.');
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
