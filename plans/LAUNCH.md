# How to execute and launch Charon

Charon's flat local Workspace, managed Attachments, `Copy as Markdown`, single
shelf, minimal Preferences, automated quality harness, and static site exist at
commit `7294773`. The remaining path first compacts the desktop around the
approximately 450px-wide reference, then proves every workflow, exact candidate,
and GitHub release path.

## Next implementation path

Run one plan at a time from the repository root. The next prompt is:

```text
Execute plans/016-refine-premium-desktop-shelf.md completely.
Run its drift check and every verification gate, stop on every STOP condition,
and update plans/README.md only when its done criteria pass.
```

Continue in the dependency order from `plans/README.md`:

1. Plan 016 establishes the 480px-first-run compact shelf and responsive visual
   foundation without changing product semantics.
2. Plan 017 aligns every current workflow at effective 360px and above,
   including Tags, up to 20 managed Attachments, Selection, copy, Delete,
   Preferences, Workspace recovery, EN/FR, and accessibility.
3. Plan 014 closes the physical matrix against the exact candidate files that
   GitHub Releases will publish.
4. Plan 015 accepts a distribution ADR, adds opt-in Tauri-signed updates, and
   publishes protected macOS/Linux/Windows GitHub Releases without paid Apple
   Developer ID/notarization or Windows Authenticode certificates.

Do not execute a plan before every listed dependency is `DONE`. Plans 011 and
012 retain their truthful physical-evidence blockers until the matching exact
candidate rows pass; do not confuse existing automation with final acceptance.

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

## Install and launch the current repository

From the repository root:

```sh
bun install --frozen-lockfile
```

Start the native desktop app:

```sh
bun run tauri:dev
```

Start the static Astro site in a second terminal:

```sh
bun run dev:site
```

Use `bun run dev:desktop` only for browser-focused React work. Global shortcut,
selected-text access, window focus, clipboard permissions, file/folder choosers,
and native lifecycle behavior require `bun run tauri:dev`.

The current desktop is functional but still opens on the pre-Plan-016 960px
canvas. That is the known starting point, not the compact target. Attachment
rows intentionally show safe metadata rather than arbitrary thumbnails, and the
bottom composer intentionally creates body-only Notes.

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

Run the consolidated gate already introduced by the quality harness:

```sh
bun run verify:release
```

Each current plan adds a narrower visual, native, or artifact gate. Its commands
and STOP conditions take precedence over this general launch guide.

## Distribution target

No paid Apple or Windows publisher certificate is planned:

- macOS candidates use Tauri's configured ad-hoc identity and are not notarized;
- Windows candidates are unsigned and must disclose the observed SmartScreen
  experience;
- Linux packages are distributed with checksums and documented dependencies;
- Tauri's updater key signs update metadata/packages only and does not create an
  Apple or Windows publisher identity.

Plan 015 owns the exact workflow, protected updater secrets, `latest.json`,
detached signatures, checksums, installers, draft approval, and release runbook.
The desktop updater remains default-off and explicit. The site remains static
and will link directly to:

```text
https://github.com/SimonHazard/Charon/releases/latest
```

It must not call the GitHub API in the browser. Until the first public release
exists, no copy may imply that `/releases/latest`, an installer, or an updater is
available. Site hosting/deployment remains separate from GitHub artifact
distribution.

## Capture expectations

- macOS enhanced capture requires separate Input Monitoring and Accessibility
  consent. The unmodified double-Shift path first uses public Accessibility and
  then ADR 0010's bounded Copy fallback.
- Rebuilding an ad-hoc macOS app can disturb TCC continuity; each exact candidate
  must be retested rather than inheriting a previous grant.
- Linux and Windows do not inherit a double-Shift selected-text claim.
- `CmdOrCtrl+Shift+Space` is the cross-platform fallback: it reveals the existing
  window and focuses the always-visible bottom composer.

## Common blockers

- Bun lock mismatch: use the exact Bun version and never edit `bun.lock` by hand.
- Rust lock mismatch: use Cargo with `--locked`; regenerate only when a plan owns
  the dependency change.
- Tauri system-library error: install the target OS prerequisites linked above.
- Astro compiler mismatch: desktop/root resolve TypeScript `7.0.2`; the site
  intentionally resolves `6.0.3` until Astro Check proves TypeScript 7 support.
- Compact layout clips or overflows: stop in Plan 016/017; do not hide a feature
  or change Attachment ownership to make it fit.
- Double Shift unavailable: use the standard fallback and inspect explicit
  capability/permission state; do not add a speculative hook.
- No Apple/Windows signing certificate: expected, not a missing secret. Record
  platform warnings and keep updater signing language distinct.
- Release or updater URL absent: Plan 015 owns it and requires an accepted ADR,
  protected Tauri keys, exact-candidate evidence, and operator approval.
