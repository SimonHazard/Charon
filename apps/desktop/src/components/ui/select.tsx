import { Select as SelectPrimitive } from '@base-ui/react/select';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';

import { cn } from '@/lib/utils';

function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>,
) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-[var(--size-control-sm)] w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-field)] border border-input bg-field px-[calc(--spacing(3)-1px)] text-left text-sm shadow-[var(--shadow-control)] text-foreground outline-none select-none transition-[background-color,border-color,color] [transition-duration:var(--motion-duration-direct)] [transition-timing-function:var(--motion-easing-direct)] hover:border-[var(--border-strong)] hover:bg-[var(--control-hover)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-[var(--control-hover)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-inset)] disabled:text-muted-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon" className="flex text-muted-foreground">
        <IconChevronDown aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('min-w-0 flex-1 truncate', className)}
      {...props}
    />
  );
}

function SelectContent({
  className,
  children,
  align = 'start',
  alignOffset = 0,
  alignItemWithTrigger = false,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'alignItemWithTrigger' | 'side' | 'sideOffset'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'dropdown-glass z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-[var(--radius-field)] p-1 text-sm text-popover-foreground shadow-[var(--shadow-floating)] outline-hidden transition-[transform,opacity] [transition-duration:var(--motion-duration-transient)] data-ending-style:[transition-duration:var(--motion-duration-transient-exit)] [transition-timing-function:var(--motion-easing-transient)] data-starting-style:transform-[scale(var(--motion-transient-scale))] data-starting-style:opacity-0 data-ending-style:transform-[scale(var(--motion-transient-scale))] data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:[transition-property:opacity]',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List data-slot="select-list">{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-7 w-full cursor-default items-center rounded-[0.375rem] py-1 pr-8 pl-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-60 data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <IconCheck aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
