# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- A validated `vX.Y.Z` tag automatically builds and publishes macOS, Linux, and
  Windows Tauri releases after every platform succeeds.
- The signed in-app updater uses public GitHub Release assets. Checks are
  default-off until enabled; install and restart remain explicit and draft-safe.
- Deterministic version, compilation, privacy, data-safety, updater-signature,
  and release-asset checks remain. Exhaustive physical certification is not a
  release gate; operator use and user reports drive patch releases.
- macOS keeps double Shift and `Cmd+Shift+Space`. Windows and Linux X11 target
  double Shift; Windows/Linux use `Alt+Shift+Space` for composer focus. Wayland
  never claims a global modifier-only gesture.
- The repository is prepared for a public source-visible release but remains
  private until the operator explicitly changes its GitHub visibility.

## Active queue

| Plan | Title | Priority | Effort | Status |
| --- | --- | --- | --- | --- |
| 015 | Publish automatic Tauri releases and integrated updates | P1 | M | TODO |
| 034 | Add pragmatic Windows/Linux capture shortcuts | P2 | L | TODO |

Plan 015 can ship before the Windows/X11 adapters. Unsupported capture paths
stay honest and the visible composer remains functional.

Status values are `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, and
`REJECTED: <reason>`.

## GitHub secrets and variables

Create a GitHub Actions environment named `release`, without a required reviewer,
and store exactly:

- `TAURI_SIGNING_PRIVATE_KEY`: complete private updater key content;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that key.

Commit only the matching public key. Back up the private key and password outside
Git; losing them prevents existing installations from accepting later updates.

GitHub supplies `secrets.GITHUB_TOKEN`; do not create it. No GitHub Actions
variable is required. Do not create Apple, notarization, Authenticode, or paid
certificate secrets. macOS remains ad-hoc signed and Windows/Linux remain
unsigned under ADR 0014.

The unrelated `site-production` environment already contains
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Desktop release jobs never
receive those values.

## Plan lifecycle

One plan describes one bounded implementation. After its done criteria pass,
migrate any durable decision or milestone into docs/ADRs/history, remove its
live references, then delete the plan. Git history remains the detailed
archaeological record; do not create an execution-journal archive.
