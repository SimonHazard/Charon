import { readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

import type { NoteDto } from '../apps/desktop/src/bindings/workspace.ts';
import { createNoteIndex } from '../apps/desktop/src/features/notes/search.ts';
import { reconcileSnapshot } from '../apps/desktop/src/lib/workspace-snapshot.ts';

const desktopAssets = 'apps/desktop/dist/assets';
const files = await readdir(desktopAssets);
const scripts = files.filter((file) => file.endsWith('.js'));
let gzipBytes = 0;
for (const script of scripts)
  gzipBytes += gzipSync(await Bun.file(`${desktopAssets}/${script}`).bytes()).byteLength;
const desktopBudget = 230 * 1024;
if (gzipBytes > desktopBudget)
  throw new Error(`desktop JS gzip ${gzipBytes} exceeds ${desktopBudget}`);

const size = 20_000;
const query = 'brief handoff';

function buildNotes(revision: number): NoteDto[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `note-${index}`,
    body: `# Réunion ${index}\nAgent handoff ${index} — vérifier l'état vide avant d'ajouter un contrôle, puis relire le brief complet du Workspace local.`,
    status: 'open',
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt:
      index === 0
        ? `2026-08-05T10:00:${String(revision).padStart(2, '0')}.000Z`
        : '2026-08-05T10:00:00.000Z',
    completedAt: null,
    tags: index % 7 === 0 ? ['Research'] : ['Agent'],
    attachments:
      index % 11 === 0
        ? [
            {
              id: `attachment-${index}`,
              fileName: `brief-${index}.pdf`,
              relativePath: `attachments/note-${index}/attachment-${index}.pdf`,
              createdAt: '2026-08-05T10:00:00.000Z',
            },
          ]
        : [],
  }));
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

const workspace = (notes: NoteDto[], revision: number) => ({
  schemaVersion: 2,
  workspaceId: '00000000-0000-4000-8000-000000000001',
  revision,
  notes,
  legacyArchiveCreated: false,
});

const index = createNoteIndex();
let current = workspace(buildNotes(0), 0);
index.filter(current.notes, { query, tag: null });
index.tags(current.notes);

const coldSamples: number[] = [];
const warmSamples: number[] = [];
for (let run = 0; run < 9; run += 1) {
  const incoming = workspace(buildNotes(run + 1), run + 1);

  const coldStart = performance.now();
  createNoteIndex().filter(incoming.notes, { query, tag: null });
  coldSamples.push(performance.now() - coldStart);

  const warmStart = performance.now();
  const merged = reconcileSnapshot(current, incoming);
  index.filter(merged.notes, { query, tag: null });
  index.tags(merged.notes);
  warmSamples.push(performance.now() - warmStart);
  current = merged;
}

const coldMedian = median(coldSamples);
const warmMedian = median(warmSamples);
if (coldMedian >= 50)
  throw new Error(`20k cold search median ${coldMedian.toFixed(1)}ms exceeds 50ms`);
if (warmMedian >= 20)
  throw new Error(`20k warm snapshot median ${warmMedian.toFixed(1)}ms exceeds 20ms`);

console.log(
  JSON.stringify({
    desktopJsGzipBytes: gzipBytes,
    search20kColdMedianMs: Number(coldMedian.toFixed(2)),
    snapshot20kWarmMedianMs: Number(warmMedian.toFixed(2)),
  }),
);
