# Charon privacy contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md) while
preserving ADR 0010's selected-text clipboard disclosure.

## Promise

Charon keeps Note content, Tags, and managed Attachment bytes in local files
inside a user-controlled Workspace. There is no account, cloud sync, analytics,
telemetry, crash upload, advertising, or content-processing service. Charon does
not send Notes, Tags, Attachments, searches, selections, clipboard contents,
filenames, paths, or usage events to the developer.

The public site is static and uses no analytics, trackers, fingerprinting,
cookies, forms, or behavioral pixels. Downloads link only to verified signed
assets or a real GitHub Release.

## Local data

The Workspace contains a manifest, Markdown Note files, managed Attachment
copies, bounded recovery material, and migration safety material when needed.
The first Workspace defaults to the visible `Documents/Charon` directory; an
existing unrelated directory is never adopted automatically. The user controls
the Workspace location, external synchronization, backup policy, and cleanup.
Charon reads or writes only the active Workspace and app-owned local preferences
needed to remember settings. Preferences store a successfully validated folder
choice and presentation choices, never Note content.

Adding an Attachment is an explicit file-picker action. Rust accepts a bounded
regular file, does not follow symlinks, copies it into
`attachments/<note-id>/`, and persists only safe display metadata plus a
generated managed relative path. The external source path is never persisted.
Imported bytes remain local. Charon never executes them, previews arbitrary
formats, uploads them, or maintains a cross-Note asset library.

Local logs and diagnostics exclude Note bodies, Tag values, Attachment bytes,
clipboard payloads, selected text, and sensitive filesystem paths by default. A
diagnostic export previews exactly what will be included and requires explicit
user action.

## Explicit copy and managed paths

`Copy as Markdown` occurs only after an explicit action. `ClipboardComposer`
writes deterministic Note bodies, optional Tags, and optional Attachment safe
display names plus canonical absolute paths to the managed Workspace copies.
The action discloses that these local paths enter the system clipboard. It never
reads or copies Attachment bytes, uploads content, reads clipboard history, or
pastes into another application. Copying does not change Note state.

## Selected-text capture clipboard behavior

Clipboard access for selected-text capture remains exactly bounded by ADR 0010.
On macOS, `CaptureCoordinator` first reads selected text through ADR 0009's
bounded public Accessibility path. If that returns no usable text, one explicit
unmodified double-Shift gesture may start one capture-specific compatibility
transaction: Charon snapshots the current general pasteboard in memory, invokes
the unchanged foreground application's normal Copy command once, reads only a
newly produced text value, and restores the complete snapshot only when no
concurrent clipboard write occurred.

Charon never treats a pre-existing clipboard string as the selection, monitors
clipboard history, posts Paste, stores the snapshot on disk, repeats the attempt
in the background, or runs it without the completed gesture. During the bounded
attempt, selected text briefly exists on the system clipboard and may be
observed by macOS or an installed clipboard manager. If a concurrent write or
restoration failure occurs, Charon does not overwrite the newer value and the
clipboard may remain changed. The application reports only a content-free
warning. Secure fields, unsafe snapshots, timeouts, blocked Copy, and
unsupported platforms fail closed without creating a Note.

## Input Monitoring, Accessibility, and selected text

On macOS, observing double Shift requires Input Monitoring. Reading selected
text separately requires Accessibility; that permission also allows the single
disclosed source-application Copy when the direct path fails. Charon explains
and requests each permission from an explicit action in capture help, never on
mount, and remains useful after denial through `CmdOrCtrl+Shift+Space` and the
bottom composer.

The passive listener observes only modifier and key events needed by the
gesture machine and never records, persists, logs, suppresses, or rewrites them.
Accessibility is used only at the completed capture gesture. The adapter first
queries the bounded focused-element ancestor chain, then at most one public
Accessibility element explicitly targeted by the pointer and its bounded parent
chain, using direct-text, standard-range, and web text-marker attributes. It
never enumerates applications or windows, scans background trees, uses private
APIs, performs OCR or screen capture, or adds application-specific extraction.
No other input or source-application automation is permitted.

Equivalent permissions on other platforms follow least privilege, just-in-time
explanation, visible state, retry, and a working manual fallback. Linux and
Windows have no modifier-only or synthetic-input capture claim without their
own accepted adapter and signed-build evidence.

## Irreversible deletion limits

Delete always requires a concise confirmation naming the Note count. After a
successful Workspace commit, Charon removes the active Markdown, associated
managed Attachment bytes, and their copies from normal completed transaction
backups. A crash may leave a bounded incomplete recovery record only until the
next startup deterministically finishes or rolls back that transaction and
removes the record. Charon provides no in-app undo for a completed Delete.

This guarantee covers storage owned and controlled by Charon inside the active
Workspace. It cannot erase operating-system snapshots, filesystem journals,
discarded storage blocks, external backup tools, synchronized-folder history,
clipboard-manager history, or copies the user or another process made. The
confirmation and privacy copy disclose that boundary rather than promising
secure erasure from systems Charon does not control.

## Schema v1 migration material

Schema v1 migration stages a bounded pre-migration recovery record before
mutation. Active Note bodies migrate byte-exactly. Already-trashed v1 bodies are
neither restored into the app nor silently deleted: they move to visible plain
Markdown under `legacy-trash-v1/` inside the user-controlled Workspace, with
explanatory and original-manifest metadata. That user-owned archive is the
durable exception to the completed-Delete cleanup rule because it preserves data
created under the earlier recoverable contract; the bounded recovery record is
removed after deterministic convergence.

Charon reports the archive location after migration, never indexes it as active
Notes, and leaves inspection, relocation, external backup, or deletion
to the user through ordinary filesystem tools. No migration content is uploaded
or copied into preferences.

## Network access and updates

The current build has no update client and performs no desktop network request.
An update check is the only optional desktop request permitted for a future
signed v1 release. It must be disclosed, default off, controlled by a clear
setting, and limited to release metadata. GitHub will observe ordinary network
metadata, but the request includes no Note content, Tags, Attachment metadata or
bytes, Workspace metadata or path, stable user identifier, or behavioral event.
Downloading and installing requires clear user action and verified signed
artifacts, and restart must defer while a draft is dirty.

With update checks disabled, the desktop performs no network requests. Charon
does not require connectivity for capture, manual creation, search, Open/Done,
editing, Tags, Attachments, copy, themes, localization, deletion, migration, or
recovery.

## Changes to this contract

Any proposal to add sync, accounts, content processing, telemetry, analytics,
crash upload, automatic Attachment upload, or another network request requires
an ADR, updated privacy notice, explicit consent design, and product approval
before implementation. Collecting user content or behavioral telemetry remains
outside the v1 contract.
