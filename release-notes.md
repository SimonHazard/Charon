# Charon 0.3.0 — Early Access

Charon is a local-only capture shelf for turning selected text or manual entries into ordinary, agent-ready Markdown files in a folder you control.

## Highlights

- A new Iris look: denser rows, hairline Note cards, a floating composer, translucent menus and dialogs, and Light and Dark appearances that follow the system by default. On macOS the window controls now sit in the shelf's own top strip.
- Press Cmd/Ctrl+K for the command menu: focus a tag, open a Note, start a new note or drawing, open settings or help, switch appearance or language, or hide Charon.
- Focus one tag and keep working: the shelf shows only its Notes, and every new Note, typed, captured with double Shift, drawn, or dropped, receives that tag until you leave it.
- Hide Charon and go straight back to the app you were using, with Escape when nothing else is open or with the composer shortcut while Charon is in front. On macOS, closing the window does the same.
- Drop files onto the shelf, or paste copied files or a screenshot, to attach them to a Note or capture them as a new Note.
- Drawings gain lines, arrows, rectangles, ellipses, and text labels, a New drawing command, and Copy image to paste a sketch straight into a prompt.
- Dependencies are updated to the latest stable releases, including Tauri 2.12.

## Early Access limits

- Windows and Linux X11 selected-text capture remains experimental. Compatibility
  depends on the source application and platform accessibility support.
- Wayland does not support double-Shift capture or an app-configured composer shortcut; use the shortcut assigned by the desktop portal.
- Hiding Charon minimizes the window on Linux, and on Windows unless background mode is on.
- Background mode is available on macOS and Windows only. Keep formatting is experimental and macOS-only; it applies only when the existing Copy fallback runs.
- Notifications contain only fixed localized text. Charon cannot report the operating system's notification permission, and notification clicks keep the platform default.
- Native window, drop, paste, tray, permission, shortcut, and updater checks remain partly unverified on real machines. Browser fixtures and CI do not certify these operating-system behaviours.
- A manual downgrade to an older build can reset preferences, including the remembered Notes folder: the older build backs up the newer preferences file and starts from defaults. Notes and Attachments stay untouched; choose the Workspace again when upgrading. Drawings with text labels show as code in older builds.
- Charon is an experimental side project. Native compatibility is improved through normal use and user reports rather than a formal certification programme.

## Installation and trust

- macOS builds target Apple Silicon (`arm64`), use an ad-hoc signature, and are not notarized. On first launch, use Privacy & Security > Open Anyway, or Control-click > Open. Input Monitoring and Accessibility may need to be granted again after every update.
- macOS v0.1.0 and v0.1.1 were Intel builds and cannot self-update to Apple Silicon builds; install the current `.dmg` manually once.
- Windows builds are unsigned and may show a SmartScreen warning. Use More info > Run anyway only after checking the download.
- Linux packages are unsigned and require glibc 2.35 or newer (Ubuntu 22.04, Debian 12, or later).
- deb, rpm, and MSI installations update manually from GitHub Releases. AppImage, NSIS, and macOS installations can use the opt-in updater.
- `SHA256SUMS.txt` provides integrity checks. Tauri updater signatures are separate from Apple or Microsoft code signing.

## Privacy

Charon has no account, sync, analytics, telemetry, crash upload, content upload, or automatic Paste. Update checks, background mode, capture notifications, and Keep formatting are disabled by default. Enabled update checks send no Note content, Attachment, Workspace path, or stable identifier. A paste reads the clipboard only after you paste, and only for files or an image; a pasted image is stored as a temporary PNG only until its import ends, it is refused, or five minutes pass. Copy image writes a drawing to the clipboard only when you ask. Drawings, files, and formatted capture remain local; notification text never includes Note content.
