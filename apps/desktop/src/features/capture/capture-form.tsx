import { IconChevronDown, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { formatShortcut } from '@/app/commands/command-registry';
import { useMessages } from '@/app/providers';
import type { SectionDto } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

export function CaptureForm({
  body,
  sectionId,
  sections,
  saving,
  saved,
  error,
  textareaRef,
  onBodyChange,
  onSectionChange,
  onSave,
  onClose,
}: {
  body: string;
  sectionId: string;
  sections: readonly SectionDto[];
  saving: boolean;
  saved: boolean;
  error: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onBodyChange(body: string): void;
  onSectionChange(sectionId: string): void;
  onSave(): void;
  onClose(): void;
}) {
  const m = useMessages();
  const [sectionOpen, setSectionOpen] = useState(false);
  const selectedSection = sections.find((section) => section.id === sectionId);
  const saveDisabled = saving || saved || body.trim().length === 0 || !selectedSection;
  const saveShortcut = formatShortcut(
    'Mod+Enter',
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  );

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="capture-markdown">{m.capture_markdown_label()}</FieldLabel>
        <Textarea
          aria-invalid={Boolean(error)}
          autoFocus
          id="capture-markdown"
          onChange={(event) => onBodyChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (!saveDisabled) onSave();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder={m.capture_markdown_placeholder()}
          ref={textareaRef}
          value={body}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{m.capture_section_label()}</FieldLabel>
        <Popover onOpenChange={setSectionOpen} open={sectionOpen}>
          <PopoverTrigger
            render={
              <Button
                aria-expanded={sectionOpen}
                className="capture-section-trigger"
                disabled={sections.length === 0}
                role="combobox"
                variant="outline"
              />
            }
          >
            <span>{selectedSection?.name ?? m.capture_section_empty()}</span>
            <IconChevronDown data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent align="start" className="capture-section-popover">
            <PopoverHeader className="sr-only">
              <PopoverTitle>{m.capture_section_label()}</PopoverTitle>
            </PopoverHeader>
            <Command>
              <CommandInput placeholder={m.capture_section_search()} />
              <CommandList>
                <CommandEmpty>{m.capture_section_no_match()}</CommandEmpty>
                <CommandGroup>
                  {sections.map((section) => (
                    <CommandItem
                      data-checked={section.id === sectionId}
                      key={section.id}
                      onSelect={() => {
                        onSectionChange(section.id);
                        setSectionOpen(false);
                      }}
                    >
                      {section.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Field>
      <div className="capture-actions">
        <Button onClick={onClose} type="button" variant="ghost">
          <IconX data-icon="inline-start" />
          {m.common_close()}
          <Kbd>Esc</Kbd>
        </Button>
        <Button disabled={saveDisabled} onClick={onSave} type="button">
          <IconDeviceFloppy data-icon="inline-start" />
          {saving ? m.capture_saving() : m.common_save()}
          <KbdGroup>
            {saveShortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        </Button>
      </div>
    </FieldGroup>
  );
}
