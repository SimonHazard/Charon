import { m as MotionElement } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { CaptureCapabilities, CaptureRequest } from '@/bindings/capture';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  beginCaptureSave,
  createCaptureDraftState,
  discardCaptureDraft,
  failCaptureSave,
  finishCaptureSave,
  receiveCaptureRequest,
  requestCaptureClose,
} from '@/features/capture/capture-controller';
import { CaptureForm } from '@/features/capture/capture-form';
import { CaptureStatus } from '@/features/capture/capture-status';
import { createNoteCommand } from '@/features/notes/note-commands';
import { asCaptureError, type CaptureClient, tauriCaptureClient } from '@/lib/ipc/capture-client';
import { isTauriRuntime } from '@/lib/platform';
import { useMotionPreferences } from '@/motion/preferences';
import { motionProfiles, reducedSurfaceTransition, surfaceMotionStates } from '@/motion/system';

const browserCapabilities: CaptureCapabilities = {
  platform: 'unknown',
  standardShortcut: 'unsupported',
  doubleShift: 'unsupported',
  selectedText: 'unsupported',
  activeShortcut: 'CmdOrCtrl+Shift+Space',
};

const browserCaptureClient: CaptureClient = {
  capabilities: async () => browserCapabilities,
  open: async () => browserCapabilities,
  requestPermission: async () => browserCapabilities,
  setShortcut: async () => browserCapabilities,
  close: async () => undefined,
  subscribe: async () => () => undefined,
};

export function CaptureScreen({
  client = isTauriRuntime() ? tauriCaptureClient : browserCaptureClient,
}: {
  client?: CaptureClient;
}) {
  const m = useMessages();
  const workspace = useWorkspace();
  const preferences = useMotionPreferences();
  const [draft, setDraft] = useState(createCaptureDraftState);
  const [permissionPending, setPermissionPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sections = useMemo(
    () =>
      [...(workspace.snapshot?.sections ?? [])].sort(
        (left, right) => left.sortKey - right.sortKey || left.id.localeCompare(right.id),
      ),
    [workspace.snapshot?.sections],
  );
  const defaultSectionRef = useRef('');
  const defaultSectionId = sections[0]?.id ?? '';
  defaultSectionRef.current = defaultSectionId;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const onRequest = (request: CaptureRequest) => {
      if (!active) return;
      setDraft((current) => receiveCaptureRequest(current, request, defaultSectionRef.current));
    };
    const subscription = client.subscribe(onRequest);
    const capabilities = client.capabilities();
    void Promise.all([subscription, capabilities])
      .then(([stop, nextCapabilities]) => {
        if (!active) {
          stop();
          return;
        }
        unsubscribe = stop;
        setDraft((current) => ({ ...current, capabilities: nextCapabilities }));
      })
      .catch((error) => {
        if (!active) return;
        const captureError = asCaptureError(error);
        setDraft((current) => ({
          ...current,
          errorKey: captureError.messageKey,
          capabilities: current.capabilities ?? browserCapabilities,
        }));
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client]);

  useEffect(() => {
    if (draft.visible && draft.requestId >= 0) textareaRef.current?.focus();
  }, [draft.requestId, draft.visible]);

  useEffect(() => {
    if (!draft.sectionId && defaultSectionId) {
      setDraft((current) => ({ ...current, sectionId: defaultSectionId }));
    }
  }, [defaultSectionId, draft.sectionId]);

  const closeWindow = useCallback(async () => {
    setDraft((current) => requestCaptureClose(current));
    if (draft.dirty && draft.body.trim().length > 0 && !draft.saved) return;
    await client.close().catch(() => {
      setDraft((current) => failCaptureSave(current, 'capture_error_window_unavailable'));
    });
  }, [client, draft.body, draft.dirty, draft.saved]);

  const discardAndClose = useCallback(async () => {
    setDraft((current) => discardCaptureDraft(current));
    await client.close().catch(() => {
      setDraft((current) => failCaptureSave(current, 'capture_error_window_unavailable'));
    });
  }, [client]);

  const save = useCallback(async () => {
    const snapshot = workspace.snapshot;
    if (!snapshot || !draft.sectionId || !draft.body.trim() || draft.saving || draft.saved) return;
    setDraft((current) => beginCaptureSave(current));
    try {
      await workspace.executeWorkspaceCommand(
        createNoteCommand(snapshot.notes, draft.sectionId, draft.body),
      );
      setDraft((current) => finishCaptureSave(current));
      await client.close();
    } catch {
      setDraft((current) => failCaptureSave(current));
      textareaRef.current?.focus();
    }
  }, [client, draft.body, draft.saved, draft.saving, draft.sectionId, workspace]);

  const requestPermission = useCallback(async () => {
    setPermissionPending(true);
    try {
      const capabilities = await client.requestPermission();
      setDraft((current) => ({ ...current, capabilities, errorKey: null }));
    } catch (error) {
      const captureError = asCaptureError(error);
      setDraft((current) => ({ ...current, errorKey: captureError.messageKey }));
    } finally {
      setPermissionPending(false);
    }
  }, [client]);

  const error = draft.errorKey
    ? ((m as unknown as Record<string, () => string>)[draft.errorKey]?.() ?? m.capture_save_error())
    : workspace.status === 'empty'
      ? m.capture_workspace_empty()
      : sections.length === 0
        ? m.capture_section_empty_error()
        : null;
  const motionState = draft.visible
    ? surfaceMotionStates.visible
    : preferences.reducedMotion
      ? surfaceMotionStates.reducedHidden
      : surfaceMotionStates.hidden;

  return (
    <main className="capture-window">
      <MotionElement.section
        animate={motionState}
        className="capture-surface transient-material"
        initial={
          preferences.reducedMotion ? surfaceMotionStates.reducedHidden : surfaceMotionStates.hidden
        }
        transition={preferences.reducedMotion ? reducedSurfaceTransition : motionProfiles.surface}
      >
        <header className="capture-heading">
          <h1>{m.capture_title()}</h1>
          <p>{m.capture_description()}</p>
        </header>
        <CaptureForm
          body={draft.body}
          error={error}
          onBodyChange={(body) =>
            setDraft((current) => ({
              ...current,
              body,
              dirty: true,
              saved: false,
              errorKey: null,
            }))
          }
          onClose={() => void closeWindow()}
          onSave={() => void save()}
          onSectionChange={(sectionId) =>
            setDraft((current) => ({ ...current, sectionId, dirty: true, errorKey: null }))
          }
          saved={draft.saved}
          saving={draft.saving}
          sectionId={draft.sectionId}
          sections={sections}
          textareaRef={textareaRef}
        />
        <CaptureStatus
          capabilities={draft.capabilities}
          onRequestPermission={() => void requestPermission()}
          permissionPending={permissionPending}
        />
      </MotionElement.section>
      <AlertDialog
        onOpenChange={(open) =>
          setDraft((current) => ({ ...current, closeConfirmationOpen: open }))
        }
        open={draft.closeConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.capture_discard_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.capture_discard_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void discardAndClose()} variant="destructive">
              {m.capture_discard_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
