import {
  IconCheck,
  IconFolderSymlink,
  IconGitMerge,
  IconRotateClockwise,
  IconTrash,
} from '@tabler/icons-react';
import { AnimatePresence, m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import type { CopyPreset } from '@/bindings/clipboard';
import type { SectionDto } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CopyMenu } from '@/features/copy/copy-menu';
import { motionProfiles } from '@/motion/system';

export function SelectionBar({
  count,
  sections,
  onSetDone,
  onSetOpen,
  onMove,
  moveOpen,
  onMoveOpenChange,
  copyPreset,
  onCopy,
  onCopyPresetChange,
  onCopyPreview,
  onMerge,
  onTrash,
}: {
  count: number;
  sections: readonly SectionDto[];
  onSetDone(): void;
  onSetOpen(): void;
  onMove(sectionId: string): void;
  moveOpen: boolean;
  onMoveOpenChange(open: boolean): void;
  copyPreset: CopyPreset;
  onCopy(): void;
  onCopyPresetChange(preset: CopyPreset): void;
  onCopyPreview(): void;
  onMerge(): void;
  onTrash(): void;
}) {
  const m = useMessages();
  return (
    <AnimatePresence initial={false}>
      {count > 0 ? (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="selection-bar transient-material"
          data-testid="selection-bar"
          exit={{ opacity: 0, x: 'var(--motion-surface-distance)' }}
          initial={{ opacity: 0, x: 'var(--motion-surface-distance)' }}
          transition={motionProfiles.surface}
        >
          <strong>
            {count === 1 ? m.selection_count_one() : m.selection_count_many({ count })}
          </strong>
          <Button onClick={onSetDone} size="sm" variant="ghost">
            <IconCheck data-icon="inline-start" />
            {m.selection_done()}
          </Button>
          <Button onClick={onSetOpen} size="sm" variant="ghost">
            <IconRotateClockwise data-icon="inline-start" />
            {m.selection_open()}
          </Button>
          <DropdownMenu onOpenChange={onMoveOpenChange} open={moveOpen}>
            <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
              <IconFolderSymlink data-icon="inline-start" />
              {m.selection_move()}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>{m.selection_move_destination()}</DropdownMenuLabel>
                {sections.map((section) => (
                  <DropdownMenuItem key={section.id} onClick={() => onMove(section.id)}>
                    {section.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <CopyMenu
            onCopy={onCopy}
            onPresetChange={onCopyPresetChange}
            onPreview={onCopyPreview}
            preset={copyPreset}
          />
          <Button disabled={count < 2} onClick={onMerge} size="sm" variant="ghost">
            <IconGitMerge data-icon="inline-start" />
            {m.selection_merge()}
          </Button>
          <Button onClick={onTrash} size="sm" variant="destructive">
            <IconTrash data-icon="inline-start" />
            {m.selection_trash()}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
