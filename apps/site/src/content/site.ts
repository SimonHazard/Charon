export type Locale = 'en' | 'fr';
export type PageKind = 'home' | 'privacy' | 'download' | 'changelog';

export const routes: Record<Locale, Record<PageKind, string>> = {
  en: { home: '/', privacy: '/privacy/', download: '/download/', changelog: '/changelog/' },
  fr: {
    home: '/fr/',
    privacy: '/fr/confidentialite/',
    download: '/fr/telechargement/',
    changelog: '/fr/changelog/',
  },
};

export const copy = {
  en: {
    skip: 'Skip to content',
    privacy: 'Privacy',
    releases: 'Releases',
    changelog: 'Changelog',
    viewReleases: 'View releases',
    title: 'Keep what matters.',
    intro: 'Charon is taking shape. More soon.',
    privacyTitle: 'Privacy is a local contract',
    privacyIntro: 'Charon works without an account, sync service, analytics, or content upload.',
    privacySections: [
      [
        'Workspace ownership',
        'Notes, Tags, and managed Attachment copies stay in the local Workspace you choose. React never reads Workspace files or Attachment bytes directly.',
      ],
      [
        'Selected text',
        'On supported macOS builds, Accessibility reads selected text. If direct access returns nothing, one bounded source Copy may place that selection briefly on the system clipboard, where a clipboard manager could see it. Charon restores prior clipboard contents only when no concurrent write occurred.',
      ],
      [
        'Explicit copy',
        'Copy as Markdown writes Note text, optional Tags, and canonical paths to managed Attachment copies. It does not copy Attachment bytes, upload content, paste, or change Note state.',
      ],
      [
        'Deletion limits',
        'A successful permanent Delete removes active Markdown and managed Attachment bytes from the Workspace and normal completed Charon transaction backups. Operating-system snapshots, external backups, and synchronized-folder histories remain outside that guarantee.',
      ],
      [
        'Legacy files',
        'Schema v1 content is moved to a visible user-owned legacy Markdown archive during migration. It is not merged silently into active Notes.',
      ],
      [
        'This site',
        'This static site is served as ordinary files by Cloudflare Workers Static Assets. Cloudflare processes ordinary connection metadata to deliver it. Charon enables no Web Analytics or persistent Worker observability and adds no account, form, tracker, advertising script, runtime API, third-party embed, preview URL, or Access cookie.',
      ],
    ],
    downloadTitle: 'Releases, with evidence',
    downloadIntro:
      'Signed public installers are not available yet. Follow the repository release page for verified artifacts when they are published.',
    noRelease:
      'Current state: source and automated build work are available; no signed installer is claimed.',
    changelogTitle: 'Changelog',
    changelogIntro: 'Only shipped, verifiable changes appear here.',
    changeDate: 'August 2026',
    changeItems: [
      'Flat local Note shelf with Open and Done results',
      'Lightweight Tags and Note-owned managed Attachments',
      'Explicit Copy as Markdown with local path disclosure',
      'Solarized-first appearance with Light and Dark choices',
    ],
  },
  fr: {
    skip: 'Aller au contenu',
    privacy: 'Confidentialité',
    releases: 'Versions',
    changelog: 'Nouveautés',
    viewReleases: 'Voir les versions',
    title: 'Gardez l’essentiel.',
    intro: 'Charon prend forme. La suite arrive bientôt.',
    privacyTitle: 'La confidentialité est un contrat local',
    privacyIntro:
      'Charon fonctionne sans compte, synchronisation, analytics ni téléversement de contenu.',
    privacySections: [
      [
        'Propriété du Workspace',
        'Les Notes, Tags et copies de pièces jointes gérées restent dans le Workspace local choisi. React ne lit jamais directement les fichiers du Workspace ni les octets des pièces jointes.',
      ],
      [
        'Texte sélectionné',
        'Sur les builds macOS pris en charge, Accessibilité lit le texte sélectionné. Si l’accès direct ne renvoie rien, un unique Copier borné peut placer brièvement la sélection dans le presse-papiers système, où un gestionnaire pourrait la voir. Charon ne restaure le contenu précédent qu’en l’absence d’écriture concurrente.',
      ],
      [
        'Copie explicite',
        'Copier en Markdown écrit le texte, les Tags facultatifs et les chemins canoniques des copies gérées. Cette action ne copie pas les octets, ne téléverse rien, ne colle rien et ne change pas l’état de la Note.',
      ],
      [
        'Limites de suppression',
        'Une suppression définitive réussie retire le Markdown actif et les octets gérés du Workspace et des sauvegardes de transaction Charon normales et terminées. Les instantanés du système, sauvegardes externes et historiques synchronisés restent hors de cette garantie.',
      ],
      [
        'Fichiers hérités',
        'Le contenu du schéma v1 est déplacé pendant la migration vers une archive Markdown visible appartenant à l’utilisateur. Il n’est pas fusionné silencieusement avec les Notes actives.',
      ],
      [
        'Ce site',
        'Ce site statique est servi comme fichiers ordinaires par Cloudflare Workers Static Assets. Cloudflare traite les métadonnées de connexion ordinaires nécessaires à sa livraison. Charon n’active ni Web Analytics ni observabilité Worker persistante et n’ajoute ni compte, ni formulaire, ni tracker, ni publicité, ni API d’exécution, ni intégration tierce, ni URL de prévisualisation, ni cookie Access.',
      ],
    ],
    downloadTitle: 'Des versions appuyées par des preuves',
    downloadIntro:
      'Les installateurs publics signés ne sont pas encore disponibles. Suivez la page des versions du dépôt pour les artefacts vérifiés lorsqu’ils seront publiés.',
    noRelease:
      'État actuel : le code source et les automatisations de build sont disponibles ; aucun installateur signé n’est annoncé.',
    changelogTitle: 'Nouveautés',
    changelogIntro: 'Seuls les changements livrés et vérifiables paraissent ici.',
    changeDate: 'Août 2026',
    changeItems: [
      'Étagère locale de Notes avec résultats Ouvertes et Terminées',
      'Tags légers et pièces jointes gérées appartenant à une Note',
      'Copier en Markdown explicite avec divulgation des chemins locaux',
      'Apparence Solarized par défaut avec choix Clair et Sombre',
    ],
  },
} as const;
