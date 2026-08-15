import type { ClipboardClient } from '@/lib/ipc/clipboard-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

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
  ]),
);

export const demoClipboardClient: ClipboardClient = {
  composeAndWrite: async () => ({
    tagCount: 2,
    attachmentCount: 1,
    byteCount: 68,
  }),
};
