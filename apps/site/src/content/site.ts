export type Locale = 'en' | 'fr';
export type PageKind = 'home';

export const routes: Record<Locale, Record<PageKind, string>> = {
  en: { home: '/' },
  fr: { home: '/fr/' },
};

export const copy = {
  en: {
    skip: 'Skip to content',
    footerLinks: 'External links',
    title: 'Keep what matters.',
    intro: 'Charon is taking shape. More soon.',
  },
  fr: {
    skip: 'Aller au contenu',
    footerLinks: 'Liens externes',
    title: 'Gardez l’essentiel.',
    intro: 'Charon prend forme. La suite arrive bientôt.',
  },
} as const;
