# Develop and launch Charon

## Prerequisites

- Bun `1.3.12`
- Rust stable with Cargo
- Node.js 22.12 or newer for Astro tooling invoked by Bun
- Tauri 2 platform prerequisites

The exact macOS, Debian/Ubuntu, and Windows prerequisites are listed in the
[README platform prerequisites](../README.md#develop), with a link to Tauri's
upstream setup guide.

```sh
bun --version
node --version
rustc --version
cargo --version
bun install --frozen-lockfile
```

## Native desktop

```sh
bun run tauri:dev
```

Use the native build to test global shortcuts, Input Monitoring,
Accessibility, clipboard access, the file/folder pickers, Dock naming, window
state, and motion feel. The browser fixture cannot prove these behaviors.

## Browser-focused development

```sh
bun run dev:desktop
bun run dev:site
```

The desktop development fixture is available at `/?fixture=demo`. It contains
deterministic synthetic application data for E2E tests and produces no public
media.

## Verification

```sh
bun run check
bun run test:e2e
bun run check:privacy
bun run test:perf
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
git diff --check
```

Run the full release gate with:

```sh
bun run verify:release
```

The current active plan and remaining physical gates are listed in
[plans/README.md](./README.md). No automated result promotes an untested native
or signed-artifact claim.
