# Charon

Charon is a small local capture shelf for people who work with AI agents. It
turns selected text or a short manual entry into ordinary Markdown, keeps every
Note in a folder you control, and copies deterministic agent-ready Markdown only
when you ask it to.

No account, sync, analytics, telemetry, content upload, or automatic Paste.

> Charon is an experimental side project. Native compatibility is improved
> through normal use and user reports rather than a formal certification
> programme.

## Features

- One compact shelf for open and completed Notes.
- Fast manual capture from the always-visible composer.
- Passive double-Shift selected-text capture on macOS, with experimental Windows and Linux X11 adapters.
- Search across Markdown, Tags, and managed Attachment names.
- Markdown editing and preview, up to 16 Tags and 20 managed Attachments per
  Note.
- Deterministic `Copy as Markdown` with optional Tags and disclosed local
  Attachment paths.
- Explicit, confirmed permanent deletion with bounded recovery behavior.
- English and French UI, with Light and Graphite appearances.

Windows uses UI Automation; X11 uses AT-SPI then a bounded PRIMARY request.
These adapters preserve focus and never synthesize Copy. Application coverage
is experimental. Wayland uses `Alt+Shift+Space` to reveal and focus the
composer through the GlobalShortcuts portal because ordinary applications cannot
observe a portable global modifier-only sequence there. The desktop may assign a
different key combination; Charon displays that assignment. Portal absence or
refusal leaves the visible composer available.

## Download and updates

Version 0.1.0 is available in early access for macOS, Windows, and Linux on
[GitHub Releases](https://github.com/SimonHazard/Charon/releases).
After a protected merge to `main`, one new consistent manifest version builds
macOS, Linux, and Windows installers. The workflow creates its `vX.Y.Z` tag,
publishes checksums, and exposes signed metadata to the integrated Tauri updater
only after every platform succeeds. A merge whose version already has a release
does not publish again.

Update checks are disabled by default. Users can enable the metadata-only check
in Preferences, review an available version, and explicitly install it. The
applications remain unsigned by paid platform certificates:

AppImage, NSIS, and macOS installations can self-update; deb, rpm, and MSI
installations must download the new package from GitHub Releases and install it
the same way.

- macOS may require Privacy & Security, Open Anyway, or Control-click, Open;
- Future macOS releases target Apple Silicon (`arm64`) and do not support Intel
  Macs;
- macOS may ask for Input Monitoring and Accessibility again after an update;
- Windows may show SmartScreen and require More info, Run anyway.

Release notes and `SHA256SUMS.txt` describe the exact artifacts. Charon never
claims they are notarized, trusted, or verified by Apple or Microsoft.

## Local data and privacy

One `Workspace` is one local folder, defaulting to `Documents/Charon`. Rust owns
durable reads, writes, migration, managed Attachment copies, transactions, and
recovery. React never reads Note files or Attachment bytes directly.

On macOS, Input Monitoring observes only the double-Shift gesture.
Accessibility reads the focused selection; when direct access returns no text,
ADR 0010 permits one bounded Copy transaction. Selected text may briefly enter
the clipboard, but Charon never posts Paste or overwrites a concurrent clipboard
change.

The updater keeps checks initially disabled. After opt-in, it sends only an
ordinary request for public release metadata: no Note, Tag, Attachment,
Workspace path, stable identifier, or behavioral event. Installation remains
explicit.

Permanent Delete removes the targeted Markdown and managed Attachment bytes
from Charon-controlled active files and normal completed backups. External
backups and operating-system snapshots remain outside that guarantee. The full
boundary is in [the privacy contract](docs/PRIVACY.md).

## Develop

Requirements: Bun `1.3.12`, Rust/Cargo, Node.js 22.22.2 or newer, and the
[Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install --frozen-lockfile
bun run tauri:dev
```

Browser-only development:

```sh
bun run dev:desktop
bun run dev:site
```

The browser fixture is synthetic. It cannot prove native permissions, global
shortcuts, clipboard behavior, file pickers, updater installation, or window
lifecycle.

Useful checks:

```sh
bun run check
bun run build
bun run test:e2e
bun run check:privacy
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

See [Testing](docs/TESTING.md) for the pragmatic validation policy and
[Releasing](docs/RELEASING.md) for the automatic tag flow and updater secrets.

## Repository map

```text
apps/desktop/   React, Vite, Tauri, and the Rust domain
apps/site/      Static Astro early access page
packages/theme/ Shared semantic tokens
docs/           Current contracts, ADRs, and implementation history
plans/          Active implementation queue only
```

Core vocabulary is deliberate: `Workspace`, `CaptureCoordinator`,
`ClipboardComposer`, `Tag`, and `Attachment` mean exactly what the contracts
define.

## Documentation

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Desktop UX](docs/UX.md)
- [Privacy](docs/PRIVACY.md)
- [Platform support](docs/platform-support.md)
- [Public site](docs/SITE.md)
- [ADRs](docs/adr/)
- [Implementation history](docs/IMPLEMENTATION_HISTORY.md)
- [Active plans](plans/README.md)
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

## License

Charon is available under the [MIT License](LICENSE). Copyright © 2026 Simon
Hazard.
