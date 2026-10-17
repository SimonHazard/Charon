'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useRef } from 'react';

import { cn } from '@/lib/utils';

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

function Tooltip({ actionsRef, onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  const ownActionsRef = useRef<TooltipPrimitive.Root.Actions>(null);
  const actions = actionsRef ?? ownActionsRef;
  return (
    <TooltipPrimitive.Root
      actionsRef={actions}
      data-slot="tooltip"
      onOpenChange={(open, details) => {
        if (!open && details.reason === 'escape-key') {
          // A Tooltip never claims Escape (docs/UX.md): it closes, and the surface behind it
          // (Preferences, the editor, a dialog) still receives the key, unprevented.
          details.cancel();
          details.allowPropagation();
          actions.current?.close();
          return;
        }
        onOpenChange?.(open, details);
      }}
      {...props}
    />
  );
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  // The rendered control keeps its own data-slot (Button's "button"), which CSS keys on.
  return <TooltipPrimitive.Trigger data-tooltip-trigger="" {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[60]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'dropdown-glass inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-snug text-popover-foreground shadow-[var(--shadow-control)] transition-[transform,opacity] [transition-duration:var(--motion-duration-transient)] data-ending-style:[transition-duration:var(--motion-duration-transient-exit)] [transition-timing-function:var(--motion-easing-transient)] has-data-[slot=kbd]:pr-1.5 data-closed:invisible data-instant:transition-none data-starting-style:transform-[scale(var(--motion-transient-scale))] data-starting-style:opacity-0 data-ending-style:transform-[scale(var(--motion-transient-scale))] data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:[transition-property:opacity] **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:rounded-sm',
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
