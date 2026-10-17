import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-[var(--material-scrim)] opacity-100 backdrop-blur-[4px] transition-opacity [transition-duration:var(--motion-duration-transient)] data-ending-style:[transition-duration:var(--motion-duration-transient-exit)] [transition-timing-function:var(--motion-easing-transient)] data-starting-style:opacity-0 data-ending-style:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-1rem)] w-[min(24rem,calc(100vw-1rem))] max-w-none -translate-x-1/2 -translate-y-1/2 gap-3 dialog-glass overflow-y-auto overscroll-contain rounded-[var(--radius-dialog)] pt-5 text-popover-foreground [&>*:not([data-slot=dialog-footer])]:mx-5 opacity-100 shadow-[var(--shadow-modal)] outline-none transition-[transform,opacity] [transition-duration:var(--motion-duration-transient)] data-ending-style:[transition-duration:var(--motion-duration-transient-exit)] [transition-timing-function:var(--motion-easing-transient)] data-starting-style:transform-[scale(var(--motion-transient-scale))] data-starting-style:opacity-0 data-ending-style:transform-[scale(var(--motion-transient-scale))] data-ending-style:opacity-0 motion-reduce:transform-none motion-reduce:[transition-property:opacity]',
          className,
        )}
        {...props}
      />
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('grid gap-1 text-left', className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 rounded-b-[calc(var(--radius-dialog)-1px)] border-t border-[var(--material-outline)] bg-[var(--surface-inset)]/70 px-5 py-3.5 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
};
