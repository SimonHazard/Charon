import { IconArrowUp } from '@tabler/icons-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export type CaptureInputHandle = { focus(): void };

export const CaptureInput = forwardRef<
  CaptureInputHandle,
  {
    onCreate(body: string): Promise<void>;
    onDirtyChange?(dirty: boolean): void;
  }
>(function CaptureInput({ onCreate, onDirtyChange }, forwardedRef) {
  const m = useMessages();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const submittingRef = useRef(false);
  const body = value.trim();

  useEffect(() => {
    onDirtyChange?.(value.length > 0 || pending);
    return () => onDirtyChange?.(false);
  }, [onDirtyChange, pending, value]);

  useImperativeHandle(forwardedRef, () => ({ focus: () => inputRef.current?.focus() }), []);

  const submit = async () => {
    if (!body || submittingRef.current || composingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onCreate(body);
      setValue('');
    } catch {
      setFailed(true);
    } finally {
      submittingRef.current = false;
      setPending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <form
      className="note-capture-input"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field data-invalid={failed}>
        <fieldset className="capture-field">
          <Input
            className="capture-field-input"
            aria-invalid={failed}
            aria-label={m.capture_input_label()}
            aria-busy={pending}
            autoComplete="off"
            name="captureBody"
            onChange={(event) => {
              setValue(event.target.value);
              setFailed(false);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (composingRef.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229)
              ) {
                event.preventDefault();
              }
            }}
            placeholder={m.capture_input_placeholder()}
            readOnly={pending}
            ref={inputRef}
            value={value}
          />
          <Button
            aria-label={pending ? m.capture_input_saving() : m.capture_input_submit()}
            className="capture-submit-button"
            disabled={!body || pending}
            size="icon-xs"
            type="submit"
            variant={body ? 'default' : 'ghost'}
          >
            <IconArrowUp aria-hidden="true" />
          </Button>
        </fieldset>
        {failed ? <FieldError>{m.capture_input_error()}</FieldError> : null}
      </Field>
    </form>
  );
});
