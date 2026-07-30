# Charon product contract

## Users

Charon is a local-first, keyboard-first desktop scratchpad for people who build
prompts, collect implementation ideas, and turn rough fragments into deliberate
work. Its primary users are developers, designers, researchers, writers, and
agent users who want capture speed without giving a service their notes.

The product assumes one person, one local workspace, and frequent short editing
sessions. It must remain understandable to a person who never learns its file
layout, while keeping that layout transparent to a person who wants to inspect,
back up, or move it.

## Jobs

- Capture a thought without leaving the current task for long.
- Organize fragments into named sections without imposing a project-management
  system.
- Find, select, complete, copy, merge, trash, and restore notes quickly from the
  keyboard.
- Compose selected notes into predictable Markdown for a prompt, issue, or
  document, without silently pasting into another application.
- Keep durable content in readable local files and recover safely from invalid
  data, external edits, or lost permissions.
- Choose English or French and a comfortable light, dark, or Solarized theme
  without changing the meaning of any command.

## Domain model

### Workspace

A `Workspace` is exactly one user-selected directory plus one schema version.
It is the transaction and recovery boundary for every durable operation. Charon
never silently combines directories and never relocates one without an explicit
user choice.

### Section

A `Section` has a stable UUID, a user-visible name, a sort key, and created and
updated timestamps. Renaming or reordering a section does not change its UUID.

### Note

A `Note` has a stable UUID, a section UUID, a Markdown body, an `open` or `done`
status, a sort key, created and updated timestamps, an optional completed
timestamp, and an optional `trashedAt` timestamp. Completion does not trash a
note. Moving a note between sections preserves its UUID.

### Selection

A `Selection` is an ephemeral, ordered sequence of note IDs. It follows the
current visible ordering, is never persisted, and is cleared or reconciled when
its notes leave the current result set.

### CopyPreset

A `CopyPreset` is one of `plain`, `bulleted`, `numbered`, `task-list`, or
`sectioned`. Formatting is deterministic for a given ordered selection. Copying
changes only the clipboard, never note state.

### Merge

A `Merge` creates one composite note in a chosen section, then moves every
source note to trash in the same recoverable transaction. The user must see a
preview and explicitly confirm before the transaction. Cancelling changes
nothing. Undo restores the sources and removes the composite.

### Delete

The ordinary `Delete` command moves notes to trash and remains undoable.
Permanent deletion is a separate command, available only in trash, with an
explicit confirmation that names its irreversible effect.

## V1 journeys

### Quick capture

From any supported platform shortcut, the user opens a centered capture window,
types Markdown, chooses or accepts a section, and saves. Save gives immediate
feedback, writes through the Workspace transaction, and returns focus to the
previous application. If native capture is unavailable, the visible fallback
and in-app shortcut perform the same save journey.

### Editing

The user opens a note with Enter, edits plain Markdown, previews it safely, and
saves without changing its stable identity or ordering unexpectedly. Escape
closes the editor only after draft-loss handling is clear.

### Search

The user searches note bodies and section names. Results update without losing
keyboard focus, preserve deterministic ordering, and make it clear when no
notes match. Clearing search returns to the prior section context.

### Keyboard range selection

The user navigates with arrow keys, presses Space to toggle one note, then holds
Shift while navigating to extend a contiguous range from the selection anchor.
The selected state is visible in every theme and announced accessibly.

### Bulk completion

The user selects visible open notes and invokes Complete. All selected notes
become `done` in one transaction, receive completion timestamps, and can be
undone together.

### Bulk trash

The user selects notes and presses Delete. A recoverable transaction assigns
`trashedAt`, removes them from the active view, and offers one grouped undo.
Nothing is permanently erased by this action.

### Undo

After a recoverable mutation, the user can invoke Undo from the keyboard or the
visible acknowledgement. Undo applies the inverse transaction, reports any
external conflict instead of overwriting it, and restores focus predictably.

### Merge preview

The user selects two or more notes, chooses Merge, reviews the exact composite
Markdown and destination section, then confirms. Charon creates the composite
and trashes the sources atomically; cancel leaves the Workspace untouched.

### Copy as list

The user selects notes in a deliberate order and chooses a CopyPreset, or uses
the saved default. Charon previews when requested, writes deterministic Markdown
to the clipboard, confirms completion, and never injects or pastes keystrokes.

### Theme and language switching

The user changes among light, graphite dark, and Solarized themes and switches
between English and French. The current screen updates without restart, focus is
preserved, and all user-facing application strings come from the selected
Paraglide catalog.

### Workspace recovery

When the manifest, a note, or an interrupted write is invalid, Charon stops
mutating the Workspace, identifies the affected files, preserves originals and
backups, and offers a recovery path. It never silently discards user content or
claims success while some notes were skipped.

### Permission denial

If filesystem, Accessibility, selected-text capture, or clipboard access is
denied, Charon explains which feature is affected and why. It offers the
standard shortcut, visible capture command, manual input, or retry path while
the core local note workflow remains usable.

### Public site

A visitor can understand the product and local-only privacy promise, watch a
real capture-and-copy demo, switch between English and French and between
themes, verify the current platform support tier, and reach a real signed
download or GitHub Release. The static site performs no tracking and never
presents a fake application UI or an unverified download.

## Non-goals

- Accounts, cloud sync, collaboration, shared workspaces, or a hosted database.
- Analytics, telemetry, crash upload, advertising, or behavioral profiling.
- Automatic paste, keystroke injection, or autonomous interaction with
  third-party applications.
- Full WYSIWYG editing, rich project management, reminders, or team workflows.
- A cross-framework component library, dynamic marketing backend, CMS, forms,
  or newsletter.
- Guaranteed modifier-only global shortcuts on platforms where the operating
  system does not expose a proven native capability.
- Insights or charts as a dependency of capture, editing, search, copy, or
  recovery.
