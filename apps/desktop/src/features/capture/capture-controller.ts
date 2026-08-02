import type { CaptureCapabilities, CaptureRequest } from '@/bindings/capture';

export type CaptureDraftState = {
  requestId: number;
  body: string;
  sectionId: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  closeConfirmationOpen: boolean;
  errorKey: string | null;
  capabilities: CaptureCapabilities | null;
  visible: boolean;
};

export function createCaptureDraftState(): CaptureDraftState {
  return {
    requestId: 0,
    body: '',
    sectionId: '',
    dirty: false,
    saving: false,
    saved: false,
    closeConfirmationOpen: false,
    errorKey: null,
    capabilities: null,
    visible: false,
  };
}

export function receiveCaptureRequest(
  current: CaptureDraftState,
  request: CaptureRequest,
  defaultSectionId: string,
): CaptureDraftState {
  const preserveDraft = current.dirty && current.body.trim().length > 0;
  return {
    ...current,
    requestId: request.requestId,
    body: preserveDraft ? current.body : request.prefill,
    sectionId: current.sectionId || defaultSectionId,
    dirty: preserveDraft || request.prefill.length > 0,
    saving: false,
    saved: false,
    closeConfirmationOpen: false,
    errorKey: null,
    capabilities: request.capabilities,
    visible: true,
  };
}

export function requestCaptureClose(current: CaptureDraftState): CaptureDraftState {
  if (current.dirty && current.body.trim().length > 0 && !current.saved) {
    return { ...current, closeConfirmationOpen: true };
  }
  return { ...current, visible: false, closeConfirmationOpen: false };
}

export function discardCaptureDraft(current: CaptureDraftState): CaptureDraftState {
  return {
    ...createCaptureDraftState(),
    capabilities: current.capabilities,
    visible: false,
  };
}

export function beginCaptureSave(current: CaptureDraftState): CaptureDraftState {
  return { ...current, saving: true, errorKey: null };
}

export function failCaptureSave(
  current: CaptureDraftState,
  errorKey = 'capture_save_error',
): CaptureDraftState {
  return { ...current, saving: false, errorKey, dirty: true };
}

export function finishCaptureSave(current: CaptureDraftState): CaptureDraftState {
  return {
    ...current,
    body: '',
    dirty: false,
    saving: false,
    saved: true,
    errorKey: null,
    visible: false,
  };
}
