import { createFileRoute } from '@tanstack/react-router';

import { useMessages } from '@/app/providers';
import { WorkspaceState } from '@/components/workspace-state';
import { NoteScreen } from '@/features/notes/note-screen';

export const Route = createFileRoute('/notes')({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === 'string' ? search.section : undefined,
  }),
  component: NotesRoute,
  errorComponent: RouteError,
});

function NotesRoute() {
  const m = useMessages();
  const search = Route.useSearch();
  return (
    <section aria-labelledby="notes-heading" className="route-surface">
      <div className="route-heading">
        <h1 id="notes-heading" tabIndex={-1}>
          {m.notes_title()}
        </h1>
        <p>{m.notes_description()}</p>
      </div>
      <WorkspaceState>
        {(snapshot) => <NoteScreen sectionId={search.section} snapshot={snapshot} />}
      </WorkspaceState>
    </section>
  );
}

function RouteError() {
  const m = useMessages();
  return <p role="alert">{m.route_error()}</p>;
}
