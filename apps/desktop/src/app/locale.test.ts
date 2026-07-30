import { describe, expect, it } from 'vitest';

import { applyLocale, coerceLocale } from '@/app/locale';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';

describe('locale preference', () => {
  it('uses English for first launch and invalid values', () => {
    expect(coerceLocale(undefined)).toBe('en');
    expect(coerceLocale('de')).toBe('en');
  });

  it('applies French without reloading and updates document language', () => {
    applyLocale('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(localStorage.getItem('PARAGLIDE_LOCALE')).toBe('fr');
  });

  it('keeps message catalogs in parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
});
