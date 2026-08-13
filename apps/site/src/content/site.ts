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
    localeName: 'English',
    switchName: 'Français',
    skip: 'Skip to content',
    product: 'Product',
    privacy: 'Privacy',
    releases: 'Releases',
    changelog: 'Changelog',
    theme: 'Appearance',
    solarized: 'Solarized',
    light: 'Light',
    dark: 'Dark',
    viewReleases: 'View releases',
    source: 'View source',
    eyebrow: 'A rapid local capture shelf',
    title: 'Select it. Shift twice. Keep it.',
    intro:
      'On a proved macOS build, Charon turns selected text into one ordinary local Note without taking focus. Everywhere else, one portable shortcut focuses the composer.',
    ownership: 'No account. No sync. Your Markdown stays in a folder you control.',
    captureTitle: 'One gesture, one Note',
    captureBody:
      'Double Shift observes only the modifier sequence on supported macOS builds. Charon reads the accessible selection first, then may use one bounded Copy fallback when the source app exposes no text.',
    selected: 'Verify the empty state before adding another control.',
    note: 'One ordinary local Note',
    enrichTitle: 'Shape the useful part, quietly',
    enrichBody:
      'Open the live row to write or preview Markdown. Add lightweight Tags and one managed Attachment copy when the context matters.',
    copyTitle: 'Agent-ready means explicit',
    copyBody:
      'Copy as Markdown writes the Note body, optional Tags, and safe managed file paths. It never copies Attachment bytes or pastes for you. You choose where to paste and attach files.',
    specimen:
      '# Agent handoff\n\nVerify the empty state before adding another control.\n\nTags: Research, Agent\nAttachments:\n- release-brief.pdf: /Documents/Charon/attachments/…/release-brief.pdf',
    localTitle: 'Local files are the product boundary.',
    localBody:
      'Notes, Tags, and managed Attachment copies live inside one visible Workspace. Charon has no content upload, analytics, telemetry, or crash upload.',
    platformTitle: 'Honest platform support',
    platformMac: 'macOS',
    platformMacValue: 'Double Shift after explicit permissions, plus portable composer focus',
    platformLinux: 'Linux',
    platformLinuxValue: 'Portable composer focus and manual capture',
    platformWindows: 'Windows',
    platformWindowsValue: 'Portable composer focus and manual capture',
    releaseTitle: 'Built in public, released when signed',
    releaseBody:
      'No installer is presented as ready until the exact artifact is signed, verified, and linked from a GitHub Release.',
    mediaAlt:
      'The real Charon desktop shelf in Solarized, showing local Notes with Tags and one managed Attachment.',
    demoCaption: 'A real synthetic-data walkthrough of the Charon shelf.',
    transcript: 'Demo transcript',
    transcriptBody:
      'Charon opens on a synthetic local Workspace. A Note is opened from the shelf, showing Write and Preview, Tags, and a managed Attachment name. No private data appears.',
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
    footer: 'Local Markdown, deliberately.',
  },
  fr: {
    localeName: 'Français',
    switchName: 'English',
    skip: 'Aller au contenu',
    product: 'Produit',
    privacy: 'Confidentialité',
    releases: 'Versions',
    changelog: 'Nouveautés',
    theme: 'Apparence',
    solarized: 'Solarized',
    light: 'Clair',
    dark: 'Sombre',
    viewReleases: 'Voir les versions',
    source: 'Voir le code source',
    eyebrow: 'Une étagère de capture locale et rapide',
    title: 'Sélectionnez. Deux fois Maj. Gardez.',
    intro:
      'Sur un build macOS éprouvé, Charon transforme le texte sélectionné en une Note locale ordinaire sans voler le focus. Ailleurs, un raccourci portable active le compositeur.',
    ownership:
      'Sans compte ni synchronisation. Votre Markdown reste dans le dossier que vous contrôlez.',
    captureTitle: 'Un geste, une Note',
    captureBody:
      'Double Maj observe uniquement la séquence de modificateur sur les builds macOS pris en charge. Charon lit d’abord la sélection accessible, puis peut utiliser un unique Copier borné si l’app source n’expose aucun texte.',
    selected: 'Vérifier l’état vide avant d’ajouter un autre contrôle.',
    note: 'Une Note locale ordinaire',
    enrichTitle: 'Façonnez l’essentiel, sans bruit',
    enrichBody:
      'Ouvrez la ligne active pour écrire ou prévisualiser le Markdown. Ajoutez des Tags légers et une copie de pièce jointe gérée lorsque le contexte compte.',
    copyTitle: 'Prêt pour un agent veut dire explicite',
    copyBody:
      'Copier en Markdown écrit le corps, les Tags facultatifs et les chemins sûrs des fichiers gérés. Charon ne copie jamais les octets des pièces jointes et ne colle pas à votre place.',
    specimen:
      '# Passage à l’agent\n\nVérifier l’état vide avant d’ajouter un autre contrôle.\n\nTags : Recherche, Agent\nPièces jointes :\n- release-brief.pdf : /Documents/Charon/attachments/…/release-brief.pdf',
    localTitle: 'Les fichiers locaux sont la frontière du produit.',
    localBody:
      'Notes, Tags et copies de pièces jointes gérées vivent dans un Workspace visible. Charon ne téléverse aucun contenu et ne contient ni analytics, ni télémétrie, ni envoi de crash.',
    platformTitle: 'Un support plateforme honnête',
    platformMac: 'macOS',
    platformMacValue:
      'Double Maj après autorisations explicites, plus activation portable du compositeur',
    platformLinux: 'Linux',
    platformLinuxValue: 'Activation portable du compositeur et capture manuelle',
    platformWindows: 'Windows',
    platformWindowsValue: 'Activation portable du compositeur et capture manuelle',
    releaseTitle: 'Construit publiquement, publié une fois signé',
    releaseBody:
      'Aucun installateur n’est présenté comme prêt avant que l’artefact exact soit signé, vérifié et lié depuis une GitHub Release.',
    mediaAlt:
      'La véritable étagère desktop Charon en Solarized, avec des Notes locales, des Tags et une pièce jointe gérée.',
    demoCaption: 'Une démonstration réelle de Charon avec des données synthétiques.',
    transcript: 'Transcription de la démonstration',
    transcriptBody:
      'Charon s’ouvre sur un Workspace local synthétique. Une Note est ouverte depuis l’étagère et montre Écrire, Aperçu, les Tags et le nom d’une pièce jointe gérée. Aucune donnée privée ne paraît.',
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
    footer: 'Du Markdown local, délibérément.',
  },
} as const;
