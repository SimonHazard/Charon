import { IconArrowDown, IconArrowUp, IconFolder } from '@tabler/icons-react';
import { m as motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { NoteDto, SectionDto } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motionProfiles } from '@/motion/system';

export const MERGE_SEPARATOR = '\n\n---\n\n';

export function mergePreview(notes: readonly NoteDto[]): string {
  return notes.map((note) => note.body.trimEnd()).join(MERGE_SEPARATOR);
}

export function MergeDialog({
  notes,
  sections,
  open,
  onOpenChange,
  onConfirm,
}: {
  notes: readonly NoteDto[];
  sections: readonly SectionDto[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(noteIds: string[], sectionId: string): Promise<void>;
}) {
  const m = useMessages();
  const [ordered, setOrdered] = useState<readonly NoteDto[]>(notes);
  const [sectionId, setSectionId] = useState(notes[0]?.sectionId ?? sections[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOrdered(notes);
    setSectionId(notes[0]?.sectionId ?? sections[0]?.id ?? '');
    setBusy(false);
    setError(false);
  }, [notes, open, sections]);
  const destination = sections.find((section) => section.id === sectionId);
  const preview = useMemo(() => mergePreview(ordered), [ordered]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target] as NoteDto, next[index] as NoteDto];
    setOrdered(next);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="merge-dialog">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          initial={{ opacity: 0, scale: 0.98 }}
          transition={motionProfiles.surface}
        >
          <DialogHeader>
            <DialogTitle>{m.merge_title()}</DialogTitle>
            <DialogDescription>{m.merge_description()}</DialogDescription>
          </DialogHeader>
          <div className="merge-layout">
            <div className="merge-sources">
              <strong>{m.merge_source_order()}</strong>
              {ordered.map((note, index) => (
                <div className="merge-source-row" key={note.id}>
                  <span>
                    {note.body.split(/\r?\n/u).find((line) => line.trim()) || m.note_untitled()}
                  </span>
                  <Button
                    aria-label={m.merge_move_up({ position: index + 1 })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <IconArrowUp />
                  </Button>
                  <Button
                    aria-label={m.merge_move_down({ position: index + 1 })}
                    disabled={index === ordered.length - 1}
                    onClick={() => move(index, 1)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <IconArrowDown />
                  </Button>
                </div>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  <IconFolder data-icon="inline-start" />
                  {destination?.name ?? m.merge_choose_destination()}
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{m.merge_destination()}</DropdownMenuLabel>
                    {sections.map((section) => (
                      <DropdownMenuItem key={section.id} onClick={() => setSectionId(section.id)}>
                        {section.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="merge-preview">
              <strong>{m.merge_preview()}</strong>
              <pre>{preview}</pre>
            </div>
          </div>
          <DialogFooter>
            {error ? <p role="alert">{m.merge_error()}</p> : null}
            <Button
              disabled={busy || ordered.length < 2 || !sectionId}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm(
                    ordered.map((note) => note.id),
                    sectionId,
                  );
                  onOpenChange(false);
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? m.merge_confirming() : m.merge_confirm()}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
