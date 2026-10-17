import { Input as InputPrimitive } from '@base-ui/react/input';
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-[var(--radius-field)] border border-input bg-field px-[calc(--spacing(3)-1px)] py-1 text-sm shadow-[var(--shadow-control)] outline-none transition-[border-color,box-shadow] [transition-duration:var(--motion-duration-direct)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--text-placeholder)] placeholder:opacity-100 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-inset)] disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
