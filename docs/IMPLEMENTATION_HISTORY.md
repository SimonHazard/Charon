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
- `07dbb48` is the pre-automation workflow baseline. The active release plan
  replaces only the desktop release trigger; unrelated workflows remain manual.
- On 2026-09-06, Plan 015 added the operator-owned updater trust root, the
  default-off signed updater client, deterministic release metadata/checksums,
  and one three-platform publication workflow. On 2026-09-19 the operator moved
  its trigger from a manually pushed tag to a new manifest version merged into
  protected `main`; the workflow creates the tag only after every artifact is
  complete. The first versioned merge remains the hosted-runner validation
  point.
- The same release cleanup removed separate portability and unsigned
  review-build workflows after the release matrix made both redundant. Quality,
  Security, and site deployment remain explicit operator tools.
- On 2026-09-06, the operator replaced the source-visible, no-reuse terms with
  the standard MIT License before making the repository public.
