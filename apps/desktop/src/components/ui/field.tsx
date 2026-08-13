import { cn } from '@/lib/utils';

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: Field groups one label, control, and local error.
    <div
      role="group"
      data-slot="field"
      className={cn(
        'group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Callers supply htmlFor.
    <label
      data-slot="field-label"
      className={cn(
        'flex w-fit items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function FieldError({ className, children, ...props }: React.ComponentProps<'div'>) {
  if (!children) return null;
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('text-sm font-normal text-destructive', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Field, FieldError, FieldLabel };
