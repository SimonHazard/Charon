import type * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-[var(--radius-field)] border border-input bg-field px-[calc(--spacing(3)-1px)] py-[calc(--spacing(2)-1px)] text-sm shadow-[var(--shadow-control)] outline-none placeholder:text-[var(--text-placeholder)] placeholder:opacity-100 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-[var(--surface-inset)] disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
