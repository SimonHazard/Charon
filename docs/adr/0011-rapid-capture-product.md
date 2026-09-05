# ADR 0011: Rapid-capture product foundation

## Status

Accepted for v1. This ADR is the product and schema-v2 migration gate.

## Context

The initial implementation established a safe local Workspace and proved focus-preserving
selected-text capture on macOS. They also produced a broader note-management
product built around Sections, manual ordering, Merge, recoverable Trash,
CopyPresets, routes, a command palette, and optional Insights. Those concepts
add more navigation and persistence surface than Charon's primary job needs:
turn one useful selection into one ordinary local Note, enrich it lightly, and
copy deterministic Markdown for an AI agent.

The narrower product changes persistence, deletion, shortcuts, desktop
structure, and the experimental chart boundary. It therefore requires one
accepted decision before implementation. The change must preserve local-only
privacy, transparent files, Rust authority, no-loss migration, proven macOS
capture, user agency around irreversible deletion, and actionable recovery.

## Decision

1. Charon's primary job is one explicit gesture over non-empty selected text
   producing exactly one ordinary local Note, plus one always-visible manual
   composer. Empty or unavailable input creates nothing.
2. A `Workspace` remains exactly one local directory and the persistence,
   transaction, migration, conflict, and recovery boundary. Rust remains the
   filesystem and domain authority. React dispatches versioned commands and
   consumes typed snapshots and events; it never reads or writes Note or
   Attachment files directly.
3. Schema v2 exposes one flat collection of `Note` values. A Note has a stable
   UUID, Markdown body, `open` or `done` status, created and updated timestamps,
   an optional completion timestamp, an ordered set of `Tag` values, and zero
   or more Note-owned `Attachment` values. There is no Section, move, manual
   reorder, Merge, Trash, or persisted Selection.
4. A `Tag` is an optional short text label stored directly on a Note. A Note has
   at most 16 Tags; after trimming, each contains 1-48 Unicode scalar values and
   no control or line-break character. Tags participate in search and render as
   quiet chips. Uniqueness is case-insensitive while first-entered spelling and
   order are preserved. Tags have no IDs, colors, nesting, global registry,
   management route, or sidebar.
5. Adding an `Attachment` is an explicit file-picker action. Rust accepts only
   a regular non-symlink file outside the Workspace, with at most 20 Attachments
   per Note and 100 MiB per file. It copies the bytes into
   `attachments/<note-id>/<attachment-id>[.<safe-extension>]` and persists an
   Attachment UUID, validated display basename, generated relative path, and
   creation timestamp. It never persists the external source path, executes
   content, previews arbitrary formats, adopts unexpected files, uploads bytes,
   or creates a cross-Note asset library. Removing an Attachment or its Note
   permanently removes its managed file in the same transaction and completed-
   backup cleanup contract as Delete.
6. `Selection` remains an ordered, ephemeral React concern reconciled to the
   current Open or Done result. It exists only for bulk status changes, `Copy as
   Markdown`, and permanent Delete, and is never persisted.
7. `ClipboardComposer` remains the explicit clipboard-write boundary and
   replaces CopyPreset UI with one `Copy as Markdown` format. One selected Note
   has no invented heading. Multiple Notes receive `## Note 1`, `## Note 2`, and
   so on in Selection order, separated by `\n\n---\n\n`. Each body is preserved
   except for surplus blank lines adjacent to these separators. When present,
   `**Tags:**` contains Tags as inline-code spans in stored order, and
   `**Attachments:**` contains one bullet per Attachment in creation/UUID order
   with its safe display name and canonical absolute managed path as inline-code
   spans. The delimiter is longer than every backtick run in metadata so values
   cannot break the Markdown shape. Any missing, invalid, or escaping managed
   path fails the whole operation before the clipboard write. Charon never reads
   or copies Attachment bytes, uploads, pastes, or changes Note state. The
   explicit action discloses that local paths enter the system clipboard.
8. Delete is an explicitly confirmed, irreversible batch command. Its concise
   confirmation names the Note count. After a successful commit, neither active
   files nor normal Charon transaction backups retain deleted Markdown or
   managed Attachment bytes. A crash may leave one bounded incomplete recovery
   record only until startup deterministically finishes or rolls back the
   transaction and removes that record. Operating-system snapshots, external
   backup tools, and synchronized folders are outside Charon's erasure
   guarantee and are disclosed.
9. Schema v1 migration preserves every active Note body byte-exactly, retains
   stable UUID, status, and timestamps, and initializes empty Tags and
   Attachments. It never silently restores, deletes, or hides already-trashed
   v1 content. The migration first stages a bounded pre-migration recovery
   record, then moves trashed bodies into a visible plain-Markdown
   `legacy-trash-v1/` archive owned by the user and outside the active schema v2
   collection. The archive includes explanatory and original v1 manifest
   metadata needed to understand the preserved bodies. Charon reports its path;
   the user may inspect, move, or delete it with ordinary filesystem tools.
10. The desktop is one single-column shelf with no persistent left rail and no
    Notes, Settings, or Insights routes. Search and Open/Done filters form the
    top chrome; the manual composer is anchored at the bottom. A hover/focus
    pencil expands a Note into one large Markdown editor with Write/Preview,
    Tag editing, and Attachment list/import controls. Each collapsed Note has
    one compact Actions button whose primary item is `Copy as Markdown`.
11. Solarized is the first-run default. Light and Dark remain choices. The
    authoritative brand primitives are Charon Prune `#171221`, Charon Lavender
    `#8F8BE8`, and Charon Cream `#F5F2EA`; the Solarized base is Canvas
    `#FDF6E3`, Surface `#EEE8D5`, and Ink `#073642`. They map through semantic
    theme roles rather than raw values in components.
12. The visible shortcut set is intentionally small: unmodified double Shift
    where proved, the platform composer shortcut to reveal Charon and focus the
    bottom composer, `CmdOrCtrl+F`, Enter, Space, `CmdOrCtrl+A`, Delete, and
    Escape where context is unambiguous. Command-double-Shift, route navigation,
    command palette, reorder, move, merge, and copy-preset shortcuts are removed.
13. macOS keeps ADRs 0008-0010 as the authority for selected-text acquisition,
    permissions, and transient clipboard behavior. ADR 0015 governs Windows,
    X11, and Wayland shortcuts and acquisition; runtime capability reporting
    prevents claims before implementation.
14. `Documents/Charon` remains the visible safe default because ordinary
    Markdown is a core interoperability property. A compact Preferences surface
    shows the current Notes folder and offers an explicit chooser. It remembers
    only a successfully validated Workspace choice and never stores Note content
    in preferences.
15. Removing a generic Error page does not remove error handling. Failures stay
    contextual, content-free, input-preserving, and actionable beside the
    operation that failed.

The editor expansion and all direct feedback retain ADR 0005's motion contract:
feedback begins on press, shared layout starts from the live row, movement is
interruptible and reversible without input locks, and reduced motion substitutes
a crossfade or static state change. Irreversible Delete uses confirmation because
it cannot offer undo; ordinary reversible changes do not gain confirmation
friction.

Relationship to earlier ADRs is deliberately narrow:

- ADR 0001's first Decision paragraph is superseded only where it fixes the v1
  manifest/Section/Trash layout, and its first Consequences bullet only where it
  assumes that structure. Its Rust authority, atomic writes, deep Workspace,
  typed IPC, dependency direction, recovery, and adapter seams remain in force.
- ADR 0002's Decision table and opening paragraph are superseded where they
  permit a configurable shortcut catalog, open an empty editor from the
  portable accelerator or Command-double-Shift, or name the old main Notes
  input on Linux/Windows. Its capability ladder, permission and smoke-test
  gates, no-Paste rule, and visible fallback remain.
- ADR 0003 is superseded in full. Insights and TanStack Charts are intentionally
  rejected for v1, not deferred behind a feature flag.
- ADR 0005 remains authoritative; only examples tied to removed surfaces are
  historical. Its interaction, motion, material, and accessibility invariants
  apply to the single shelf and expanded editor.
- ADR 0006's single-main-surface choice, unmodified macOS capture semantics,
  focus preservation, and CaptureCoordinator boundary remain. Its active
  Section fallback, Command-double-Shift journey, empty full-editor fallback,
  Notes-work-area input, and possible Copper-like mode are superseded.
- ADR 0007's safe `Documents/Charon` resolution, explicit chooser, validation,
  local-only bootstrap, and one-directory boundary remain. Its initial Section
  naming and its obsolete settings-work handoff are superseded.
- ADRs 0008, 0009, and 0010 remain authoritative without modification to their
  macOS selected-text permission, acquisition, bounded Copy fallback, source-
  focus, clipboard, privacy, or release-evidence invariants. Their historical
  references to Command-double-Shift or CopyPreset formatting do not override
  Decisions 7 and 12 of this ADR.

## Migration

Opening a schema v1 Workspace in the schema v2 implementation is an explicit,
transactional migration. Before mutation, Charon validates the source and
stages a bounded pre-migration recovery record sufficient to restore it. Each
active v1 Note is carried forward byte-exactly with stable identity, body,
status, and timestamps; v2-only Tags and Attachments start empty. Section
membership and manual sort keys do not enter the active v2 model.

Already-trashed v1 Note bodies are not active v2 Notes and are not destroyed.
They are written under `legacy-trash-v1/notes/<uuid>.md` with an explanatory
README, archived metadata that contains no bodies, and a copy of the original v1
manifest metadata. That visible archive is the durable migration exception to
the completed-Delete no-backup rule because it preserves content that predates
the new irreversible command. The bounded recovery record is removed after
convergence. Charon never indexes or restores the archive into the app
automatically, reports its location after migration, and leaves inspection,
relocation, and cleanup to the user through ordinary filesystem tools. If the
archive path already exists, migration stops before mutation rather than
merging with it.

The migration is atomic from the Workspace perspective. An interruption leaves
the validated v1 state or a complete v2 state; startup deterministically
finishes or rolls back the bounded migration record. Ambiguous or invalid input
stops mutation and presents a contextual recovery choice without discarding
content.

## Consequences

- The product surface matches rapid capture while retaining transparent local
  files, stable identity, typed commands, and safe recovery.
- Flat Tags and Note-owned Attachments add useful agent context without
  rebuilding hierarchy or introducing external-path fragility.
- One deterministic clipboard shape replaces format choice and makes managed
  local paths available without exposing Attachment bytes to Charon's clipboard
  path.
- Irreversible Delete has a stronger confirmation and narrower retained-data
  guarantee than ordinary Workspace mutations; backup limits remain honest
  about systems outside Charon.
- Migration has visible, user-owned exceptions so legacy Trash is neither
  silently revived nor erased.
- Existing Sections, routes, Merge, Trash, Undo, CopyPreset, command-palette,
  and Insights implementations become removal work for later plans rather than
  compatibility contracts.
- The small shortcut surface is truthful across platforms while preserving the
  physically proved macOS acquisition path.

## Revisit when

Revisit if measured use requires hierarchy, shared assets, another copy shape,
or a different deletion guarantee; if a supported platform proves a safe
modifier-only capture path; or if the v1 migration cannot pass byte-for-byte and
interruption tests. Any expansion requires a new ADR that preserves local-only
privacy, Rust filesystem authority, explicit clipboard writes, and a no-loss
migration path.
