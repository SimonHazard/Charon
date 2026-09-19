export type Locale = 'en' | 'fr';
export type PageKind = 'home';

export const downloadUrl = 'https://github.com/SimonHazard/Charon/releases';

export const routes: Record<Locale, Record<PageKind, string>> = {
  en: { home: '/' },
  fr: { home: '/fr/' },
};

export const copy = {
  en: {
    skip: 'Skip to content',
    footerLinks: 'External links',
    title: 'Keep what matters.',
    intro:
      'Capture your ideas, keep them locally as Markdown, and copy them when you need context for an AI agent.',
    releaseStatus: 'Early access coming soon',
    download: 'Downloads on GitHub',
    downloadNote:
      'The first macOS, Windows, and Linux installers will be published on GitHub Releases.',
    releaseNote:
      'An experimental side project. Installation instructions will accompany each release.',
  },
  fr: {
    skip: 'Aller au contenu',
    footerLinks: 'Liens externes',
    title: 'Gardez l’essentiel.',
    intro:
      'Capturez vos idées, gardez-les en Markdown sur votre ordinateur et copiez-les pour donner du contexte à un agent IA.',
    releaseStatus: 'L’early access arrive bientôt',
    download: 'Téléchargements sur GitHub',
    downloadNote:
      'Les premiers installateurs macOS, Windows et Linux seront publiés sur GitHub Releases.',
    releaseNote:
      'Un projet personnel expérimental. Chaque version sera accompagnée de ses instructions d’installation.',
  },
} as const;
