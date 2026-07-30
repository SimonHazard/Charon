import { IconChartBarOff } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';

import { useMessages } from '@/app/providers';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export const Route = createFileRoute('/stats')({
  component: StatsRoute,
  errorComponent: RouteError,
});

function StatsRoute() {
  const m = useMessages();
  return (
    <section aria-labelledby="stats-heading" className="route-surface">
      <h1 className="sr-only" id="stats-heading">
        {m.stats_title()}
      </h1>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconChartBarOff />
          </EmptyMedia>
          <EmptyTitle>{m.stats_disabled_title()}</EmptyTitle>
          <EmptyDescription>{m.stats_disabled_description()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}

function RouteError() {
  const m = useMessages();
  return <p role="alert">{m.route_error()}</p>;
}
