# Charon feature backlog

Ce fichier regroupe des idées de fonctionnalités à qualifier avant
implémentation. Rien dans cette liste ne modifie le contrat v1, le périmètre
actif ou les ADR acceptées tant qu'une décision et, si nécessaire, un nouveau
plan/ADR n'ont pas été validés.

## Priorités proposées

- **P1** : amélioration directement liée à l'usage quotidien ou à la fiabilité.
- **P2** : fonctionnalité utile, mais avec une dépendance plateforme ou une
  décision produit à trancher.
- **P3** : amélioration de découverte, de documentation ou de finition.

## Backlog

### P2 — Conserver le formatage du texte capturé

**Objectif** : conserver autant que possible les informations de formatage
disponibles dans le texte sélectionné, avec un repli propre vers du texte brut
quand la source ne fournit pas de représentation exploitable.

**À qualifier** :

- quelles représentations sont acceptées (Markdown, texte enrichi, HTML
  converti, liens, listes, etc.) ;
- quelles applications et plateformes exposent réellement ce formatage ;
- comment éviter toute lecture de contenu supplémentaire, requête réseau ou
  accès non borné ;
- comment préserver le contrat de capture unique et les erreurs
  content-free.

**Contraintes** : la capture reste sous la responsabilité de
`CaptureCoordinator`, le contenu reste local, et le texte brut doit rester le
fallback déterministe.

**Statut** : planifié — plan 062 (ADR amendant l'ADR 0010, puis essai natif ;
  macOS via le repli Copy en premier, Windows/X11 en recherche seulement).

### P2 — Réduire l'application dans la zone de notification à la fermeture

**Objectif** : permettre, au choix de l'utilisateur, que la fermeture de la
fenêtre masque Charon tout en laissant le processus actif dans la zone de
notification / menu bar.

**À qualifier** :

- distinction claire entre fermer la fenêtre, masquer Charon et quitter
  réellement l'application ;
- comportement par plateforme (menu bar macOS, tray Windows/Linux) et
  comportement sans support tray ;
- menu d'icône, réouverture/focus du shelf, raccourci de sortie et état de
  l'option après redémarrage ;
- impact sur les raccourcis de capture, les permissions et la consommation de
  ressources.

**Contraintes** : aucune capture ou action supplémentaire ne doit devenir
  implicite. Le mode background doit rester local, explicite et désactivable.

**Statut** : planifié — plan 059 (ADR puis essai natif, option désactivée par
  défaut). Le plan 039 couvre d'abord le cas macOS sans icône : fermer la
  fenêtre la masque, le Dock la rouvre et `Cmd+Q` quitte.

### P2 — Reconfigurer les raccourcis de capture

**Objectif** : permettre de choisir les raccourcis de capture et de révélation
  du composer depuis Preferences.

**À qualifier** :

- raccourcis concernés : double-modificateur de capture, raccourci de reveal,
  ou les deux ;
- représentation et validation des séquences multi-touches ;
- détection des conflits avec les raccourcis système ou d'autres applications ;
- restauration d'un raccourci par défaut lorsque l'enregistrement échoue ;
- différences entre macOS, Windows, X11 et Wayland.

**Contraintes** : ne pas introduire d'injection arbitraire de touches, ne pas
  prétendre supporter une séquence que l'OS ne livre pas, et conserver le
  fallback composer utilisable même après refus de permission.

**Statut** : planifié — plan 061, limité au raccourci de révélation du
  composer (le double Maj reste fixe). `docs/PRODUCT.md` exclut aujourd'hui un
  « configurable shortcut catalog » : le plan commence par un ADR qui le
  restreint, soumis à validation.

### P2 — Notifications système à la création d'une Note

**Objectif** : proposer une notification système lorsque Charon crée une Note,
  avec activation/désactivation par l'utilisateur. Un clic sur la notification
  doit rouvrir Charon et amener directement l'utilisateur à l'édition de la
  Note concernée.

**À qualifier** :

- choix du contenu affiché (titre, extrait, ou message générique) et risque de
  divulgation sur un écran verrouillé ;
- comportement si Charon est réduit dans le tray, fermé, ou déjà ouvert ;
- expiration, doublons et échec d'ouverture de la Note ;
- accessibilité, localisation et comportement sans permission de notification.

**Contraintes** : opt-in explicite, aucune Note ne doit être envoyée sur le
  réseau, et la notification ne doit pas devenir un canal de persistance ou de
  synchronisation. Le clic doit cibler un UUID de Note local valide et rester
  sans effet destructif.

**Statut** : planifié — plan 060 (ADR puis essai natif). Le plan 045 fournit
  l'événement `capture_note_created` ; le clic vers la Note n'est pas fourni
  par le plugin officiel sur desktop et reste soumis à l'essai.

### P3 — Ajouter le lien GitHub dans Preferences

**Objectif** : ajouter un lien externe vers le dépôt GitHub de Charon dans
Preferences : [github.com/SimonHazard/Charon](https://github.com/SimonHazard/Charon).

**Contraintes** : ouverture uniquement après activation explicite du lien,
  sans iframe, tracking ou requête automatique depuis l'application.

**Statut** : planifié — plan 057, avec l'élément suivant.

### P3 — Rendre visible le caractère open source et contribuable

**Objectif** : indiquer clairement dans Preferences ou Help que Charon est
open source et que les contributions sont possibles, avec des liens vers le
dépôt et [CONTRIBUTING.md](../CONTRIBUTING.md).

**À qualifier** : emplacement exact dans la surface compacte, formulation
courte en anglais et en français, et liens complémentaires éventuels vers le
code de conduite et la licence MIT.

**Contraintes** : rester informatif, sans transformer la shelf en page de
marketing ni ajouter de route produit.

**Statut** : planifié — plan 057 (section « À propos » dans Preferences).

### P1 — Corriger et systématiser les Tooltips

**Objectif** : rendre les Tooltips fiables et cohérents là où ils apportent une
information utile, notamment pour les actions icon-only, les raccourcis et les
noms de fichiers tronqués.

**À qualifier** :

- recenser les contrôles qui utilisent un Tooltip et ceux qui n'en ont pas
  besoin grâce à un nom accessible déjà visible ;
- vérifier le positionnement, les délais, le clavier, le pointeur grossier, les
  grandes tailles de texte et les surfaces transitoires ;
- distinguer Tooltip, nom accessible et aide persistante ;
- ajouter une matrice de tests ciblés par contrôle et par thème.

**Contraintes** : un Tooltip ne doit jamais être l'unique moyen de comprendre
  une action ou d'accéder à son nom. Il ne doit pas bloquer le focus, la saisie,
  Escape ou les autres surfaces transitoires.

**Statut** : planifié — plan 056 (inventaire, règle, corrections). Le plan
  041 fixe le délai d'ouverture et le plan 050 la durée de sortie.

### P3 — Améliorer le cheat sheet Markdown

**Objectif** : rendre l'aide Markdown plus immédiatement utile pendant
l'édition, sans surcharger la shelf.

**À qualifier** :

- syntaxe réellement supportée par le preview sécurisé : titres, emphase,
  barré, listes, tâches, citations, code, tableaux et liens ;
- exemples courts, copiables et localisés ;
- emplacement dans l'éditeur et Help, hiérarchie de l'information et fermeture
  avec restauration du focus ;
- signalement explicite des éléments volontairement non supportés (HTML,
  images et chargement de ressources).

**Contraintes** : l'aide ne doit pas modifier le brouillon, déclencher de
  requête réseau ou présenter une syntaxe que le preview ne rend pas de manière
  sûre.

**Statut** : planifié — plan 058 (exemples testés contre le rendu réel,
  correction du masquage de contenu par le front-matter).

## Planification

Toutes les idées ci-dessus sont planifiées dans [`plans/README.md`](../plans/README.md)
et enchaînées par [`plans/RUNBOOK.md`](../plans/RUNBOOK.md) : 056-058 dans le
lot C (`0.3.0`), 059-060 dans le lot E (`0.4.0` proposé), 061-062 dans le lot F
(`0.5.0` proposé). Les plans 059-062 s'arrêtent sur un ADR et un essai natif à
valider avant tout code. Une nouvelle idée s'ajoute ici avant d'être planifiée.
