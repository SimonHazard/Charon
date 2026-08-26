import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon-xs' | 'icon-sm';

const variants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80',
  outline:
    'border-border bg-background hover:bg-[var(--surface-hover)] active:bg-[var(--surface-pressed)] hover:text-foreground aria-expanded:bg-[var(--surface-pressed)] aria-expanded:text-foreground',
  ghost:
    'hover:bg-[var(--surface-hover)] active:bg-[var(--surface-pressed)] hover:text-foreground aria-expanded:bg-[var(--surface-pressed)] aria-expanded:text-foreground',
  destructive:
    'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive',
};

const sizes: Record<ButtonSize, string> = {
  default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
  sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
  'icon-sm': 'size-7 rounded-md',
};

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-transform [transition-duration:var(--motion-duration-direct)] [transition-timing-function:var(--motion-easing-direct)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:scale-[var(--motion-press-scale)] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export { Button };
