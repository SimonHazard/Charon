import { IconAlertTriangle, IconFolderPlus, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkspaceState({ children }: { children(snapshot: WorkspaceSnapshot): ReactNode }) {
  const m = useMessages();
  const state = useWorkspace();
  const errorMessage =
    state.error &&
    ((m as unknown as Record<string, (() => string) | undefined>)[state.error.messageKey]?.() ??
      m.workspace_error_unknown());

  if (state.status === 'loading') {
    return (
      <div aria-label={m.workspace_loading()} className="workspace-loading" role="status">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFolderPlus />
          </EmptyMedia>
          <EmptyTitle>{m.workspace_empty_title()}</EmptyTitle>
          <EmptyDescription>{errorMessage || m.workspace_empty_description()}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            disabled={!state.canChooseWorkspace || state.isChoosingWorkspace}
            onClick={() => void state.chooseWorkspace()}
          >
            {state.isChoosingWorkspace ? m.workspace_choosing() : m.workspace_choose()}
          </Button>
          {state.error ? (
            <div className="workspace-recovery-actions">
              <Button onClick={() => void state.retryWorkspaceStartup()} variant="ghost">
                {m.common_retry()}
              </Button>
              <Button onClick={() => void state.openDefaultWorkspace()} variant="outline">
                {m.workspace_use_default()}
              </Button>
            </div>
          ) : null}
        </EmptyContent>
      </Empty>
    );
  }

  if (state.status === 'error') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconAlertTriangle />
          </EmptyMedia>
          <EmptyTitle>{m.workspace_error_title()}</EmptyTitle>
          <EmptyDescription>{errorMessage || m.workspace_error_description()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {state.status === 'warning' ? (
        <div className="workspace-warning" role="alert">
          <IconInfoCircle />
          <span>{errorMessage || m.workspace_warning()}</span>
        </div>
      ) : null}
      {children(state.snapshot)}
    </>
  );
}
