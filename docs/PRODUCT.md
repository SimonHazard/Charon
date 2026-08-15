# Charon product contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) as
amended by [ADR 0012](adr/0012-unified-note-shelf.md) and
[ADR 0013](adr/0013-direct-note-actions.md).

## Product promise and users

Charon is a rapid local capture shelf for people who work with AI agents. It
turns one useful selection or one short manual entry into one ordinary Markdown
Note, then lets the user find it, enrich it lightly, and copy deterministic
agent-ready Markdown without giving a service access to their content.

Its primary users are developers, designers, researchers, writers, and agent
users who want keyboard speed, transparent files, and a small surface. Charon
assumes one person, one active local Workspace, and frequent short sessions. It
must remain understandable without filesystem knowledge while keeping every
durable Note visible to users, editors, backup tools, and local agents.

## Jobs

- Capture non-empty selected text without showing Charon or taking source focus
  on a proved macOS adapter.
- Create a Note manually from an always-visible bottom composer on every
  platform.
- Search Markdown bodies and Tags across one unified result where completed
  Notes remain visible.
- Expand one Note to write or preview Markdown, edit lightweight Tags, and add
  or remove locally managed Attachments.
- Act directly on one Note to change status, copy, edit, or request permanent
  deletion without entering a selection mode.
- Copy one deterministic agent-ready Markdown document containing the Note body,
  Tags, and managed local Attachment paths without copying file bytes or
  pasting into another application.
- Permanently delete one Note only after an explicit confirmation,
  with an honest account of what Charon can and cannot erase.
- Keep content in readable local files and recover safely from invalid data,
  interrupted transactions, migration, external edits, or lost permissions.
- Choose English or French, or the Light and Graphite appearances without
  changing command meaning.
- Inspect the current Notes folder and choose another validated local Workspace.

## Domain model

### Workspace

A `Workspace` is exactly one local directory plus one schema version. It is the
persistence, transaction, migration, conflict, and recovery boundary for every
durable operation. Charon never combines directories or relocates one without
explicit choice. First launch safely opens or creates the visible
`Documents/Charon` default without modifying an unrelated directory already at
that path. A compact Preferences surface shows the active folder and offers an
explicit chooser; only a successfully validated choice is remembered.

### Note

A `Note` belongs to the flat Workspace collection. It has a stable UUID, a
Markdown body, an `open` or `done` status, created and updated timestamps, an
optional completion timestamp, an ordered set of Tags, and zero or more
Note-owned Attachments. Changing status, text, Tags, or Attachments preserves
identity. Active ordering is deterministic and is not manually persisted.

### Tag

A `Tag` is an optional short text label stored directly on one Note. A Note has
at most 16 Tags; after trimming, each contains 1-48 Unicode scalar values and no
control or line-break character. Tags are searched and displayed as quiet chips.
Uniqueness on a Note is case-insensitive, while first-entered spelling and order
are preserved. Tags have no IDs, colors, nesting, global registry, management
destination, or navigation hierarchy.

### Attachment

An `Attachment` is a regular non-symlink file outside the Workspace explicitly
chosen by the user. A Note owns at most 20 Attachments of at most 100 MiB each.
Rust copies each file to
`attachments/<note-id>/<attachment-id>[.<safe-extension>]` and persists its
UUID, validated display basename, generated relative managed path, and creation
timestamp, never the external source path. Charon does not execute content,
preview arbitrary formats, adopt unexpected files, upload bytes, or share assets
across Notes. Removing an Attachment or its Note permanently removes the managed
file through the same transaction and completed-backup cleanup contract as
permanent deletion.

### Copy as Markdown

`Copy as Markdown` is one explicit per-Note composition command. It preserves
the body without an invented heading. When present, `**Tags:**` contains Tags as
safely delimited inline-code spans in stored order. `**Attachments:**` contains
one bullet per Attachment in creation/UUID order with its safe display name and
canonical absolute managed path as safely delimited inline code. Any invalid or
missing managed reference fails before the clipboard changes. Copying changes
only the system clipboard, never Note state, and never reads or copies
Attachment bytes, uploads, or pastes. The action discloses that local managed
paths enter the clipboard.

### Permanent delete

Delete is a separate, irreversible per-Note command whose concise confirmation
names its permanent scope. After a successful commit, active Workspace files
and normal Charon transaction backups retain neither the deleted Markdown nor
its managed Attachment bytes. An incomplete crash-recovery record may exist only
until startup deterministically finishes or rolls back the bounded transaction
and removes the record. Operating-system snapshots, external backup tools, and
synchronized folders are outside Charon's erasure guarantee.

## V1 journeys

### Selected-text capture

With non-empty text selected in another application, the user presses Shift
twice. On a proved macOS adapter, Charon creates exactly one ordinary open Note
without showing a window or taking focus. It first tries the bounded public
Accessibility ladder from ADR 0009. If that returns no usable text, the explicit
gesture may run ADR 0010's one bounded source-application Copy transaction,
read only a newly produced string, and restore the previous pasteboard only
when no concurrent write occurred.

Empty, whitespace-only, unavailable, malformed, protected, canvas-only, denied,
timed-out, or safety-rejected input creates nothing. Acquisition never uses
private APIs, automatic Paste, arbitrary input injection, clipboard history,
OCR, screen capture, unbounded Accessibility scans, or application-specific
extraction. On macOS, gesture detection requires Input Monitoring and text
acquisition separately requires Accessibility. The standard accelerator and
manual composer remain available after denial.

### Manual capture and portable fallback

The composer is always visible at the bottom of the shelf. It names the active
local Notes folder context, preserves failed input, creates exactly one open
Note on Enter, and ignores empty input. On every platform, invoking
`CmdOrCtrl+Shift+Space` reveals Charon and focuses that composer. It does not
open a second window or empty editor. The platform support ledger separately
gates whether the operating system can deliver that accelerator globally.

### Search and visible status

The user invokes search with `CmdOrCtrl+F`. Results match Markdown bodies and
Tags, update without losing keyboard focus, use deterministic ordering, and
make an empty result explicit. Open and Done Notes stay in the same result.
Done Notes use a checked control, muted surface, and struck-through primary text
so completion is visible without depending on color alone.

### Direct Note actions and status

Each collapsed Note exposes direct status, `Copy as Markdown`, Edit, and
permanent-Delete controls. Activating the main row surface expands that Note.
Arrow keys move browser focus between visible Note rows without creating domain
or view state. Each status change targets one Note and updates it in place.

### Editing and enrichment

Enter, Space, a click on the main row surface, or the row's hover/focus pencil
expands one Note from its live shelf position into a large editor. Write/Preview,
Markdown editing, Tag editing, and
the Attachment list and import action live in that one surface. Autosave and
draft preservation make failure explicit without changing identity. Escape
closes only after pending input is safe.

The expansion uses transform and opacity based shared layout, remains
interruptible and reversible, starts from the current presentation value, and
never locks input. Reduced motion uses a short crossfade or static swap.

### Attachment import and removal

The user explicitly opens a file picker. Rust validates a bounded regular
non-symlink file, copies it into the Note-owned managed directory, and commits
metadata and bytes together. Validation, collision, filesystem, and interrupted-
copy errors retain the editor input and offer a contextual retry. Removal opens
one concise confirmation naming the managed file, then permanently cleans its
bytes and completed normal transaction backup in the same transaction.

### Agent-ready copy

The user chooses `Copy as Markdown` on one Note. Charon writes the exact body,
optional Tags, and optional managed Attachment names and canonical absolute
paths. It confirms completion, does not read file bytes, and never uploads,
pastes, or changes the Note.

### Irreversible deletion

Delete always opens one concise confirmation for the targeted Note and states
that Charon provides no undo. Cancel changes nothing. Success removes that Note
and its managed Attachments under the permanent-delete contract, then moves
focus to the nearest surviving Note or the composer. Failure preserves the
current result and offers a contextual recovery action.

### Schema v1 migration

Before schema v2 mutation, Charon validates schema v1 and stages a bounded pre-
migration recovery record. Every active v1 Note keeps its UUID, status,
timestamps, and body byte-exactly; Tags and Attachments start empty. Already-
trashed bodies are neither restored nor destroyed: they move to
`legacy-trash-v1/notes/<uuid>.md` beside an explanatory README, archived
metadata without bodies, and original v1 manifest metadata, outside the active
collection. Charon reports the archive location; the user may inspect, move, or
delete it with ordinary filesystem tools. An existing archive path stops before
mutation. Interrupted migration resolves to a complete v1 or v2 state and
removes the bounded recovery record before normal mutation resumes.

### Theme, language, and folder choice

Light is the first-run theme and maps the approved Charon Prune, Lavender, and
Cream identity through quiet neutral semantic roles. Graphite remains the dark
choice, and a persisted legacy Solarized value resolves to Light. Theme and
English/French language changes update the current surface without restart or
focus loss.
Preferences shows the active Workspace and remembers a new
folder only after Rust validates it successfully; no Note content is stored in
preferences.

### Recovery and permission denial

Invalid files, external conflicts, interrupted transactions, denied filesystem
access, denied capture permissions, and clipboard failures appear beside the
affected operation. Errors are content-free, preserve input, identify the local
scope, and offer retry, chooser, or recovery. Removing a generic Error page does
not remove these states.

### Public site

Until the public product story is ready, a visitor sees a deliberately concise
Charon holding page with the approved PNG icon, one vague statement, and a
minimal footer linking to the operator's website and Ko-fi page. The footer does
not repeat the Charon name. Detailed workflow, platform, privacy, changelog, and
release claims remain in the repository contracts rather than public site
routes for now. The static site performs no tracking and embeds no third-party
content; its two external destinations are followed only after an explicit link
activation.

## Non-goals

- Accounts, cloud sync, collaboration, shared workspaces, or hosted storage.
- Analytics, telemetry, crash upload, advertising, or behavioral profiling.
- Automatic Paste, arbitrary keystroke injection, autonomous third-party app
  interaction, or another network request beyond disclosed optional updates.
- Hierarchical organization, manual ordering, multiple product routes, project
  management, reminders, or team workflows.
- Colored, nested, globally managed, or navigation-oriented Tags.
- External-path Attachments, symlink following, arbitrary preview, execution,
  upload, or a cross-Note asset library.
- Multiple clipboard formats or automatic delivery of Attachment bytes to an
  agent.
- Note Selection, bulk status changes, multi-Note copy, or batch Delete in the
  current v1 surface.
- A second capture window, compact alternate mode, generic Error destination,
  or configurable shortcut catalog.
- Modifier-only capture claims on Linux or Windows before native signed-build
  evidence passes the accepted gates.
- Charts or analytics-style product surfaces in v1.
