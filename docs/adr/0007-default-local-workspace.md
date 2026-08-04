# ADR 0007: Default local Workspace

## Status

Accepted for v1. ADR 0011 preserves the safe visible default, explicit chooser,
validation, local-only bootstrap, and one-directory boundary. It supersedes the
initial-Section naming paragraph and the reference to former Plan 008 settings
work.

## Context

Every durable note belongs to a Workspace, but requiring a directory decision
before the first note makes capture appear broken and leaves the no-Workspace
screen as a dead end. The local-files promise does not require setup friction:
the default can remain an ordinary, visible directory that the user controls.

Automatic initialization must not claim or overwrite an existing unrelated
directory. It must also preserve the Workspace boundary, localization, recovery
behavior, and React-to-Rust dependency direction established by ADR 0001.

## Decision

When no Workspace is open, Charon attempts to open or create a default Workspace
inside the operating system's Documents directory:

1. use `Documents/Charon` when it is absent or already contains a valid
   `charon.workspace.json`;
2. if that path exists without a Workspace manifest, use
   `Documents/Charon Workspace` when it is absent or already a valid Workspace;
3. if neither path is safe, or Documents is unavailable, leave the runtime
   unopened and offer an explicit directory chooser.

An existing directory without a Workspace manifest is never modified by the
automatic path resolver. The explicit chooser opens a selected existing
Workspace or creates one in the selected directory only after that user action.
Workspace validation remains authoritative and stops before replacing the
current runtime on failure.

The initial section name is localized by the WebView and passed through typed
IPC; Rust does not hardcode user-facing copy. Charon stores no note content
outside the chosen Workspace and performs no network request during bootstrap.

ADR 0007 supersedes ADR 0001 only where that decision described the first
Workspace as necessarily user-selected. One directory is still exactly one
Workspace and remains the durable transaction, migration, conflict, and
recovery boundary. Remembering and switching the last explicitly chosen
Workspace remains part of Plan 008's native preference and settings work.

## Consequences

- A fresh launch reaches a usable Notes screen without setup.
- The default remains ordinary Markdown under a discoverable local directory.
- Existing unrelated directories are not colonized or overwritten.
- Documents-folder failures have an explicit local fallback rather than a
  disabled control.
- Plan 008 can focus onboarding on explanation, permissions, preferences, and
  safe Workspace switching instead of being required for the first note.

## Revisit when

Revisit if a supported platform has no stable user Documents directory, sandbox
policy requires a user-selected security-scoped bookmark, or user research
shows that first-run location choice is preferable to immediate local capture.
