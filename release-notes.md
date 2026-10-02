# Charon 0.2.0 — Early Access

Charon is a local-only capture shelf for turning selected text or manual entries into ordinary, agent-ready Markdown files in a folder you control.

## Highlights

- Follow the system appearance by default, or choose Light or Graphite. The shelf has clearer row states, consistent Tooltips, faster transient exits, and reduced-motion fallbacks.
- Write multi-line Notes in the composer: Enter creates a Note and Shift+Enter adds a line break. Copy and status actions respond in place, and captured Notes are acknowledged when you reveal the shelf.
- Navigate Notes with Home, End, Page Up and Page Down, copy a focused Note with Cmd/Ctrl+C, and save the expanded editor with Cmd/Ctrl+S. Search and Markdown help preserve keyboard focus.
- Draw inside a Note. Small drawings are stored as ordinary fenced SVG text in its Markdown, edited locally, and rendered only after strict validation.
- Keep Charon reachable after closing its macOS window. Optional background mode adds Open and Quit to the macOS menu bar or Windows notification area, with draft protection on explicit Quit.
- Optionally enable content-free capture notifications or change the composer shortcut on macOS, Windows, and X11. Double Shift stays fixed; Wayland uses its desktop-assigned shortcut.
- On macOS, experimental Keep formatting converts the existing Copy fallback's HTML to Markdown only when it agrees with the plain selection; uncertain captures keep the exact plain text.
- Keep drafts safe before installing updates, including the Windows installer that closes Charon. Preferences shows the app version, source links, and installer-specific guidance.
- Restrict native commands to the main window's capability and use short-lived, one-shot tokens for Workspace folder choices. Linux packages target glibc 2.35 or newer.

## Early Access limits

- Windows and Linux X11 selected-text capture remains experimental. Compatibility
  depends on the source application and platform accessibility support.
- Wayland does not support double-Shift capture or an app-configured composer shortcut; use the shortcut assigned by the desktop portal.
- Background mode is available on macOS and Windows only. Keep formatting is experimental and macOS-only; it applies only when the existing Copy fallback runs.
- Notifications contain only fixed localized text. Charon cannot report the operating system's notification permission, and notification clicks keep the platform default.
- Native tray, permission, shortcut, formatted-capture, and updater installation checks remain partly unverified on real machines. Browser fixtures and CI do not certify these operating-system behaviours.
- A manual downgrade to an older build can reset preferences, including the remembered Notes folder: the older build backs up the newer preferences file and starts from defaults. Notes and Attachments stay untouched; choose the Workspace again when upgrading.
- Charon is an experimental side project. Native compatibility is improved through normal use and user reports rather than a formal certification programme.

## Installation and trust

- macOS builds target Apple Silicon (`arm64`), use an ad-hoc signature, and are not notarized. On first launch, use Privacy & Security > Open Anyway, or Control-click > Open. Input Monitoring and Accessibility may need to be granted again after every update.
- macOS v0.1.0 and v0.1.1 were Intel builds and cannot self-update to Apple Silicon builds; install the current `.dmg` manually once.
- Windows builds are unsigned and may show a SmartScreen warning. Use More info > Run anyway only after checking the download.
- Linux packages are unsigned and require glibc 2.35 or newer (Ubuntu 22.04, Debian 12, or later).
- deb, rpm, and MSI installations update manually from GitHub Releases. AppImage, NSIS, and macOS installations can use the opt-in updater.
- `SHA256SUMS.txt` provides integrity checks. Tauri updater signatures are separate from Apple or Microsoft code signing.

## Privacy

Charon has no account, sync, analytics, telemetry, crash upload, content upload, or automatic Paste. Update checks, background mode, capture notifications, and Keep formatting are disabled by default. Enabled update checks send no Note content, Attachment, Workspace path, or stable identifier. Drawings and formatted capture remain local; notification text never includes Note content.
