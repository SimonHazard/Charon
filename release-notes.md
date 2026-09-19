# Charon 0.1.0 — Early Access

Charon is a local-only capture shelf for turning selected text or short manual entries into ordinary, agent-ready Markdown files in a folder you control.

## Highlights

- Capture selected text with passive double Shift on macOS, or use the always-visible manual composer on every supported platform.
- Search, edit, complete, copy, and permanently delete Notes from one compact shelf.
- Add up to 16 Tags and 20 managed Attachments to a Note.
- Copy deterministic Markdown with optional Tags and disclosed local Attachment paths.
- Use the English or French interface in Light or Graphite appearance.
- Opt in to signed updater checks; installation always requires an explicit action.

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
