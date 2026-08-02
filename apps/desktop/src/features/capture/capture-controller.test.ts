import { describe, expect, it } from 'vitest';

import type { CaptureRequest } from '@/bindings/capture';
import {
  beginCaptureSave,
  createCaptureDraftState,
  discardCaptureDraft,
  failCaptureSave,
  finishCaptureSave,
  receiveCaptureRequest,
  requestCaptureClose,
} from '@/features/capture/capture-controller';

const request = (requestId: number, prefill: string): CaptureRequest => ({
  requestId,
  trigger: 'doubleShift',
  prefill,
  capabilities: {
    platform: 'macos',
    standardShortcut: 'available',
    doubleShift: 'available',
    selectedText: 'available',
    activeShortcut: 'CmdOrCtrl+Shift+Space',
  },
});

describe('capture controller', () => {
  it('stays visually hidden until the native coordinator hands off a request', () => {
    const initial = createCaptureDraftState();
    expect(initial.visible).toBe(false);
    expect(receiveCaptureRequest(initial, request(1, ''), 'inbox').visible).toBe(true);
  });

  it('prefills an empty draft and preserves a dirty draft on repeated trigger', () => {
    const first = receiveCaptureRequest(createCaptureDraftState(), request(1, 'selected'), 'inbox');
    expect(first).toMatchObject({ body: 'selected', sectionId: 'inbox', dirty: true });
    const edited = { ...first, body: 'edited locally', dirty: true };
    const repeated = receiveCaptureRequest(edited, request(2, 'replacement'), 'later');
    expect(repeated).toMatchObject({
      requestId: 2,
      body: 'edited locally',
      sectionId: 'inbox',
      visible: true,
    });
  });

  it('requires confirmation only for a non-empty dirty draft', () => {
    expect(requestCaptureClose(createCaptureDraftState()).visible).toBe(false);
    const dirty = {
      ...receiveCaptureRequest(createCaptureDraftState(), request(1, ''), 'inbox'),
      body: 'keep me',
      dirty: true,
    };
    expect(requestCaptureClose(dirty)).toMatchObject({
      visible: true,
      closeConfirmationOpen: true,
    });
    expect(discardCaptureDraft(dirty)).toMatchObject({ body: '', dirty: false, visible: false });
  });

  it('preserves content on save failure and clears it only after success', () => {
    const draft = { ...createCaptureDraftState(), body: 'local body', dirty: true };
    expect(failCaptureSave(beginCaptureSave(draft))).toMatchObject({
      body: 'local body',
      dirty: true,
      saving: false,
      errorKey: 'capture_save_error',
    });
    expect(finishCaptureSave(draft)).toMatchObject({
      body: '',
      dirty: false,
      saved: true,
      visible: false,
    });
  });
});
