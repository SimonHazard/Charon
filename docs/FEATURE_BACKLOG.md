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

**Statut** : implémenté dans l'arbre de travail, en attente du test natif de
  l'opérateur — plan 062, [ADR 0026](adr/0026-formatted-selected-text-capture.md).
  Option expérimentale « Conserver la mise en forme », désactivée par défaut,
  macOS uniquement : le repli Copy de l'ADR 0010 lit aussi une fois le HTML
  produit (1 Mio au plus), converti en Markdown en mémoire ; le texte brut
  exact est gardé dès que lettres, chiffres ou retours à la ligne diffèrent.
  Les captures par accès direct, Windows et X11 restent en texte brut.

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

**Statut** : implémenté dans l'arbre de travail, en attente du test natif de
  l'opérateur — plan 059, [ADR 0023](adr/0023-background-mode-and-tray.md).
  Option désactivée par défaut ; icône (Ouvrir/Quitter) sur macOS et Windows,
  indisponible sous Linux dans cette version. Le plan 039 couvre le cas macOS
  sans icône : fermer la fenêtre la masque, le Dock la rouvre et `Cmd+Q` quitte.

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

**Statut** : implémenté dans l'arbre de travail, en attente du test natif de
  l'opérateur — plan 061, [ADR 0025](adr/0025-user-chosen-composer-shortcut.md).
  Un seul raccourci choisi pour révéler Charon et focaliser le composer, sur
  macOS, Windows et X11, avec validation, liste réservée, retour au raccourci
  précédent si le système refuse, et réinitialisation. Le double Maj reste
  fixe ; sous Wayland, le portail attribue le raccourci et Preferences indique
  où le changer. macOS ne peut pas détecter les conflits.

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

**Statut** : implémenté dans l'arbre de travail, en attente du test natif de
  l'opérateur — plan 060, [ADR 0024](adr/0024-capture-notifications.md).
  Option désactivée par défaut, uniquement après une capture de texte
  sélectionné qui crée une Note pendant que la fenêtre n'a pas le focus, au
  plus une toutes les 2 s, avec le texte fixe « Charon » / « Note capturée. »
  (aucun contenu de Note). Le clic garde le comportement par défaut du système
  et n'ouvre pas la Note : le plugin officiel ne fournit pas de rappel de clic
  sur desktop, et les crates non officielles nécessaires sont écartées pour
  l'instant.

### P3 — Ajouter le lien GitHub dans Preferences

**Objectif** : ajouter un lien externe vers le dépôt GitHub de Charon dans
Preferences : [github.com/SimonHazard/Charon](https://github.com/SimonHazard/Charon).

**Contraintes** : ouverture uniquement après activation explicite du lien,
  sans iframe, tracking ou requête automatique depuis l'application.

**Statut** : implémenté dans l'arbre de travail, en attente du test de
  l'opérateur — plan 057, avec l'élément suivant.

### P3 — Rendre visible le caractère open source et contribuable

**Objectif** : indiquer clairement dans Preferences ou Help que Charon est
open source et que les contributions sont possibles, avec des liens vers le
dépôt et [CONTRIBUTING.md](../CONTRIBUTING.md).

**À qualifier** : emplacement exact dans la surface compacte, formulation
courte en anglais et en français, et liens complémentaires éventuels vers le
code de conduite et la licence MIT.

**Contraintes** : rester informatif, sans transformer la shelf en page de
marketing ni ajouter de route produit.

**Statut** : implémenté dans l'arbre de travail, en attente du test de
  l'opérateur — plan 057 (section « À propos » dans Preferences).

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

**Statut** : implémenté dans l'arbre de travail, en attente du test de
  l'opérateur — plan 056 (inventaire, règle, corrections). Le
  plan 041 fixe le délai d'ouverture et le plan 050 la durée de sortie.

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

**Statut** : implémenté dans l'arbre de travail, en attente du test de
  l'opérateur — plan 058 (exemples testés contre le rendu
  réel, correction du masquage de contenu par le front-matter).

## Planification

Toutes les idées ci-dessus sont planifiées dans [`plans/README.md`](../plans/README.md)
et enchaînées par [`plans/RUNBOOK.md`](../plans/RUNBOOK.md) : 056-058 dans le
lot C (`0.3.0`), 059-060 dans le lot E (`0.4.0` proposé), 061-062 dans le lot F
(`0.5.0` proposé). Le 2026-10-02, l'opérateur a demandé de terminer toute la
file dans un seul arbre de travail non commité (branche `charon-v0.2`) : les
étapes ADR et essai natif des plans 059-062 ont été levées avec les choix par
défaut des ADR 0023-0026, dont les preuves natives restent à vérifier par
l'opérateur. Une nouvelle idée s'ajoute ici avant d'être planifiée.
