# How to execute and launch Charon

This repository contains implementation plans only today. There is no
`package.json`, `apps/desktop`, `apps/site`, or Tauri crate yet, so no launch
command can work until Plans 001 and 002 have been executed.

## Fastest honest path

Ask an implementation agent to run these prompts from the repository root, one
at a time:

```text
Execute plans/001-freeze-product-and-architecture-contracts.md completely.
Run every verification gate and update plans/README.md when done.
```

```text
Execute plans/002-scaffold-pinned-desktop-toolchain.md completely.
Run every verification gate and update plans/README.md when done.
```

After Plan 002, the shell and Astro smoke site are runnable. To reach the useful
note/copy/capture product, continue Plans 003 through 008 in order. Plan 009
builds the public site, Plan 010 is the optional insights tab, Plan 011 is the
release gate, and Plan 012 creates signed build/update automation.

## Prerequisites

Install and verify:

- Bun at the exact version Plan 002 writes to the root `packageManager` field;
- Rust stable through rustup, including `rustc` and `cargo`;
- Node.js 22.12 or newer for Astro tooling invoked by the Bun workspace;
- platform Tauri 2 prerequisites from
  <https://v2.tauri.app/start/prerequisites/>;
- macOS: Xcode Command Line Tools; Linux: the documented WebKitGTK/system
  packages for the selected distribution; Windows: Microsoft C++ Build Tools
  and WebView2.

Check the toolchain:

```sh
bun --version
node --version
rustc --version
cargo --version
```

## Run after Plan 002

From the repository root:

```sh
bun install --frozen-lockfile
```

Start the native desktop app:

```sh
bun run tauri:dev
```

In a second terminal, start the Astro preview site:

```sh
bun run dev:site
```

Use `bun run dev:desktop` only for browser-focused UI work. Native global
shortcuts, selected-text access, window lifecycle, clipboard permissions, and
other Tauri behavior must be tested through `bun run tauri:dev`.

## Verify and package

Fast JavaScript/TypeScript workspace gate:

```sh
bun run check
```

Rust domain gate:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Build both workspaces and a local debug desktop bundle:

```sh
bun run build
bun run tauri:build -- --debug
```

After Plan 011, run the full release-quality gate:

```sh
bun run verify:release
```

Production installers, signing, updater artifacts, and public download links are
not ready until Plan 012 is complete. Do not publish a debug bundle as a release.

## Common launch blockers

- `package.json` missing: Plans 001/002 have not been executed yet.
- Tauri system-library error: install the target OS prerequisites linked above.
- Astro uses the wrong compiler: desktop/root must resolve TypeScript 7.0.2;
  `apps/site` intentionally resolves TypeScript 6.0.3 until Astro Check supports
  TypeScript 7.
- Double Shift does not work: before Plan 007, only the normal app shell exists.
  Afterwards, support depends on the proved runtime capability; use
  `CmdOrCtrl+Shift+Space` as the cross-platform fallback.
- Site starts but has placeholder content: Plan 009 owns the real product media,
  localized marketing pages, downloads, and SEO.
