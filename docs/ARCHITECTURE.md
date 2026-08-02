# Charon architecture contract

## Authority and boundaries

Rust is the authority for domain rules and filesystem state. React never reads
or writes note files, the manifest, backups, or temporary files directly. It
dispatches named application commands over IPC and renders versioned snapshots
and events returned by Rust.

The core consists of three deep modules:

- `Workspace` owns persistence and every durable domain mutation.
- `CaptureCoordinator` owns platform shortcut activation, capture permissions,
  gesture classification, selected-text acquisition, and capability fallback.
- `ClipboardComposer` owns deterministic CopyPreset formatting and explicit
  clipboard writes.

These modules collaborate through narrow domain inputs. Capture does not write
files, clipboard formatting does not activate shortcuts, and React does not
reimplement either module's rules.

## Component map

```mermaid
flowchart LR
  UI["React UI\nephemeral view state"] --> CMD["Versioned application commands"]
  CMD --> WS["Workspace"]
  CMD --> CC["CaptureCoordinator"]
  CMD --> CB["ClipboardComposer"]
  WS --> FSA["Filesystem adapter"]
  CC --> OSA["Platform capture adapters"]
  CB --> CLA["Clipboard adapter"]
  WS --> EVT["Snapshots and domain events"]
  CC --> EVT
  CB --> EVT
  EVT --> UI
  FSA --> DISK["Local Workspace directory"]
```

## Workspace layout and durability

One local directory is one Workspace. First-run bootstrap resolves a safe
default under Documents in the application layer, then delegates all creation
or opening to the same Workspace boundary:

```text
<workspace>/
  charon.workspace.json
  notes/
    <uuid>.md
  backups/
```

`charon.workspace.json` stores the schema version and durable metadata needed to
validate and order sections and notes. Each note body lives in
`notes/<uuid>.md`. `backups/` stores recoverable snapshots and migration safety
copies; it is not a second source of truth.

Every replacement write uses a uniquely named temporary file in the same
directory as its destination, flushes it as required by the platform, and then
performs an atomic rename. A multi-file command is represented as one Workspace
transaction with enough recovery information to finish or roll back after an
interruption. Charon preserves the last valid state and reports conflicts rather
than silently selecting a winner.

Schema v1 limits a UTF-8 note body to 10 MiB, the manifest to 64 MiB, a Workspace
to 100,000 active notes and 10,000 sections, and IPC-visible integer values to
JavaScript's safe integer range. Transaction records and complete previous/next
state copies live under `backups/<transaction-id>/`; note files are replaced
first and the manifest is atomically replaced last. Opening a Workspace resolves
an incomplete record to the complete previous or next revision, and requires an
explicit recovery choice if the current manifest matches neither.

Filesystem notifications are hints rather than authority. The watcher
coalesces bursts, ignores transaction-internal paths, and asks `Workspace` to
re-read and validate changed content. Identical self-writes do not advance the
revision. Invalid or deleted known files leave the last valid snapshot in place
and create a health issue; unknown Markdown files are import candidates.

## Deep modules

### Workspace

`Workspace` absorbs manifest and Markdown parsing, validation, deterministic
ordering, schema migration, domain-command application, backups, filesystem
watching, external-change reconciliation, conflict detection, transactional
recovery, and snapshot production. These responsibilities belong together
because they protect the same invariants: stable identity, valid references,
recoverability, and no lost content.

The two justified seams are a real-filesystem adapter for production and
integration tests, and an in-memory Workspace adapter for fast domain and
failure-path tests. They implement the same observable command contract. No
entity-per-repository layer sits between commands and Workspace.

### CaptureCoordinator

`CaptureCoordinator` translates a platform capability into a typed capture
action. It owns global accelerator registration, modifier-sequence adapters,
permission state, selected-text acquisition, duplicate suppression, listener
lifecycle, and fallback selection. Its macOS adapter owns both the public
Accessibility acquisition path and ADR 0010's bounded capture-specific Copy
transaction. Its output is either a normal note-creation action or a request to
reveal the main empty editor, never direct file access.

The application layer maps a note-creation action to exactly one versioned
Workspace command using the active ephemeral section, with deterministic first-
section fallback. It maps an editor action to a main-window event. This keeps
CaptureCoordinator independent from Workspace persistence and React view state.

The macOS modifier adapter is a public, listen-only Core Graphics event tap.
It forwards normalized events into the pure double-Shift state machine and
never suppresses or rewrites an operating-system event. Accessibility selected
text is queried only while authorization is active. Per ADR 0009, the macOS
adapter uses a bounded, cycle-safe focused-element ancestor chain followed by
one topmost Accessibility element explicitly targeted by the pointer and its
bounded parent chain, then tries direct selected text, standard ranges, and
public web text-marker ranges. It does not enumerate applications or windows,
scan background accessibility trees, recurse through every descendant, or call
private APIs. If this ladder returns no text, the coordinator may run ADR 0010's
single-flight pasteboard snapshot, one synthetic Command-C, bounded wait/read,
and change-count-guarded restoration. That adapter never posts Paste or another
key, monitors clipboard history, persists a snapshot, overwrites a concurrent
clipboard change, or runs without an explicit gesture. An unmodified gesture
never shows or focuses Charon; its Command-modified sibling does not request
selected text and reveals only the main window. Linux and Windows expose the
same capability model but return `unsupported` for enhancements until their
documented smoke gates pass.

Input Monitoring preflight/request gates creation of the macOS event tap;
Accessibility preflight/request independently gates selected-text acquisition
and the fallback Copy event. Tauri's global-shortcut plugin continues to own
only the portable accelerator, because its shortcut model requires a non-
modifier key.

### ClipboardComposer

`ClipboardComposer` accepts an ordered set of immutable note values plus a
CopyPreset, produces deterministic Markdown, and performs an explicit clipboard
write through an adapter. Formatting is testable without a system clipboard.
It never changes note status, selection, or Workspace files and does not own the
separate transient pasteboard transaction used by `CaptureCoordinator`.

## IPC contract

IPC exposes versioned command and event DTOs generated for TypeScript by
`ts-rs`. Persisted JSON and Markdown shapes are implementation details and are
not the frontend API. Breaking DTO changes require an explicit version strategy
and coordinated Rust and TypeScript tests.

React receives a complete Workspace snapshot at open, followed by ordered
domain events or replacement snapshots. It owns only ephemeral view state:
selection, focus, open panels, the command palette, filters, and draft text.
Durable state becomes real only after a successful Rust command response.

## Dependency rule

The dependency rule is:

```text
UI -> application commands -> domain modules -> adapters
```

Dependencies never point in the reverse direction. Domain modules do not import
React, Tauri UI code, platform adapter implementations, or persisted frontend
state. Adapters implement ports owned by the domain boundary. Avoid
wrapper-per-command, entity-per-repository, and generic service layers that move
invariants out of the deep modules.

## Monorepo boundary

The repository is a Bun workspace with this permitted shared dependency:

```text
apps/desktop -> packages/theme
apps/site    -> packages/theme
```

Neither app may import from the other. Root scripts orchestrate workspaces, but
each app package owns its runtime dependencies and configuration.
`packages/theme` is framework-neutral and exports only semantic CSS variables,
theme names, and motion and radius contracts. It has no React, Astro, Motion,
Base UI, Tauri, native, localization, or charts dependency. Desktop Motion
runtime and React animation helpers stay in `apps/desktop`.

## Change control

Create an ADR before changing persistence, privacy, shortcut support, the
experimental charts boundary, application-to-site sharing, or the dependency
rule. New adapters must correspond to a real platform boundary or a distinct
test seam, not a preference for smaller files.
