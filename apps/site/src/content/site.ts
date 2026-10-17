export type Locale = 'en' | 'fr';
export type PageKind = 'home';

export const downloadUrl = 'https://github.com/SimonHazard/Charon/releases';

export const routes: Record<Locale, Record<PageKind, string>> = {
  en: { home: '/' },
  fr: { home: '/fr/' },
};

/** A sample Note shown as it would leave Charon; the try section composes it live. */
export type SampleNote = { body: string; tags: readonly string[] };

const sampleBody =
  'The retry should back off exponentially, cap at 30 seconds, and never retry a 4xx.';
const sampleBodyFr =
  'Le retry doit reculer de façon exponentielle, plafonner à 30 secondes et ne jamais relancer une 4xx.';
const notePath = '/Volumes/Work/Charon/notes/7f3a91c2-5d0e-4b8a-9f61-2c7d84e1b3a0.md';
const attachmentPath =
  '/Volumes/Work/Charon/attachments/7f3a91c2-5d0e-4b8a-9f61-2c7d84e1b3a0/c41e08d5-6b2f-4e9a-8d17-93a5f0c2e6b4.png';

/** `ClipboardComposer::inline_code`: a backtick run one longer than the longest inside. */
function inlineCode(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${value} ${fence}`;
}

/** The text `Copy as Markdown` writes for one Note (desktop `clipboard/composer.rs`). */
export function composeMarkdown(
  body: string,
  tags: readonly string[],
  attachments: readonly { name: string; path: string }[] = [],
): string {
  let output = body;
  if (tags.length) output += `\n\n**Tags:** ${tags.map(inlineCode).join(' ')}`;
  if (attachments.length) {
    output += '\n\n**Attachments:**';
    for (const { name, path } of attachments) {
      output += `\n- ${inlineCode(name)}: ${inlineCode(path)}`;
    }
  }
  return output;
}

export const copy = {
  en: {
    skip: 'Skip to content',
    footerLinks: 'External links',
    pageLinks: 'On this page',
    nav: { how: 'How it works', try: 'Try it', privacy: 'Privacy' },
    titleLines: ['Keep what', 'matters.'],
    title: 'Keep what matters.',
    intro:
      'Capture your ideas, keep them locally as Markdown, and copy them when you need context for an AI agent.',
    download: 'Download Charon',
    releaseStatus: 'v0.3.0 is available in early access for macOS, Windows, and Linux.',
    howTitle: 'From selection to prompt.',
    exchanges: [
      {
        step: 'First, select text in any app and press [[Shift]] twice.',
        callLabel: 'What you selected',
        call: sampleBody,
        responseLabel: 'The Markdown file Charon writes',
        response: `${notePath}\n\n${sampleBody}`,
      },
      {
        step: 'Then tag it, drop in a screenshot, or draw on it.',
        callLabel: 'What you add',
        call: 'Tags: api, retries. File: screenshot.png',
        responseLabel: 'Your folder afterwards',
        response:
          '/Volumes/Work/Charon/\n  charon.workspace.json  (tags: api, retries)\n  notes/7f3a91c2-….md\n  attachments/7f3a91c2-…/c41e08d5-….png',
      },
      {
        step: 'Finally, choose Copy as Markdown and paste it into your agent.',
        callLabel: 'What you choose',
        call: 'Copy as Markdown',
        responseLabel: 'What your clipboard holds',
        response: composeMarkdown(
          sampleBody,
          ['api', 'retries'],
          [{ name: 'screenshot.png', path: attachmentPath }],
        ),
      },
    ],
    platformNote:
      'Double Shift captures selected text on macOS and is experimental on Windows and Linux X11. Everywhere, a shortcut opens the composer so you can type.',
    tryTitle: 'Try Copy as Markdown',
    tryLabel: 'Write a note',
    tryAnswer: 'What Copy as Markdown would put on your clipboard',
    tryExamples: 'Other notes to try',
    tryEmpty: 'Write something first: Charon never copies an empty note.',
    tryCopy: 'Copy',
    tryCopied: 'Copied',
    samples: [
      { body: 'Ship the beta on Friday', tags: ['release'] },
      { body: 'Use pgvector for search', tags: ['database', 'decision'] },
      { body: 'Explain this stack trace', tags: [] },
      { body: 'Rename the billing service', tags: ['refactor'] },
    ] satisfies SampleNote[],
    privacyTitle: 'Privacy',
    facts: [
      { label: 'Version', value: '0.3.0, early access' },
      { label: 'Runs on', value: 'macOS on Apple Silicon, Windows, Linux' },
      { label: 'Price', value: 'Free, MIT licensed' },
    ],
    privacy:
      'Charon is local-only. There is no account, no sync, no analytics, and no telemetry, and nothing you keep leaves your computer. It touches the clipboard only after a gesture of yours, and its one network request, the update check, stays off until you turn it on.',
    lists: [
      {
        title: 'Captures',
        items: [
          ['Selected text', 'double Shift'],
          ['Typed notes', 'composer shortcut'],
          ['Files', 'drop or paste'],
          ['Screenshots', 'paste'],
          ['Sketches', 'shapes and labels'],
        ],
      },
      {
        title: 'Keeps',
        items: [
          ['Notes', 'Markdown files'],
          ['Tags', 'up to 16 a note'],
          ['Attachments', 'up to 20 a note'],
          ['Updates', 'off by default'],
          ['Account', 'none'],
        ],
      },
    ],
    closeLines: ['Your next prompt', 'starts here.'],
    releaseNote:
      'An experimental side project. See the release notes for installation instructions.',
    credit: 'River animation: Threads by React Bits',
  },
  fr: {
    skip: 'Aller au contenu',
    footerLinks: 'Liens externes',
    pageLinks: 'Sur cette page',
    nav: { how: 'Fonctionnement', try: 'Essayer', privacy: 'Confidentialité' },
    titleLines: ['Gardez', 'l’essentiel.'],
    title: 'Gardez l’essentiel.',
    intro:
      'Capturez vos idées, gardez-les en Markdown sur votre ordinateur et copiez-les pour donner du contexte à un agent IA.',
    download: 'Télécharger Charon',
    releaseStatus: 'La v0.3.0 est disponible en accès anticipé pour macOS, Windows et Linux.',
    howTitle: 'De la sélection au prompt.',
    exchanges: [
      {
        step: 'D’abord, sélectionnez du texte dans n’importe quelle app et appuyez deux fois sur [[Maj]].',
        callLabel: 'Ce que vous avez sélectionné',
        call: sampleBodyFr,
        responseLabel: 'Le fichier Markdown que Charon écrit',
        response: `${notePath}\n\n${sampleBodyFr}`,
      },
      {
        step: 'Ensuite, ajoutez des tags, déposez une capture d’écran ou dessinez.',
        callLabel: 'Ce que vous ajoutez',
        call: 'Tags : api, retries. Fichier : capture.png',
        responseLabel: 'Votre dossier ensuite',
        response:
          '/Volumes/Work/Charon/\n  charon.workspace.json  (tags : api, retries)\n  notes/7f3a91c2-….md\n  attachments/7f3a91c2-…/c41e08d5-….png',
      },
      {
        step: 'Enfin, choisissez Copier en Markdown et collez dans votre agent.',
        callLabel: 'Ce que vous choisissez',
        call: 'Copier en Markdown',
        responseLabel: 'Ce que contient votre presse-papiers',
        response: composeMarkdown(
          sampleBodyFr,
          ['api', 'retries'],
          [{ name: 'capture.png', path: attachmentPath }],
        ),
      },
    ],
    platformNote:
      'Le double Maj capture le texte sélectionné sur macOS et reste expérimental sur Windows et Linux X11. Partout, un raccourci ouvre le champ de saisie pour écrire.',
    tryTitle: 'Essayer Copier en Markdown',
    tryLabel: 'Écrivez une note',
    tryAnswer: 'Ce que Copier en Markdown placerait dans votre presse-papiers',
    tryExamples: 'D’autres notes à essayer',
    tryEmpty: 'Écrivez d’abord quelque chose : Charon ne copie jamais une note vide.',
    tryCopy: 'Copier',
    tryCopied: 'Copié',
    samples: [
      { body: 'Livrer la bêta vendredi', tags: ['release'] },
      { body: 'Utiliser pgvector pour la recherche', tags: ['base', 'décision'] },
      { body: 'Expliquer cette stack trace', tags: [] },
      { body: 'Renommer le service de facturation', tags: ['refactor'] },
    ] satisfies SampleNote[],
    privacyTitle: 'Confidentialité',
    facts: [
      { label: 'Version', value: '0.3.0, accès anticipé' },
      { label: 'Plateformes', value: 'macOS sur Apple Silicon, Windows, Linux' },
      { label: 'Prix', value: 'Gratuit, sous licence MIT' },
    ],
    privacy:
      'Charon fonctionne uniquement en local. Ni compte, ni synchronisation, ni statistiques, ni télémétrie, et rien de ce que vous gardez ne quitte votre ordinateur. Il ne touche au presse-papiers qu’après un geste de votre part, et sa seule requête réseau, la recherche de mises à jour, reste désactivée tant que vous ne l’activez pas.',
    lists: [
      {
        title: 'Capture',
        items: [
          ['Texte sélectionné', 'double Maj'],
          ['Notes tapées', 'raccourci de saisie'],
          ['Fichiers', 'dépôt ou collage'],
          ['Captures d’écran', 'collage'],
          ['Croquis', 'formes et libellés'],
        ],
      },
      {
        title: 'Conserve',
        items: [
          ['Notes', 'fichiers Markdown'],
          ['Tags', 'jusqu’à 16 par note'],
          ['Pièces jointes', 'jusqu’à 20 par note'],
          ['Mises à jour', 'désactivées par défaut'],
          ['Compte', 'aucun'],
        ],
      },
    ],
    closeLines: ['Votre prochain prompt', 'commence ici.'],
    releaseNote:
      'Un projet personnel expérimental. Consultez les notes de version pour les instructions d’installation.',
    credit: 'Animation de la rivière : Threads de React Bits',
  },
} as const;

/** Splits copy on `[[Key]]` markers so each key renders in `kbd` markup. */
export function keyParts(text: string): { text: string; key: boolean }[] {
  return text
    .split(/(\[\[[^\]]+\]\])/u)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('[[') ? { text: part.slice(2, -2), key: true } : { text: part, key: false },
    );
}
