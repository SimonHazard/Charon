import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon' | 'icon-xs' | 'icon-sm';

// Iris controls (ADR 0028): a 1px top highlight on solid controls, muted icons on quiet ones,
// and semantic hover/pressed roles instead of opacity mixtures.
const variants: Record<ButtonVariant, string> = {
  default:
    'border-[var(--action-border)] bg-primary text-primary-foreground shadow-[var(--shadow-control)] not-disabled:inset-shadow-[0_1px_rgb(255_255_255/16%)] hover:bg-[var(--action-hover)] active:bg-[var(--action-pressed)] active:inset-shadow-[0_1px_rgb(0_0_0/8%)]',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-[var(--control-pressed)] active:bg-[var(--control-pressed)]',
  outline:
    '[--control-icon-color:var(--text-muted)] border-input bg-[var(--field-surface)] text-foreground shadow-[var(--shadow-control)] hover:bg-[var(--control-hover)] active:bg-[var(--control-pressed)] aria-expanded:bg-[var(--control-pressed)]',
  ghost:
    '[--control-icon-color:var(--text-muted)] text-foreground hover:bg-[var(--control-hover)] hover:[--control-icon-color:currentColor] active:bg-[var(--control-pressed)] aria-expanded:bg-[var(--control-pressed)] aria-expanded:[--control-icon-color:currentColor]',
  destructive:
    'bg-[var(--danger-surface)] text-[var(--danger-text)] hover:bg-[var(--danger-hover)] active:bg-[var(--danger-pressed)] hover:border-destructive focus-visible:border-destructive',
};

const sizes: Record<ButtonSize, string> = {
  default:
    'h-8 gap-1.5 px-[calc(--spacing(3)-1px)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
  sm: "h-7 gap-1 px-[calc(--spacing(2.5)-1px)] text-[0.8125rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  icon: 'size-8',
  'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3.5",
  'icon-sm': 'size-7',
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
        "group/button relative inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,scale,background-color,border-color,color] [transition-duration:var(--motion-duration-direct)] [transition-timing-function:var(--motion-easing-direct)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:scale-[var(--motion-press-scale)] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-[var(--control-icon-color,currentColor)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export { Button };
