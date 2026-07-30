import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useMessages } from '@/app/providers';
import type { WorkspaceCommandDraft } from '@/app/workspace-context';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { nextSectionSortKey, reorderSectionCommand } from '@/features/notes/note-commands';
import { orderedSections } from '@/features/notes/note-view-model';

export function SectionManager({
  open,
  snapshot,
  onOpenChange,
  onCommand,
}: {
  open: boolean;
  snapshot: WorkspaceSnapshot;
  onOpenChange(open: boolean): void;
  onCommand(command: WorkspaceCommandDraft): Promise<unknown>;
}) {
  const m = useMessages();
  const [name, setName] = useState('');
  const sections = orderedSections(snapshot);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="section-manager-dialog">
        <DialogHeader>
          <DialogTitle>{m.section_manage()}</DialogTitle>
          <DialogDescription>{m.section_manage_description()}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void onCommand({
              type: 'createSection',
              name: name.trim(),
              sortKey: nextSectionSortKey(sections),
            })
              .then(() => setName(''))
              .catch(() => undefined);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-section">{m.section_new_label()}</FieldLabel>
              <div className="section-create-row">
                <Input
                  id="new-section"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
                <Button disabled={!name.trim()} type="submit">
                  <IconPlus data-icon="inline-start" />
                  {m.section_create()}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
        <div className="section-manager-list">
          {sections.map((section, index) => {
            const noteCount = snapshot.notes.filter((note) => note.sectionId === section.id).length;
            return (
              <form
                className="section-manager-row"
                key={section.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const nextName = String(data.get('name') ?? '').trim();
                  if (nextName && nextName !== section.name) {
                    void onCommand({
                      type: 'renameSection',
                      sectionId: section.id,
                      name: nextName,
                    }).catch(() => undefined);
                  }
                }}
              >
                <Input
                  aria-label={m.section_rename_label({ name: section.name })}
                  defaultValue={section.name}
                  name="name"
                />
                <Button type="submit" variant="outline">
                  {m.common_save()}
                </Button>
                <Button
                  aria-label={m.section_move_up({ name: section.name })}
                  disabled={index === 0}
                  onClick={() => {
                    const command = reorderSectionCommand(sections, section.id, -1);
                    if (command) void onCommand(command).catch(() => undefined);
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconArrowUp />
                </Button>
                <Button
                  aria-label={m.section_move_down({ name: section.name })}
                  disabled={index === sections.length - 1}
                  onClick={() => {
                    const command = reorderSectionCommand(sections, section.id, 1);
                    if (command) void onCommand(command).catch(() => undefined);
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconArrowDown />
                </Button>
                <Button
                  aria-label={m.section_delete_label({ name: section.name })}
                  disabled={noteCount > 0 || sections.length === 1}
                  onClick={() =>
                    void onCommand({ type: 'deleteSection', sectionId: section.id }).catch(
                      () => undefined,
                    )
                  }
                  size="icon-sm"
                  title={noteCount > 0 ? m.section_delete_blocked() : undefined}
                  type="button"
                  variant="destructive"
                >
                  <IconTrash />
                </Button>
              </form>
            );
          })}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
