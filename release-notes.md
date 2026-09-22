# Charon 0.1.2 — Early Access

Charon is a local-only capture shelf for turning selected text or short manual entries into ordinary, agent-ready Markdown files in a folder you control.

## Highlights

- Try experimental selected-text capture on Windows and Linux X11, alongside the
  macOS capture path. Wayland provides a portal-registered composer shortcut.
- See the shortcut actually registered by the platform in Help and Preferences.
- Install native Apple Silicon (`arm64`) macOS builds; Intel Macs are outside
  this release target.
- Use honest update guidance for each installer type, including manual updates
  for deb, rpm, and MSI packages.

## Early Access limits

- Windows and Linux X11 selected-text capture is experimental. Compatibility
  depends on the source application and platform accessibility support.
- Wayland does not claim double-Shift capture. Use `Alt+Shift+Space` to reveal and focus the composer.
- Charon is an experimental side project. Native compatibility is improved through normal use and user reports rather than a formal certification programme.

## Installation and trust

- macOS builds use an ad-hoc signature and are not notarized. On first launch, use Privacy & Security > Open Anyway, or Control-click > Open. Input Monitoring and Accessibility may need to be granted again after an update.
- Windows builds are unsigned and may show a SmartScreen warning. Use More info > Run anyway only after checking the download.
- Linux packages are unsigned.
- `SHA256SUMS.txt` provides integrity checks. Tauri updater signatures are separate from Apple or Microsoft code signing.

## Privacy

Charon has no account, sync, analytics, telemetry, crash upload, content upload, or automatic Paste. Update checks are disabled by default and send no Note content, Attachment, Workspace path, or stable identifier when enabled.
