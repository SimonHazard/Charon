# Charon implementation plans

This directory contains only active work. Accepted decisions live in ADRs,
current behavior lives in product/architecture/privacy/UX contracts, and shipped
milestones live in [`docs/IMPLEMENTATION_HISTORY.md`](../docs/IMPLEMENTATION_HISTORY.md).

## Current direction

- v0.2.0 shipped on 2026-10-02 (#67) with the whole September queue (plans
  038-062, now removed; their native checks moved to plan 063).
- On 2026-10-17 the operator asked to finish the project, adopt the Iris
  design system, and speed up capture. ADRs 0028-0033 record the result: the
  Iris design system, the `CmdOrCtrl+K` command menu, the focused Tag, hiding
  that returns focus, files dropped or pasted as Attachments, and drawing
  shapes, labels, and image copy. It is prepared as v0.3.0 (manifests, release
  notes, site) on the branch `codex/v0.3`, whose pull request to `main` waits
  for the operator's native tests.
- Tauri 3 is still alpha (3.0.0-alpha.5); Charon stays on the latest Tauri 2
  (2.12.4) and every other dependency moved to its latest stable release.
- A protected merge to `main` builds and publishes Apple Silicon macOS, Linux,
  and Windows releases when the four manifests carry one new consistent
  version. Exhaustive physical certification is not a release gate; operator
  use and user reports drive patch releases.
- macOS keeps double Shift and `Cmd+Shift+Space`; Windows and Linux X11 keep
  experimental double Shift and `Alt+Shift+Space`; Wayland uses a
  portal-assigned shortcut and never claims a modifier-only gesture.

## Active queue

| Plan | Title | What it does | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 063 | [Verify natively and release 0.3.0](063-verify-natively-and-release-0-3-0.md) | Checks on real machines what tests cannot (title bar, hiding, drops, pastes, drawings, v0.2 leftovers), then commits, opens the pull request, and releases 0.3.0 | P1 | M | — | IN PROGRESS: implemented and bumped to 0.3.0 on `codex/v0.3` (pull request open), awaiting operator test |

Status values are `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, and
`REJECTED: <reason>`.

## Direction (options for the operator, not planned)

- **A drawing shortcut from anywhere**: it would need a second global
  shortcut, which ADR 0025 does not allow yet.
- **Image previews** for pasted screenshots: Charon previews no Attachment
  today (ADR 0032 keeps that); a bounded PNG/JPEG thumbnail would need its own
  ADR and the asset protocol.
- **Delta command results.** Every Workspace command returns the full
  snapshot. A `changedNotes + revision` result would make writes feel local at
  20k Notes; IPC contract and bindings change; spike first.
- **Drop MSI** to halve the Windows surface; MSI installs already update by
  hand and ship English only.
- **Self-update deb, rpm, and MSI installs** through `tauri-plugin-updater`'s
  per-installer keys; product decision.

## Plan lifecycle

One plan describes one bounded implementation. After its done criteria pass,
migrate any durable decision or milestone into docs/ADRs/history, remove its
live references, then delete the plan. Git history remains the detailed
archaeological record; do not create an execution-journal archive.
