import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'charon-bindings-'));

const bindings = [
  {
    generatedPath: join(repositoryRoot, 'apps/desktop/src/bindings/workspace.ts'),
    temporaryPath: join(temporaryDirectory, 'workspace.ts'),
    testFilter: 'export_bindings',
    outputVariable: 'CHARON_BINDINGS_OUT',
  },
  {
    generatedPath: join(repositoryRoot, 'apps/desktop/src/bindings/clipboard.ts'),
    temporaryPath: join(temporaryDirectory, 'clipboard.ts'),
    testFilter: 'export_clipboard_bindings',
    outputVariable: 'CHARON_CLIPBOARD_BINDINGS_OUT',
  },
] as const;

try {
  for (const binding of bindings) {
    const cargoProcess = Bun.spawn(
      [
        'cargo',
        'test',
        '--manifest-path',
        'apps/desktop/src-tauri/Cargo.toml',
        '--locked',
        binding.testFilter,
        '--',
        '--ignored',
        '--nocapture',
      ],
      {
        cwd: repositoryRoot,
        env: { ...Bun.env, [binding.outputVariable]: binding.temporaryPath },
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    const exitCode = await cargoProcess.exited;
    if (exitCode !== 0) {
      throw new Error(`Rust binding generation exited with ${exitCode}`);
    }

    const formatProcess = Bun.spawn(
      ['bun', 'x', 'biome', 'format', '--write', binding.temporaryPath],
      {
        cwd: repositoryRoot,
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    const formatExitCode = await formatProcess.exited;
    if (formatExitCode !== 0) {
      throw new Error(`binding formatting exited with ${formatExitCode}`);
    }

    const generated = await readFile(binding.temporaryPath, 'utf8');
    if (process.argv.includes('--write')) {
      await Bun.write(binding.generatedPath, generated);
      console.log(`updated ${binding.generatedPath}`);
    } else {
      const existing = await readFile(binding.generatedPath, 'utf8').catch(() => '');
      if (existing !== generated) {
        console.error(`${binding.generatedPath} is stale. Run \`bun run bindings:generate\`.`);
        process.exitCode = 1;
      } else {
        console.log(`${binding.generatedPath} is current.`);
      }
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
