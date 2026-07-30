import {
  baseLocale,
  getLocale,
  isLocale,
  setLocale as setParaglideLocale,
} from '@/paraglide/runtime.js';

export type AppLocale = 'en' | 'fr';

export function readLocale(): AppLocale {
  try {
    const locale = getLocale();
    return isLocale(locale) ? locale : baseLocale;
  } catch {
    return baseLocale;
  }
}

export function applyLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
  setParaglideLocale(locale, { reload: false });
}

export function coerceLocale(value: unknown): AppLocale {
  return value === 'fr' ? 'fr' : 'en';
}
