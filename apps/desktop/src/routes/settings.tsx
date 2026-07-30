import { createFileRoute } from '@tanstack/react-router';

import { useMessages } from '@/app/providers';
import { WorkspaceState } from '@/components/workspace-state';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
  errorComponent: RouteError,
});

function SettingsRoute() {
  const m = useMessages();
  return (
    <section aria-labelledby="settings-heading" className="route-surface">
      <div className="route-heading">
        <h1 id="settings-heading" tabIndex={-1}>
          {m.settings_title()}
        </h1>
        <p>{m.settings_description()}</p>
      </div>
      <WorkspaceState>
        {() => <p className="route-placeholder">{m.settings_placeholder()}</p>}
      </WorkspaceState>
    </section>
  );
}

function RouteError() {
  const m = useMessages();
  return <p role="alert">{m.route_error()}</p>;
}
