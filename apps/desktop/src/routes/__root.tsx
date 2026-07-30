import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';

import { useCommandRegistration } from '@/app/commands/command-provider';
import type { AppCommand } from '@/app/commands/command-registry';
import { AppProviders } from '@/app/providers';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <Toaster>
      <TooltipProvider>
        <AppProviders>
          <AppShell>
            <RouteCommands />
            <Outlet />
          </AppShell>
        </AppProviders>
      </TooltipProvider>
    </Toaster>
  );
}

function RouteCommands() {
  const navigate = useNavigate();
  const commands = useMemo<AppCommand[]>(
    () => [
      {
        id: 'navigation.notes',
        labelKey: 'command_navigation_notes',
        descriptionKey: 'command_navigation_notes_description',
        category: 'navigation',
        defaultShortcut: 'Mod+1',
        isAvailable: () => true,
        execute: () => navigate({ to: '/notes', search: { section: undefined } }),
      },
      {
        id: 'navigation.settings',
        labelKey: 'command_navigation_settings',
        descriptionKey: 'command_navigation_settings_description',
        category: 'navigation',
        defaultShortcut: 'Mod+2',
        isAvailable: () => true,
        execute: () => navigate({ to: '/settings' }),
      },
      {
        id: 'navigation.stats',
        labelKey: 'command_navigation_stats',
        descriptionKey: 'command_navigation_stats_description',
        category: 'navigation',
        defaultShortcut: 'Mod+3',
        isAvailable: () => true,
        execute: () => navigate({ to: '/stats' }),
      },
    ],
    [navigate],
  );
  useCommandRegistration(commands);
  return null;
}
