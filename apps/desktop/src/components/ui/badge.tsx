import { cn } from '@/lib/utils';

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[0.375rem] border border-transparent bg-secondary px-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground [&>svg]:pointer-events-none [&>svg]:size-3',
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
