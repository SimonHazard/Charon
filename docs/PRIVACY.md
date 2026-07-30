# Charon privacy contract

## Promise

Charon keeps note content in local files inside the Workspace the user chooses.
There is no account, cloud sync, analytics, telemetry, crash upload, advertising,
or content-processing service. Charon does not send notes, searches, selections,
clipboard contents, filenames, or usage events to the developer.

The public site is static and uses no analytics, trackers, fingerprinting,
cookies, forms, or behavioral pixels. Downloads link to verified signed assets
or a real GitHub Release.

## Local data

The Workspace contains a manifest, Markdown note files, and recovery backups.
The user controls its location, backup policy, external synchronization, and
deletion. Charon reads or writes only the selected Workspace and app-owned local
preferences required to remember settings.

Local logs and diagnostics must exclude note bodies, clipboard payloads,
selected text, and sensitive filesystem paths by default. A diagnostic export
must preview exactly what will be included and require explicit user action.

## Clipboard

Clipboard access occurs only for a user-invoked capture or copy operation.
`ClipboardComposer` writes the explicit formatted result; Charon never monitors
clipboard history, uploads clipboard data, or silently pastes into another app.
If reading selected text requires a clipboard-based platform technique, the UI
must disclose that behavior before consent and avoid retaining the temporary
content beyond the capture flow.

## Accessibility and selected text

On macOS, double Shift and selected-text capture may require Accessibility
permission. Charon asks at the moment the user enables or invokes that feature,
explains the exact benefit, and remains useful if permission is denied. It does
not use Accessibility access to observe unrelated activity or inject keystrokes.

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
