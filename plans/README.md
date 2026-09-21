# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- A protected merge to `main` automatically builds and publishes macOS, Linux,
  and Windows Tauri releases only when the four manifests contain one new
  consistent version. The workflow creates the matching `vX.Y.Z` tag after
  every platform succeeds.
- The signed in-app updater uses public GitHub Release assets. Checks are
  default-off until enabled; install and restart remain explicit and draft-safe.
- Deterministic version, compilation, privacy, data-safety, updater-signature,
  and release-asset checks remain. Exhaustive physical certification is not a
  release gate; operator use and user reports drive patch releases.
- macOS keeps double Shift and `Cmd+Shift+Space`. Windows and Linux X11 implement
  experimental double Shift and use `Alt+Shift+Space` for composer focus. Wayland
  uses a portal-assigned composer shortcut and never claims a modifier-only gesture.
- The repository is public. Contributions use pull requests, Simon Hazard is
  the principal maintainer, and protected `main` updates deploy the static site.

## Active queue

| Plan | Title | Priority | Effort | Status |
| --- | --- | --- | --- | --- |
| 015 | Publish automatic Tauri releases and integrated updates | P1 | M | IN PROGRESS: implementation ready; first versioned merge pending |

The completed cross-platform capture work is recorded in
[`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md) and
[`docs/platform-support.md`](../docs/platform-support.md). The visible composer
remains functional when experimental acquisition or portal registration is unavailable.

Status values are `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, and
`REJECTED: <reason>`.

## GitHub secrets and variables

Create a GitHub Actions environment named `release`, without a required reviewer,
and store exactly for the current unencrypted key:

- `TAURI_SIGNING_PRIVATE_KEY`: complete private updater key content.

Commit only the matching public key. Back up the private key outside Git;
losing it prevents existing installations from accepting later updates.

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
