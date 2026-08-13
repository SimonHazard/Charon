# Charon

Charon is a small local capture shelf for people who work with AI agents. It
turns selected text or a short manual entry into ordinary Markdown, keeps the
files in a folder you control, and copies a deterministic Markdown selection
when you ask it to.

No account, sync, analytics, telemetry, content upload, or automatic paste.

## What it does

- Capture selected text with unmodified double Shift on a proved macOS adapter.
- Reveal Charon and focus the bottom composer with
  `CmdOrCtrl+Shift+Space`.
- Search Notes, Tags, and Attachment names in one list. Done Notes stay visible
  and are muted and struck through.
- Select one Note with a click, extend a range with `Shift`-click, or toggle
  individual Notes with `Cmd`/`Ctrl`-click.
- Edit Markdown, Tags, and Note-owned Attachments in an expanding Note row.
- Copy the ordered Selection as deterministic Markdown, including optional
  Tags and managed local Attachment paths.
- Permanently delete Notes only after a count-specific confirmation.

The desktop has one narrow shelf, Light and Graphite appearances, English and
French, compact Preferences, and an always-visible manual composer.

## Local data and permissions

One `Workspace` is one local folder, defaulting to `Documents/Charon`. Rust owns
every durable read, write, migration, Attachment copy, transaction, and recovery
operation. React never reads Note files or Attachment bytes directly.

On macOS, Input Monitoring observes only the double-Shift modifier sequence.
Accessibility reads the focused selection and, when direct access returns no
text, permits ADR 0010's single bounded source-application Copy transaction.
Selected text may briefly enter the system clipboard; Charon never posts Paste
or overwrites a concurrent clipboard change.

Permanent Delete removes active Markdown and managed Attachment bytes from
Charon-controlled files and normal completed transaction backups. Operating-
system snapshots, synced history, and external backups remain outside that
guarantee. See [the privacy contract](docs/PRIVACY.md) for the exact boundary.

## Repository

```text
apps/desktop/   React, Vite, Tauri, and the Rust domain
apps/site/      Static Astro holding page
packages/theme/ Framework-neutral semantic tokens
docs/           Product contracts and accepted ADRs
plans/          Ordered implementation history and active handoff
```

The desktop and site share only `@charon/theme`. The site is a media-free static
holding page deployed with Cloudflare Workers Static Assets; it has no Worker
runtime, client script, tracker, form, or API.

## Develop

Requirements: Bun `1.3.12`, Rust/Cargo, Node.js 22.12 or newer for Astro, and
the platform prerequisites for Tauri 2.

```sh
bun install --frozen-lockfile
bun run tauri:dev
```

For browser-only work:

```sh
bun run dev:desktop
bun run dev:site
```

The browser fixture is synthetic and cannot prove native permissions, global
shortcuts, clipboard behavior, file pickers, or window lifecycle.

## Verify

```sh
bun run check
bun run test:e2e
bun run check:privacy
bun run test:perf
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

`bun run verify:release` runs the consolidated release gate. Native and signed-
artifact claims remain blocked until their physical matrices pass.

## Contracts

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Desktop UX](docs/UX.md)
- [Privacy](docs/PRIVACY.md)
- [Public site](docs/SITE.md)
- [Testing](docs/TESTING.md)
- [Platform support](docs/platform-support.md)
- [Implementation plans](plans/README.md)
- [ADR 0011: rapid-capture product](docs/adr/0011-rapid-capture-product.md)
- [ADR 0012: unified Note shelf](docs/adr/0012-unified-note-shelf.md)

Core vocabulary is deliberate: `Workspace`, `CaptureCoordinator`,
`ClipboardComposer`, `Selection`, `Tag`, and `Attachment` mean exactly what the
contracts define.
