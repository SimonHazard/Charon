import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommandRegistration } from '@/app/commands/command-provider';
import type { AppCommand } from '@/app/commands/command-registry';
import { createCaptureCommands } from '@/app/commands/default-commands';
import { AppProviders } from '@/app/providers';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { tauriCaptureClient } from '@/lib/ipc/capture-client';
import { isTauriRuntime } from '@/lib/platform';

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  const location = useLocation();
  const captureRoute = location.pathname === '/capture';
  return (
    <Toaster>
      <TooltipProvider>
        <AppProviders>
          {captureRoute ? (
            <Outlet />
          ) : (
            <AppShell>
              <RouteCommands />
              <Outlet />
            </AppShell>
          )}
        </AppProviders>
      </TooltipProvider>
    </Toaster>
  );
}

function RouteCommands() {
  const navigate = useNavigate();
  const [doubleShiftAvailable, setDoubleShiftAvailable] = useState(false);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    void tauriCaptureClient.capabilities().then((capabilities) => {
      if (active) setDoubleShiftAvailable(capabilities.doubleShift === 'available');
    });
    return () => {
      active = false;
    };
  }, []);
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
      ...createCaptureCommands({
        doubleShiftAvailable,
        openCapture: async () => {
          await tauriCaptureClient.open();
        },
      }),
    ],
    [doubleShiftAvailable, navigate],
  );
  useCommandRegistration(commands);
  return null;
}
