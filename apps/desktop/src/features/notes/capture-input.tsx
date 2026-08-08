import { IconArrowUp } from '@tabler/icons-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import { Field, FieldError } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

export type CaptureInputHandle = { focus(): void };

export const CaptureInput = forwardRef<
  CaptureInputHandle,
  {
    onCreate(body: string): Promise<void>;
    onCreated?(): void;
  }
>(function CaptureInput({ onCreate, onCreated }, forwardedRef) {
  const m = useMessages();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const body = value.trim();

  useImperativeHandle(forwardedRef, () => ({ focus: () => inputRef.current?.focus() }), []);

  const submit = async () => {
    if (!body || pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onCreate(body);
      setValue('');
      onCreated?.();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
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
        <InputGroup>
          <InputGroupInput
            aria-invalid={failed}
            aria-label={m.capture_input_label_flat()}
            disabled={pending}
            onChange={(event) => {
              setValue(event.target.value);
              setFailed(false);
            }}
            placeholder={m.capture_input_placeholder()}
            ref={inputRef}
            value={value}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={pending ? m.capture_input_saving() : m.capture_input_submit()}
              disabled={!body || pending}
              size="icon-xs"
              type="submit"
            >
              <IconArrowUp aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {failed ? <FieldError>{m.capture_input_error()}</FieldError> : null}
      </Field>
    </form>
  );
});
