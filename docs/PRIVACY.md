# Charon privacy contract

## Promise

Charon keeps note content in local files inside a user-controlled Workspace.
There is no account, cloud sync, analytics, telemetry, crash upload, advertising,
or content-processing service. Charon does not send notes, searches, selections,
clipboard contents, filenames, or usage events to the developer.

The public site is static and uses no analytics, trackers, fingerprinting,
cookies, forms, or behavioral pixels. Downloads link to verified signed assets
or a real GitHub Release.

## Local data

The Workspace contains a manifest, Markdown note files, and recovery backups.
The first Workspace defaults to the visible `Documents/Charon` directory; an
existing unrelated directory is never adopted automatically. The user controls
the Workspace location, backup policy, external synchronization, and deletion.
Charon reads or writes only the active Workspace and app-owned local preferences
required to remember settings.

Local logs and diagnostics must exclude note bodies, clipboard payloads,
selected text, and sensitive filesystem paths by default. A diagnostic export
must preview exactly what will be included and require explicit user action.

## Clipboard

Clipboard access occurs only after an explicit Copy command or selected-text
capture gesture. `ClipboardComposer` writes the formatted result requested by
the user. It never reads clipboard history or pastes into another app.

On macOS, `CaptureCoordinator` first reads selected text through the bounded
public Accessibility path. If that returns no usable text, ADR 0010 permits one
capture-specific compatibility transaction: Charon snapshots the current
general pasteboard in memory, invokes the unchanged foreground application's
normal Copy command once, reads only a newly produced text value, and restores
the complete snapshot only if no concurrent clipboard write occurred. It never
uses a pre-existing clipboard string as the selection, monitors clipboard
history, posts Paste, stores the snapshot on disk, or repeats in the background.

During that bounded attempt, selected text briefly exists on the system
clipboard and may be observed by macOS or an installed clipboard manager. If a
concurrent write or restoration failure occurs, Charon does not overwrite the
newer value and the clipboard may remain changed. The application reports only
a content-free warning. Secure fields, unsafe snapshots, timeouts, blocked Copy,
and unsupported platforms fail closed without creating a note.

## Input Monitoring, Accessibility, and selected text

On macOS, observing double Shift requires Input Monitoring. Reading selected
text for silent capture separately requires Accessibility. Accessibility also
allows Charon to invoke one source-application Copy command when the direct path
fails. Charon explains and requests each permission from an explicit action in
shortcut help, never on mount, and remains useful if either is denied. The
passive listener observes only modifier/key events needed by the gesture
machine and never records, persists, logs, suppresses, or rewrites them.
Accessibility is used only at the completed capture gesture. The adapter first
queries a bounded focused-element ancestor chain, then at most one topmost
Accessibility element explicitly targeted by the current pointer and its
bounded parent chain, using public direct-text, standard-range, and web
text-marker attributes. That pointer target may be in a different application
when an accessibility proxy does not follow keyboard focus. The adapter never
enumerates applications or windows, recursively enumerates descendants, scans
background accessibility trees, or uses private APIs, OCR, screen capture, or
bundle-specific extraction. Only ADR 0010's disclosed, single Command-C
transaction may synthesize input or read and conditionally restore the
clipboard. No other input or source-app automation is permitted.

Equivalent native permissions on other platforms follow the same rules:
least privilege, just-in-time explanation, visible state, a retry path, and a
working manual fallback.

## Network access and updates

Update checks are the only optional network request permitted in v1. They must
be disclosed, disabled or enabled by a clear user-controlled setting, and
limited to release metadata needed to determine whether an update exists. A
check must not include note content, Workspace metadata, stable user identifiers,
or behavioral events. Downloading and installing an update requires a clear
user action and verified signed artifacts.

With update checks disabled, the desktop app must perform no network requests.
The application must not require connectivity for capture, editing, search,
copy, themes, localization, or recovery.

## Changes to this contract

Any proposal to add sync, accounts, content processing, telemetry, analytics,
crash upload, or another network request requires an ADR, an updated privacy
notice, explicit consent design, and product approval before implementation.
Collecting user content or behavioral telemetry is outside the v1 contract.
