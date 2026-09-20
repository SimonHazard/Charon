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
    releaseStatus: 'v0.1.0 is available in early access',
    download: 'Download Charon',
    downloadNote: 'Available for macOS, Windows, and Linux on GitHub Releases.',
    releaseNote:
      'An experimental side project. See the release notes for installation instructions.',
  },
  fr: {
    skip: 'Aller au contenu',
    footerLinks: 'Liens externes',
    title: 'Gardez l’essentiel.',
    intro:
      'Capturez vos idées, gardez-les en Markdown sur votre ordinateur et copiez-les pour donner du contexte à un agent IA.',
    releaseStatus: 'La v0.1.0 est disponible en accès anticipé',
    download: 'Télécharger Charon',
    downloadNote: 'Disponible pour macOS, Windows et Linux sur GitHub Releases.',
    releaseNote:
      'Un projet personnel expérimental. Consultez les notes de version pour les instructions d’installation.',
  },
} as const;
