import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const rustDirectory = 'apps/desktop/src-tauri/src';
const catalogPath = 'apps/desktop/messages/en.json';
const messageKeyPrefixes = ['capture_', 'workspace_', 'clipboard_', 'preferences_'];

// These are Rust error codes, not message keys. A broad string-literal scan
// would mistake them for catalog entries, so extraction stays in message_key
// assignments, error tuples, and the CaptureWarning::message_key method.
export const excludedNonMessageKeys = ['workspace_unavailable', 'workspace_unknown'] as const;

function isMessageKey(value: string) {
  const prefix = messageKeyPrefixes.find((candidate) => value.startsWith(candidate));
  return Boolean(
    prefix &&
      value.length > prefix.length &&
      [...value.slice(prefix.length)].every((character) => /[a-z0-9_]/u.test(character)),
  );
}

function quotedValues(line: string) {
  return line
    .split('"')
    .filter((_, index) => index % 2 === 1)
    .filter(isMessageKey);
}

export function extractMessageKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const add = (value: string) => keys.add(value);
  let tuplePending = false;
  let methodPending = false;

  for (const line of source.split('\n')) {
    const startsTuple = line.includes('=>') && line.includes('(');
    const tupleAssignment =
      line.includes('message_key') &&
      line.includes('=') &&
      line.includes(',') &&
      line.includes('(');
    if (startsTuple || tupleAssignment) tuplePending = true;

    if (line.includes('message_key(') && line.includes('{')) methodPending = true;
    if (line.includes('message_key') || methodPending || (tuplePending && line.includes(')'))) {
      const values = quotedValues(line);
      const selected = startsTuple || tupleAssignment || tuplePending ? values.slice(-1) : values;
      for (const key of selected) add(key);
    }

    if (tuplePending && line.includes(')')) tuplePending = false;
    if (methodPending && line.trim() === '}') methodPending = false;
  }

  return keys;
}

export function findMissingMessageKeys(keys: Iterable<string>, catalogKeys: Iterable<string>) {
  const catalog = new Set(catalogKeys);
  return [...new Set(keys)].filter((key) => !catalog.has(key)).sort();
}

async function rustFiles() {
  const files = await readdir(rustDirectory, { recursive: true });
  return files.filter((file) => file.endsWith('.rs')).map((file) => join(rustDirectory, file));
}

async function main() {
  const keys = new Set<string>();
  for (const file of await rustFiles()) {
    for (const key of extractMessageKeys(await Bun.file(file).text())) keys.add(key);
  }

  const catalog = JSON.parse(await Bun.file(catalogPath).text()) as Record<string, unknown>;
  const missing = findMissingMessageKeys(keys, Object.keys(catalog));
  if (missing.length) throw new Error(`Missing message keys: ${missing.join(', ')}`);

  console.log(`excluded non-message keys: ${excludedNonMessageKeys.join(', ')}`);
  console.log(`verified ${keys.size} message keys`);
}

if (import.meta.main) await main();
