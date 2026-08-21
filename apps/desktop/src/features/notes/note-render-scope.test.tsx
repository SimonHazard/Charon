import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { NoteDto } from '@/bindings/workspace';
import { WorkspaceState } from '@/components/workspace-state';
import { NoteScreen } from '@/features/notes/note-screen';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

type ListProps = { notes: readonly NoteDto[]; allTags: readonly string[] };

const captured: ListProps[] = [];

vi.mock('@/features/notes/note-list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/notes/note-list')>();
  return {
    NoteList: (props: Parameters<typeof actual.NoteList>[0]) => {
      captured.push({ notes: props.notes, allTags: props.allTags });
      return actual.NoteList(props);
    },
  };
});

/** The Tauri boundary answers with freshly deserialized objects, never the ones React already holds. */
function serializingClient(): WorkspaceClient {
  const client = workspaceClient(
    snapshot([
      note({ id: 'alpha', body: 'Alpha body', tags: ['Agent'] }),
      note({ id: 'beta', body: 'Beta body', tags: ['Research'] }),
    ]),
  );
  return {
    ...client,
    snapshot: async () => structuredClone(await client.snapshot()),
    execute: async (command) => structuredClone(await client.execute?.(command)),
  } as WorkspaceClient;
}

describe('render scope across Workspace commands', () => {
  beforeEach(() => {
    captured.length = 0;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('keeps untouched Notes and the Tag list stable when one Note changes', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders workspaceClient={serializingClient()}>
        <WorkspaceState>{(current) => <NoteScreen snapshot={current} />}</WorkspaceState>
      </AppProviders>,
    );

    await screen.findByText('Alpha body');
    const before = captured.at(-1);
    expect(before).toBeDefined();

    await user.click(screen.getAllByRole('button', { name: 'Mark done' })[0] as HTMLElement);
    await waitFor(() => {
      expect(captured.at(-1)?.notes[0]).not.toBe(before?.notes[0]);
    });

    const after = captured.at(-1);
    expect(after?.notes[0]?.status).toBe('done');
    expect(after?.notes[1]).toBe(before?.notes[1]);
    expect(after?.allTags).toBe(before?.allTags);
  });
});
