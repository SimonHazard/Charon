import { IconCheck, IconLanguage } from '@tabler/icons-react';

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

export function LocaleMenu() {
  const { locale, setLocale } = usePreferences();
  const options = [
    ['en', m.locale_english()],
    ['fr', m.locale_french()],
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={m.locale_menu_label()} size="icon-sm" variant="ghost" />}
      >
        <IconLanguage />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.locale_menu_label()}</DropdownMenuLabel>
          {options.map(([value, label]) => (
            <DropdownMenuItem key={value} onClick={() => setLocale(value)}>
              {locale === value ? <IconCheck /> : null}
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
