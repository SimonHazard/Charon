import { IconCheck, IconPalette } from '@tabler/icons-react';

import { usePreferences } from '@/app/providers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { m } from '@/paraglide/messages.js';

export function ThemeMenu() {
  const { theme, setTheme } = usePreferences();
  const options = [
    ['light', m.theme_light()],
    ['solarized', m.theme_solarized()],
    ['dark', m.theme_dark()],
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={m.theme_menu_label()} size="icon-sm" variant="ghost" />}
      >
        <IconPalette />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.theme_menu_label()}</DropdownMenuLabel>
          {options.map(([value, label]) => (
            <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
              {theme === value ? <IconCheck /> : null}
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
