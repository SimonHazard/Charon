# ADR 0016: Pragmatic side-project delivery

## Status

Accepted on 2026-09-05 by operator decision.

Amended on 2026-09-06: the operator deliberately adopted the MIT License for
the repository.

## Context

Charon is a free side project maintained by one operator. Earlier release
contracts accumulated exhaustive physical operating-system, application,
accessibility, and design matrices. Those checklists were useful while defining
the product, but treating every row as a publication gate makes ordinary patch
releases disproportionately expensive and leaves completed work permanently
marked as blocked.

The product still handles user files, clipboard state, global shortcuts, and
irreversible deletion. Relaxing the release ceremony must not relax those
deterministic privacy and data-safety contracts or turn an unimplemented
capability into a support claim.

The v1 also needs an integrated Tauri updater. Tauri updater signatures are
independent from Apple Developer ID and Windows Authenticode, and require a
stable private key that must never enter Git.

## Decision

1. A validated `vX.Y.Z` tag is the only automatic desktop release trigger. It
   builds macOS, Linux, and Windows artifacts and publishes only after every
   platform build succeeds.
2. Version consistency, build success, updater signatures, privacy sentinels,
   Workspace data-safety checks, and release-asset completeness remain
   deterministic gates. The full historical browser, performance, design, and
   physical-platform matrices are available during development but are not
   mandatory release certification.
3. Compatibility is refined through operator use and user reports. Unproved or
   unimplemented native paths remain visibly `experimental` or `unsupported`;
   user testing does not justify a false support claim.
4. Charon ships the Tauri updater. Update checks are initially disabled, become
   automatic at startup only after user opt-in, send no Note or Workspace data,
   and use a public `latest.json`. Download, installation, and restart require
   explicit user action, and restart waits for dirty drafts.
5. GitHub Releases is the v1 download and updater origin. The source repository
   becomes public only after a focused current-tree, history, and GitHub-surface
   review. No GitHub credential is embedded in the app.
6. Platform code signing remains unchanged under ADR 0014: macOS is ad-hoc
   signed; Windows and Linux are unsigned. Release notes disclose first-launch
   warnings and recurring macOS permission grants.
7. Accepted ADRs, current contracts, and `docs/IMPLEMENTATION_HISTORY.md` are the
   durable record. Completed execution plans and journals may be removed after
   their unique decisions and live references have migrated.

## Consequences

- Releases are cheap enough to ship as normal side-project iterations.
- Users may discover compatibility defects first; those become ordinary issues
  and patch releases rather than retroactive certification failures.
- The updater adds one optional network request to GitHub and a permanent key-
  custody responsibility. Losing the private updater key prevents existing
  installations from trusting later updates.
- A public repository exposes its full Git and pull-request history. Removing a
  file from the current branch is cleanup, not historical erasure.
- The repository is licensed under MIT: reuse, modification, distribution, and
  commercial use are permitted when the copyright and licence notice are kept.

## Revisit when

Revisit if Charon becomes a commercial or team-maintained product, gains paid
platform signing, needs staged rollouts or a private update origin, receives a
material security incident, or user reports show that the lightweight release
gate is causing unacceptable data-loss or privacy risk.
