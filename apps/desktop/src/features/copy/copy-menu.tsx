import { IconChevronDown, IconCopy, IconDots, IconEye } from '@tabler/icons-react';

import { useMessages } from '@/app/providers';
import type { CopyPreset } from '@/bindings/clipboard';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COPY_PRESET_MESSAGE_KEYS, COPY_PRESETS } from '@/features/copy/copy-preset';

function usePresetLabel() {
  const m = useMessages();
  return (preset: CopyPreset) => m[COPY_PRESET_MESSAGE_KEYS[preset]]();
}

export function CopyMenu({
  preset,
  onCopy,
  onPresetChange,
  onPreview,
}: {
  preset: CopyPreset;
  onCopy(): void;
  onPresetChange(preset: CopyPreset): void;
  onPreview(): void;
}) {
  const m = useMessages();
  const presetLabel = usePresetLabel();

  return (
    <ButtonGroup>
      <Button onClick={onCopy} size="sm" variant="ghost">
        <IconCopy data-icon="inline-start" />
        {m.selection_copy()}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={m.copy_menu_label({ preset: presetLabel(preset) })}
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <IconChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m.copy_choose_default()}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => onPresetChange(value as CopyPreset)}
              value={preset}
            >
              {COPY_PRESETS.map((candidate) => (
                <DropdownMenuRadioItem key={candidate} value={candidate}>
                  {presetLabel(candidate)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onPreview}>
              <IconEye />
              {m.copy_preview_action()}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

export function NoteCopyMenu({
  title,
  defaultPreset,
  onCopy,
  onPreview,
}: {
  title: string;
  defaultPreset: CopyPreset;
  onCopy(preset: CopyPreset): void;
  onPreview(preset: CopyPreset): void;
}) {
  const m = useMessages();
  const presetLabel = usePresetLabel();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={m.copy_note_menu_label({ title })}
        render={<Button size="icon-sm" variant="ghost" />}
      >
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.copy_as_label()}</DropdownMenuLabel>
          {COPY_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} onClick={() => onCopy(preset)}>
              <IconCopy />
              {presetLabel(preset)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onPreview(defaultPreset)}>
            <IconEye />
            {m.copy_preview_action()}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
