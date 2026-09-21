# ADR 0017: Apple Silicon-only macOS distribution

## Status

Accepted on 2026-09-21 by operator decision.

## Context

The macOS release was built on an Intel GitHub runner and therefore produced
an `x86_64` application. macOS now warns that Intel-based applications will
not remain supported by a future system version. Charon is a modern side
project whose macOS audience uses Apple Silicon.

## Decision

1. Charon's published macOS installers and updater artifact target Apple
   Silicon (`arm64`) only.
2. The release workflow uses GitHub's arm64 `macos-15` runner and fails before
   building if `uname -m` is not `arm64`.
3. Release metadata uses the Tauri `darwin-aarch64` platform key. Charon does
   not publish a macOS Intel or universal artifact.
4. macOS 14 remains the minimum operating-system version. This decision is an
   architecture boundary, not a claim that only the newest M-series generation
   can run Charon: Apple Silicon Macs from M1 onward remain in scope.
5. Windows and Linux targets, local-only privacy behavior, updater signing, and
   the unsigned/ad-hoc platform-signing posture are unchanged.

## Consequences

- The macOS app is native on Apple Silicon and no longer needs Rosetta.
- Intel Macs remain outside the supported release target and do not receive a
  compatible macOS updater artifact.
- The existing published Intel release cannot be rewritten in place; the next
  versioned release must publish the new arm64 artifact.
- The macOS compatibility row and download copy must say Apple Silicon rather
  than implying universal macOS support.

## Revisit when

Revisit only if Charon deliberately restores Intel or universal macOS support,
which would require a new release matrix, artifact contract, and compatibility
decision.
