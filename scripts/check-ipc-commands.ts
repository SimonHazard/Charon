import { readdir } from 'node:fs/promises';

const rust = await Bun.file('apps/desktop/src-tauri/src/lib.rs').text();
const handler = rust.match(/tauri::generate_handler!\[([\s\S]*?)\]/u)?.[1];
if (!handler) throw new Error('Rust generate_handler! block not found');

const rustCommands = new Set(
  [...handler.matchAll(/ipc::[a-z_]+::([a-z_]+)/gu)].map((match) => match[1]),
);
const clientsDirectory = 'apps/desktop/src/lib/ipc';
const clientFiles = (await readdir(clientsDirectory)).filter((file) => file.endsWith('.ts'));
const clientCommands = new Set<string>();

for (const file of clientFiles) {
  const source = await Bun.file(`${clientsDirectory}/${file}`).text();
  for (const match of source.matchAll(/\binvoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/gu)) {
    clientCommands.add(match[1]);
  }
}

const rustOnly = [...rustCommands].filter((command) => !clientCommands.has(command)).sort();
const clientOnly = [...clientCommands].filter((command) => !rustCommands.has(command)).sort();
if (rustOnly.length || clientOnly.length) {
  throw new Error(
    [
      rustOnly.length ? `Rust-only IPC commands: ${rustOnly.join(', ')}` : '',
      clientOnly.length ? `client-only IPC commands: ${clientOnly.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

console.log(`verified ${rustCommands.size} IPC command names across Rust and TypeScript`);
