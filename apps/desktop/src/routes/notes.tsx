import { createFileRoute } from '@tanstack/react-router';

import { useMessages } from '@/app/providers';
import { WorkspaceState } from '@/components/workspace-state';

export const Route = createFileRoute('/notes')({
  component: NotesRoute,
  errorComponent: RouteError,
});

function NotesRoute() {
  const m = useMessages();
  return (
    <section aria-labelledby="notes-heading" className="route-surface">
      <div className="route-heading">
        <h1 id="notes-heading" tabIndex={-1}>
          {m.notes_title()}
        </h1>
        <p>{m.notes_description()}</p>
      </div>
      <WorkspaceState>
        {() => <p className="route-placeholder">{m.notes_empty()}</p>}
      </WorkspaceState>
    </section>
  );
}

function RouteError() {
  const m = useMessages();
  return <p role="alert">{m.route_error()}</p>;
}
