import type * as React from 'react';

import { cn } from '@/lib/utils';

/** A displayed key combination (AGENTS.md: shortcuts use semantic `kbd` markup). */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-[0.3125rem] bg-[var(--kbd-surface)] px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

export { Kbd };
