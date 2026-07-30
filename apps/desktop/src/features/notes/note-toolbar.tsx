import { IconAdjustments, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';

import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function NoteToolbar({
  query,
  status,
  trash,
  searchRef,
  canCreate,
  onQueryChange,
  onStatusChange,
  onTrashChange,
  onCreate,
  onManageSections,
}: {
  query: string;
  status: 'all' | 'open' | 'done';
  trash: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  canCreate: boolean;
  onQueryChange(value: string): void;
  onStatusChange(value: 'all' | 'open' | 'done'): void;
  onTrashChange(value: boolean): void;
  onCreate(): void;
  onManageSections(): void;
}) {
  const m = useMessages();
  return (
    <div className="note-toolbar">
      <InputGroup className="note-search">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={m.note_search_label()}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={m.note_search_placeholder()}
          ref={searchRef}
          value={query}
        />
      </InputGroup>
      <ToggleGroup
        aria-label={m.note_status_filter_label()}
        onValueChange={(values) => {
          const value = values[0];
          if (value === 'all' || value === 'open' || value === 'done') onStatusChange(value);
        }}
        value={[status]}
      >
        <ToggleGroupItem value="all">{m.note_filter_all()}</ToggleGroupItem>
        <ToggleGroupItem value="open">{m.note_status_open()}</ToggleGroupItem>
        <ToggleGroupItem value="done">{m.note_status_done()}</ToggleGroupItem>
      </ToggleGroup>
      <Button
        aria-pressed={trash}
        onClick={() => onTrashChange(!trash)}
        variant={trash ? 'secondary' : 'outline'}
      >
        <IconTrash data-icon="inline-start" />
        {m.note_trash()}
      </Button>
      <Button onClick={onManageSections} size="icon" variant="outline">
        <IconAdjustments />
        <span className="sr-only">{m.section_manage()}</span>
      </Button>
      <Button disabled={!canCreate || trash} onClick={onCreate}>
        <IconPlus data-icon="inline-start" />
        {m.note_new()}
      </Button>
    </div>
  );
}
