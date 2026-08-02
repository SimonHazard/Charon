import { IconArrowUp } from '@tabler/icons-react';
import { useState } from 'react';

import { useMessages } from '@/app/providers';
import { Field, FieldError } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

export function CaptureInput({
  sectionName,
  onCreate,
}: {
  sectionName: string;
  onCreate(body: string): Promise<void>;
}) {
  const m = useMessages();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const body = value.trim();

  const submit = async () => {
    if (!body || pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onCreate(body);
      setValue('');
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
          <InputGroupAddon align="inline-start">
            <InputGroupText>{sectionName}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-invalid={failed}
            aria-label={m.capture_input_label({ section: sectionName })}
            disabled={pending}
            onChange={(event) => {
              setValue(event.target.value);
              setFailed(false);
            }}
            placeholder={m.capture_input_placeholder()}
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
}
