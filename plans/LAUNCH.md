# How to execute and launch Charon

Charon is implemented through completed Plan 007 at commit `9beb3fe`. The
desktop app, Tauri/Rust core, shared theme package, and Astro scaffold run today.
Plans 008-015 replace the unstarted former roadmap and simplify the product
before release.

## Next implementation path

Run one plan at a time from the repository root. The next prompt is:

```text
Execute plans/008-freeze-rapid-capture-product.md completely.
Run its drift check and every verification gate, stop on every STOP condition,
and update plans/README.md only when its done criteria pass.
```

Continue in the dependency order from `plans/README.md`:

1. Plan 008 accepts the rapid-capture ADR and rewrites contracts.
2. Plan 009 integrates approved brand assets and Solarized-first tokens.
3. Plan 010 migrates Workspace to flat Notes with lightweight Tags, managed
   Attachments, agent-ready Markdown copy, and truthful permanent deletion.
4. Plan 011 replaces the rail/routes with the single shelf and contextual Note actions.
5. Plan 012 adds compact preferences, folder choice, and pragmatic fallbacks.
6. Plan 013 builds the real static product site.
7. Plan 014 establishes the release-quality gate.
8. Plan 015 owns signing, builds, updates, hosting, and releases.

Do not execute an implementation plan before every listed dependency is DONE.

## Prerequisites

Install and verify:

- Bun `1.3.12`;
- Rust stable with `rustc` and `cargo`;
- Node.js 22.12 or newer for Astro tooling invoked by Bun;
- platform Tauri 2 prerequisites from
  <https://v2.tauri.app/start/prerequisites/>;
- macOS: Xcode Command Line Tools; Linux: the distribution's WebKitGTK/system
  packages; Windows: Microsoft C++ Build Tools and WebView2.

```sh
bun --version
node --version
rustc --version
cargo --version
```

## Install and launch the current scaffold

From the repository root:

```sh
bun install --frozen-lockfile
```

Start the native desktop app:

```sh
bun run tauri:dev
```

Start the Astro scaffold in a second terminal:

```sh
bun run dev:site
```

Use `bun run dev:desktop` only for browser-focused React work. Global shortcut,
selected-text access, window focus, clipboard permissions, folder chooser, and
native lifecycle behavior require `bun run tauri:dev`.

The current UI still shows the broad pre-pivot rail/workflows until Plans
010-012 land. That is expected historical state, not the target product.

## Verify the current repository

JavaScript/TypeScript workspaces:

```sh
bun run check
```

Rust domain and native adapters:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Build both workspaces and a local debug desktop bundle:

```sh
bun run build
bun run tauri:build -- --debug
```

After Plan 014, run the consolidated gate:

```sh
bun run verify:release
```

Production installers, signed updates, public downloads, and site deployment are
not ready until Plan 015 is complete. Never publish a debug/ad-hoc bundle as a
release.

## Capture expectations

- macOS enhanced capture requires separate Input Monitoring and Accessibility
  consent. The unmodified double-Shift path first uses public Accessibility and
  then ADR 0010's bounded Copy fallback.
- A debug/ad-hoc permission grant is development evidence only and may need a
  reset after rebuild.
- Linux and Windows do not currently inherit a double-Shift selected-text claim.
- `CmdOrCtrl+Shift+Space` is the cross-platform fallback. Before Plan 012 it
  opens the current empty editor; after Plan 012 it reveals Charon and focuses
  the bottom composer.

## Common blockers

- Bun lock mismatch: use the exact Bun version and never edit `bun.lock` by hand.
- Rust lock mismatch: use Cargo with `--locked`; regenerate only when a plan owns
  the dependency change.
- Tauri system-library error: install the target OS prerequisites linked above.
- Astro compiler mismatch: desktop/root resolve TypeScript `7.0.2`; the site
  intentionally resolves `6.0.3` until Astro Check proves TypeScript 7 support.
- Double Shift unavailable: use the standard fallback and inspect explicit
  capability/permission state; do not add a speculative hook.
- Site is still a scaffold: Plan 013 owns real localized content and media.
- Signed installer/update/site URL absent: Plan 015 owns them and requires
  operator secrets, approval, and manual installation evidence.
