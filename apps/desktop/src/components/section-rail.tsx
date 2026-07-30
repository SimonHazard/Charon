import { IconChartBar, IconNotes, IconSettings } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { orderedSections, sectionCounts } from '@/features/notes/note-view-model';
import { cn } from '@/lib/utils';
import { motionProfiles } from '@/motion/system';

function RailNavigation({ onNavigate }: { onNavigate?(): void }) {
  const m = useMessages();
  const workspace = useWorkspace();
  const snapshot = workspace.snapshot;
  const countsBySection = snapshot ? sectionCounts(snapshot) : null;
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
      {snapshot ? (
        <div className="rail-sections">
          <span className="rail-section-heading">{m.navigation_sections()}</span>
          {orderedSections(snapshot).map((section) => {
            const counts = countsBySection?.get(section.id) ?? {
              open: 0,
              done: 0,
              trash: 0,
            };
            return (
              <Link
                aria-label={m.navigation_section_counts({
                  name: section.name,
                  open: counts.open,
                  done: counts.done,
                  trash: counts.trash,
                })}
                className={cn(buttonVariants({ variant: 'ghost' }), 'rail-link rail-section-link')}
                key={section.id}
                onClick={onNavigate}
                search={{ section: section.id }}
                to="/notes"
              >
                <span className="rail-section-name">{section.name}</span>
                <span className="rail-section-counts" aria-hidden="true">
                  <Badge variant="secondary">{counts.open}</Badge>
                  <Badge variant="outline">{counts.done}</Badge>
                  {counts.trash > 0 ? <Badge variant="destructive">{counts.trash}</Badge> : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
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
