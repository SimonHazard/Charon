import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/utils';

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn('flex w-fit items-center rounded-lg', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap outline-none hover:bg-[var(--control-hover)] active:bg-[var(--control-pressed)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-pressed:border-[var(--selection-border)] data-pressed:bg-[var(--selection-surface)] data-pressed:text-[var(--selection-text)] data-pressed:hover:bg-[var(--selection-surface)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
