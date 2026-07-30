import { IconChartBar, IconNotes, IconSettings } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import { buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { motionProfiles } from '@/motion/system';

function RailNavigation({ onNavigate }: { onNavigate?(): void }) {
  const m = useMessages();
  const links = [
    { to: '/notes', label: m.navigation_notes(), icon: IconNotes },
    { to: '/settings', label: m.navigation_settings(), icon: IconSettings },
    { to: '/stats', label: m.navigation_stats(), icon: IconChartBar },
  ] as const;

  return (
    <nav aria-label={m.navigation_label()} className="rail-navigation">
      {links.map(({ to, label, icon: Icon }) => (
        <Link
          activeProps={{ 'data-active': true }}
          className={cn(buttonVariants({ variant: 'ghost' }), 'rail-link')}
          key={to}
          onClick={onNavigate}
          to={to}
        >
          <Icon data-icon="inline-start" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function SectionRail({
  mobileOpen,
  onMobileOpenChange,
}: {
  mobileOpen: boolean;
  onMobileOpenChange(open: boolean): void;
}) {
  const m = useMessages();
  return (
    <>
      <aside className="section-rail">
        <RailNavigation />
      </aside>
      <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
        <SheetContent className="mobile-rail" side="left">
          <SheetHeader>
            <SheetTitle>{m.navigation_label()}</SheetTitle>
            <SheetDescription>{m.navigation_description()}</SheetDescription>
          </SheetHeader>
          <motion.div
            animate={{
              opacity: mobileOpen ? 1 : 0,
              x: mobileOpen ? 0 : 'calc(-1 * var(--motion-surface-distance))',
            }}
            className="origin-left"
            initial={{
              opacity: 0,
              x: 'calc(-1 * var(--motion-surface-distance))',
            }}
            transition={motionProfiles.surface}
          >
            <RailNavigation onNavigate={() => onMobileOpenChange(false)} />
          </motion.div>
        </SheetContent>
      </Sheet>
    </>
  );
}
