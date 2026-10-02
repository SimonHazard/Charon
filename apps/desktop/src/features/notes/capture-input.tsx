import { IconArrowUp } from '@tabler/icons-react';
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type CaptureInputHandle = { focus(): void };

// WebKitGTK and older macOS WebKit lack `field-sizing: content`; grow there by measurement.
const nativeFieldSizing =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('field-sizing', 'content');

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const maxHeightRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const submittingRef = useRef(false);
  const newlineHintId = useId();
  const body = value.trim();

  useEffect(() => {
    onDirtyChange?.(value.length > 0 || pending);
    return () => onDirtyChange?.(false);
  }, [onDirtyChange, pending, value]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    // Re-measure after every value change, including programmatic clears.
    void value;
    if (nativeFieldSizing || !element) return;
    if (maxHeightRef.current === null) {
      maxHeightRef.current = Number.parseFloat(getComputedStyle(element).maxHeight);
    }
    const maxHeight = maxHeightRef.current;
    element.style.height = 'auto';
    const height = Number.isFinite(maxHeight)
      ? Math.min(element.scrollHeight, maxHeight)
      : element.scrollHeight;
    element.style.height = `${height}px`;
  }, [value]);

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
          <Textarea
            className="capture-field-input"
            aria-describedby={newlineHintId}
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
              if (event.key !== 'Enter') return;
              if (
                composingRef.current ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              ) {
                event.preventDefault();
                return;
              }
              if (event.shiftKey) return;
              event.preventDefault();
              void submit();
            }}
            placeholder={m.capture_input_placeholder()}
            readOnly={pending}
            ref={inputRef}
            rows={1}
            value={value}
          />
          <span className="sr-only" id={newlineHintId}>
            {m.capture_input_newline_hint()}
          </span>
          <Tooltip>
            <TooltipTrigger
              aria-label={pending ? m.capture_input_saving() : m.capture_input_submit()}
              className="capture-submit-button"
              // `disabled` stays on the Button: on the trigger it would only silence the Tooltip.
              // A disabled send button shows none; the placeholder explains the empty field.
              render={
                <Button
                  disabled={!body || pending}
                  size="icon-xs"
                  type="submit"
                  variant={body ? 'default' : 'ghost'}
                />
              }
            >
              <IconArrowUp aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{m.capture_input_submit()}</TooltipContent>
          </Tooltip>
        </fieldset>
        {failed ? <FieldError>{m.capture_input_error()}</FieldError> : null}
      </Field>
    </form>
  );
});
