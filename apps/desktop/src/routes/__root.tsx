import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCaptureEditor } from '@/app/capture-editor-context';
import { useCommandRegistration } from '@/app/commands/command-provider';
import type { AppCommand } from '@/app/commands/command-registry';
import { createCaptureCommands } from '@/app/commands/default-commands';
import { AppProviders, useMessages } from '@/app/providers';
import type { CaptureCapabilities, CapturePermissionKind } from '@/bindings/capture';
import { AppShell } from '@/components/app-shell';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { tauriCaptureClient } from '@/lib/ipc/capture-client';
import { isTauriRuntime } from '@/lib/platform';

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
  const m = useMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const locationPathRef = useRef(location.pathname);
  const { receive: receiveEditorRequest } = useCaptureEditor();
  const [captureCapabilities, setCaptureCapabilities] = useState<CaptureCapabilities | null>(null);
  const refreshCaptureCapabilities = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      setCaptureCapabilities(await tauriCaptureClient.capabilities());
    } catch {
      // Capability refresh is non-blocking; portable capture remains available.
    }
  }, []);
  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    void refreshCaptureCapabilities();
    window.addEventListener('focus', refreshCaptureCapabilities);
    return () => {
      window.removeEventListener('focus', refreshCaptureCapabilities);
    };
  }, [refreshCaptureCapabilities]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void Promise.all([
      tauriCaptureClient.subscribeEditor((request) => {
        if (!active) return;
        receiveEditorRequest(request);
        if (locationPathRef.current !== '/notes') {
          void navigate({ to: '/notes', search: { section: undefined } });
        }
      }),
      tauriCaptureClient.subscribeStatus((status) => {
        if (!active) return;
        const description =
          (m as unknown as Record<string, () => string>)[status.messageKey]?.() ??
          m.capture_error_unknown();
        toast.add({ title: m.capture_status_error_title(), description, type: 'error' });
      }),
    ]).then((stops) => {
      if (active) {
        unsubscribe = () =>
          stops.forEach((stop) => {
            stop();
          });
      } else {
        stops.forEach((stop) => {
          stop();
        });
      }
      if (active) void tauriCaptureClient.editorReady();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [m, navigate, receiveEditorRequest]);
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
        doubleShiftState: captureCapabilities?.doubleShift ?? 'unsupported',
        inputMonitoringState: captureCapabilities?.inputMonitoring ?? 'unsupported',
        accessibilityState: captureCapabilities?.accessibility ?? 'unsupported',
        selectedTextState: captureCapabilities?.selectedText ?? 'unsupported',
        openEditor: async () => {
          await tauriCaptureClient.open();
        },
        requestPermission: async (permission: CapturePermissionKind) => {
          setCaptureCapabilities(await tauriCaptureClient.requestPermission(permission));
        },
      }),
    ],
    [captureCapabilities, navigate],
  );
  useCommandRegistration(commands);
  return null;
}
