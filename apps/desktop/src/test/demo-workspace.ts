import type { ClipboardClient } from '@/lib/ipc/clipboard-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

/** `?fixture=demo&notes=20000` loads a scale corpus for the typing budget in docs/TESTING.md. */
const scale = Number(new URLSearchParams(window.location.search).get('notes') ?? '0');
const bulk = Array.from({ length: Number.isFinite(scale) ? Math.max(0, scale) : 0 }, (_, index) =>
  note({
    id: `bulk-${index}`,
    body: `# Bulk note ${index}\n\nParagraphe de travail ${index} avec assez de texte pour peser sur la recherche et sur le rendu des lignes.\n\n- point un\n- point deux`,
    tags: index % 3 === 0 ? ['Bulk', 'Research'] : ['Bulk'],
  }),
);

export const demoWorkspaceClient = workspaceClient(
  snapshot([
    note({
      id: 'capture-note',
      body: '# Agent handoff\n\nVerify the empty state before adding another control.',
      tags: ['Research', 'Agent'],
      attachments: [
        {
          id: 'attachment-brief',
          fileName: 'release-brief.pdf',
          relativePath: 'attachments/capture-note/attachment-brief.pdf',
          createdAt: '2026-08-05T10:02:00.000Z',
        },
      ],
    }),
    note({
      id: 'local-note',
      body: '# Local Markdown\n\nThe Workspace stays visible and user-controlled.',
      tags: ['Privacy'],
    }),
    note({
      id: 'done-note',
      body: '# Capture contract\n\nOne gesture creates one ordinary Note.',
      tags: ['Product'],
      status: 'done',
    }),
    ...bulk,
  ]),
);

export const demoClipboardClient: ClipboardClient = {
  composeAndWrite: async () => ({
    tagCount: 2,
    attachmentCount: 1,
    byteCount: 68,
  }),
};
