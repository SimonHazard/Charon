# Charon implementation history

This is the durable milestone ledger for Charon. Detailed task execution remains
available in Git history; active work lives only in `plans/`.

## Product and local data foundation

- `0ca342f` defined the original local-first product, privacy, architecture, and
  UX contracts.
- `107626d` delivered the Rust-owned Workspace, atomic storage, and typed IPC
  commands.
- `afb9c70` added the macOS double-Shift capture coordinator, public
  Accessibility acquisition, and ADR 0010's bounded Copy fallback.
- `0088796` migrated the product to a flat Note collection with Tags, managed
  Attachments, deterministic Markdown copy, and permanent-deletion cleanup.

## Product simplification and public site

- `f06e8fc` completed the first compact preferences, recovery, identity, site,
  and release-quality coverage pass.
- `9274d51` aligned the desktop around the compact single-shelf workflow.
- `ca172d5` configured the static Cloudflare Workers Assets deployment;
  `b4f0199` reduced it to the current media-free holding page.
- `f2b1bbd` through `8d24150` removed Note Selection and restored direct
  per-Note actions.
- `37d6f74` removed the plan-executor machinery and returned the repository to
  ordinary direct development.

## Portability, safety, and performance

- `86ae89b` made Workspace persistence portable to Windows and Linux.
- `c04bfad` made shortcut and capability UI platform-accurate, and `1d58571`
  configured macOS, Linux, and Windows bundle targets.
- `662acbb`, `d3db577`, `6ebf68a`, and `09d1963` hardened recovery, draft
  preservation, focus, CSP, IPC, workflow, and documentation boundaries.
- `300c6a6`, `62da4f9`, `c3ad352`, and `4e2a12b` improved accessibility,
  search/render performance, motion/copy polish, and transaction scope.
- `4d40f43` recorded the public-API feasibility work for Windows, X11, and
  Wayland capture adapters.

## Delivery direction

- ADR 0014 keeps releases free of paid Apple and Microsoft signing while
  requiring honest first-launch warnings.
- ADR 0016 accepts a pragmatic side-project release model: deterministic safety
  checks remain, compatibility is refined through normal use, and one new
  consistent manifest version merged to protected `main` publishes a
  three-platform release and its tag automatically. The signed Tauri updater
  uses public GitHub Release assets.
- `07dbb48` is the pre-automation workflow baseline. Plan 015 replaced only the
  desktop release trigger; unrelated workflows remain manual.
- On 2026-09-06, Plan 015 added the operator-owned updater trust root, the
  default-off signed updater client, deterministic release metadata/checksums,
  and one three-platform publication workflow. On 2026-09-19 the operator moved
  its trigger from a manually pushed tag to a new manifest version merged into
  protected `main`; the workflow creates the tag only after every artifact is
  complete. The first versioned merge published v0.1.0 on 2026-09-20 and
  validated the three hosted runners; v0.1.1 (`2e5cebc`) followed the same day.
- The same release cleanup removed separate portability and unsigned
  review-build workflows after the release matrix made both redundant. Quality,
  Security, and site deployment remain explicit operator tools.
- On 2026-09-06, the operator replaced the source-visible, no-reuse terms with
  the standard MIT License before making the repository public.
- On 2026-09-21, ADR 0017 changed the macOS release policy from Intel to
  native Apple Silicon (`arm64`) artifacts. v0.1.0 and v0.1.1 remain published
  as Intel (`x86_64`) builds; v0.1.3 is the first `darwin-aarch64` release.
  macOS 14 remains the minimum OS, and universal artifacts are not planned.
- On 2026-09-23, ADR 0018 replaced macOS ad-hoc signing with one stable
  self-signed certificate imported and trusted only on the release runner, so
  Input Monitoring and Accessibility survive updates. The release workflow now
  fails closed on an ad-hoc designated requirement; the first signed release
  asks users once more.

## Experimental cross-platform capture and control polish (2026-09-21)

- Plan 034 adds passive Windows WH_KEYBOARD_LL and X11 XI2 adapters using the
  existing double-Shift machine. Windows reads UI Automation only; X11 reads
  focused AT-SPI then bounded PRIMARY. Neither new adapter synthesizes Copy.
- Windows/X11 start as experimental, fail without creating a Note, and preserve
  source focus and CLIPBOARD. Results are limited to 500 ms and 1 MiB, with at
  most one outstanding provider worker. AT-SPI focus metadata avoids scanning
  background application trees. macOS acquisition remains unchanged.
- Windows/X11 register Alt+Shift+Space. Wayland owns a GlobalShortcuts portal
  session, displays the granted key, handles denial and changes, and never
  starts the X11 shortcut plugin or advertises double Shift. Compositor focus
  restrictions remain a native compatibility limit.
- Desktop controls now consistently use semantic hover/pressed/selection roles,
  control radii and focus rings; Note borders and text hierarchy are refined.
  Charon Lavender remains #8f8be8, with the same Light/Graphite appearances.
- Validation includes the full local check and Rust suite, 44 Chromium/WebKit
  cases, full Linux/Windows cross-platform compilation and Clippy, plus isolated
  Xvfb and mocked D-Bus adapter tests. This is not physical Windows/Wayland
  certification; no release or version change accompanies the work.

## Honest distribution and shortcut labels (2026-09-22)

- `cd79fd9` (#56) shipped Plan 034 with Plans 035-037 from the 2026-09-21
  audit. Help and Preferences render the Rust-reported `activeShortcut` through
  one accelerator formatter, so Windows and X11 show `Alt+Shift+Space` and
  Wayland shows its portal assignment; the hardcoded shortcut messages are gone.
- Quality now runs Clippy and the Rust suite on `macos-15` and `windows-2025`
  in addition to Linux, `rust-version` matches the pinned toolchain, and
  `messages:check` rejects Rust message keys missing from the Paraglide
  catalogs.
- Preferences reports the installed bundle type. deb, rpm, and MSI
  installations explain the manual update path instead of failing inside the
  updater, macOS install confirmation warns about the permission regrant, and
  the unused tray/xdo Linux package dependencies were removed.
- The v0.1.2 release run failed before publication because `--locked` reached
  the Tauri CLI instead of Cargo; no tag or partial release appeared. `242d51e`
  (#57) forwarded the flag correctly and published v0.1.3 for Apple Silicon
  macOS, Linux, and Windows.

## v0.2.0: the September audit queue (2026-10-02)

- `714fdab` (#67), after #64-#66, shipped plans 038-062 and inline Markdown
  drawings as v0.2.0: system-following appearance and pre-paint canvas (ADR
  0019), the Lavender token foundation and paint-only feedback (ADR 0020), a
  multi-line composer, optimistic row actions, top-anchored toasts, the
  captured-Note acknowledgement, keyboard and search fluidity, the hoisted
  update dialog, Tooltip rules, the About section, accurate Markdown help, the
  Note list edge fade (ADR 0022), the macOS window lifecycle, the IPC trust
  boundary with single-use folder tokens, motion tests, opt-in background mode
  (ADR 0023), capture notifications (ADR 0024), a user-chosen composer shortcut
  (ADR 0025), opt-in formatted capture (ADR 0026), and drawings (ADR 0021).
- Plan 052 was rejected when macOS releases returned to Tauri's ad-hoc
  identity (ADR 0027, superseding ADR 0018). The plans were removed on
  2026-10-17; their native checks that no automated test covers moved to plan
  063.

## v0.3.0: Iris design and faster capture flows (prepared 2026-10-17)

- On 2026-10-17 the operator asked to finish the project, extend its capture
  flows, adopt the Iris design system, and bump every dependency. Tauri 3
  being only in alpha, dependencies moved to the latest stable releases
  instead: Tauri 2.12.4 and its plugins, Base UI 1.9, Motion 14, TanStack
  Markdown 1.0, Vitest 5, Vite 8.3, Astro 7.4, and Biome 2.5.15 (whose
  out-of-root formatting crash `scripts/check-bindings.ts` now avoids by
  formatting through stdin).
- ADR 0028 maps the Iris palette, density, glass, grain, floating composer, and
  control styles onto Charon's semantic roles; Light and Dark replace
  Graphite; the macOS title bar becomes an overlay.
- ADRs 0029-0033 add the `CmdOrCtrl+K` command menu, the focused Tag (with
  tagged selected-text captures), hiding that returns focus with a toggling
  composer shortcut and Escape, dropped and pasted files and screenshots as
  Attachments, and drawing shapes, text labels, a New drawing command, and
  Copy image.
- The manifests, release notes, and site moved to 0.3.0 on the
  `codex/v0.3` branch; plan 063 holds the native checks before the release.
- ADR 0034 redesigns the site in Iris Dark around a live river (React Bits'
  Threads), Charon's real outputs, a live `Copy as Markdown` preview, and an
  accent-field privacy section, with a hash-checked CSP for its scripts.
