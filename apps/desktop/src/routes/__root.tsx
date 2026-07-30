import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <Toaster>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </Toaster>
  );
}
