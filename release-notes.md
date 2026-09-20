# Charon 0.1.1 — Early Access

Charon is a local-only capture shelf for turning selected text or short manual entries into ordinary, agent-ready Markdown files in a folder you control.

## Highlights

- Remove the extra Windows title-bar gap and unused space beside Notes and the deletion dialog footer.
- Keep Preferences opaque in both themes, with sun/moon appearance controls and a native language dropdown.
- Open an existing Workspace or create one in an empty folder. Failed folder changes preserve the active Workspace and keep an actionable error visible in Preferences; existing Notes are never moved.
- Preview headings, emphasis, lists, tasks, quotes, code, and tables with TanStack Markdown. Links and images stay inert text without network or file access.
- Consult the English or French Markdown help from the editor or general Help without changing your draft.
- Keep Copy as Markdown unchanged: managed Attachment paths are copied, not media bytes.

## Early Access limits

- Selected-text capture is implemented on macOS 14 and newer. Windows and Linux currently use the manual composer; their selected-text adapters remain experimental roadmap work.
- Wayland does not claim double-Shift capture. Use `Alt+Shift+Space` to reveal and focus the composer.
- Charon is an experimental side project. Native compatibility is improved through normal use and user reports rather than a formal certification programme.

## Installation and trust

- macOS builds use an ad-hoc signature and are not notarized. On first launch, use Privacy & Security > Open Anyway, or Control-click > Open. Input Monitoring and Accessibility may need to be granted again after an update.
- Windows builds are unsigned and may show a SmartScreen warning. Use More info > Run anyway only after checking the download.
- Linux packages are unsigned.
- `SHA256SUMS.txt` provides integrity checks. Tauri updater signatures are separate from Apple or Microsoft code signing.

## Privacy

Charon has no account, sync, analytics, telemetry, crash upload, content upload, or automatic Paste. Update checks are disabled by default and send no Note content, Attachment, Workspace path, or stable identifier when enabled.
