import { IconAlertTriangle, IconBolt, IconLockAccess } from '@tabler/icons-react';
import { formatShortcut } from '@/app/commands/command-registry';
import { useMessages } from '@/app/providers';
import type { CaptureCapabilities } from '@/bindings/capture';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function CaptureStatus({
  capabilities,
  permissionPending,
  onRequestPermission,
}: {
  capabilities: CaptureCapabilities | null;
  permissionPending: boolean;
  onRequestPermission(): void;
}) {
  const m = useMessages();
  if (!capabilities) {
    return (
      <div
        aria-label={m.capture_status_loading()}
        aria-live="polite"
        className="capture-status"
        role="status"
      >
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const standardAvailable = capabilities.standardShortcut === 'available';
  const shortcut = formatShortcut(
    capabilities.activeShortcut,
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  ).join(' ');

  if (capabilities.doubleShift === 'available') {
    return (
      <div className="capture-status" data-state="available">
        <IconBolt aria-hidden="true" />
        <span>
          {standardAvailable
            ? m.capture_status_available({ shortcut })
            : m.capture_status_native_only()}
        </span>
      </div>
    );
  }

  if (capabilities.doubleShift === 'denied') {
    return (
      <div className="capture-status" data-state="denied">
        <IconLockAccess aria-hidden="true" />
        <span>
          {standardAvailable
            ? m.capture_status_denied({ shortcut })
            : m.capture_status_manual_only()}
        </span>
        <Button
          disabled={permissionPending}
          onClick={onRequestPermission}
          size="sm"
          variant="outline"
        >
          {permissionPending ? m.capture_permission_requesting() : m.capture_permission_request()}
        </Button>
      </div>
    );
  }

  return (
    <div className="capture-status" data-state={capabilities.doubleShift}>
      <IconAlertTriangle aria-hidden="true" />
      <span>
        {!standardAvailable
          ? m.capture_status_manual_only()
          : capabilities.doubleShift === 'error'
            ? m.capture_status_error({ shortcut })
            : m.capture_status_fallback({ shortcut })}
      </span>
    </div>
  );
}
