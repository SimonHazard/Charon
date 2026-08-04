# ADR 0001: Local Markdown Workspace

## Status

Accepted for v1. ADR 0011 supersedes only the v1 manifest/Section/Trash shape
in the first Decision paragraph and the corresponding structure assumption in
the first Consequences bullet. Rust authority, the Workspace boundary, atomic
writes, recovery, typed IPC, dependency direction, and adapter seams remain.

## Context

Charon promises that durable user content remains understandable, portable, and
local. The domain must also guarantee stable identities, ordering, transactional
merge and trash behavior, migration, external-edit reconciliation, and recovery
from interrupted writes. Letting React manipulate files or distributing these
invariants across repositories would make data safety difficult to reason about
and test.

## Decision

Rust is the sole domain and filesystem authority. A `Workspace` is one local
directory containing `charon.workspace.json`, `notes/<uuid>.md`, and `backups/`.
Replacement writes use a same-directory temporary file followed by atomic
rename. Multi-file commands carry recovery metadata and never expose a partial
success as a valid snapshot.

`Workspace` is one deep module for parsing, validation, ordering, migrations,
command application, backups, watching, conflict detection, and recovery. Its
only persistence seams are a production real-filesystem adapter and a behaviorally
equivalent in-memory adapter.

React sends versioned commands and consumes snapshots and domain events. DTOs
are generated with `ts-rs`; persisted JSON and Markdown are not an IPC API. The
dependency rule remains UI to application commands to domain modules to
adapters, never the reverse.

## Consequences

- Users can inspect and back up ordinary Markdown while the manifest preserves
  stable structure.
- Domain and failure behavior can be tested through both real-filesystem and
  in-memory adapters.
- Rust carries more cohesive responsibility, but protects invariants in one
  place.
- External edits require explicit reconciliation and conflict UX.
- SQLite, direct React filesystem access, entity repositories, and generic
  service wrappers are rejected for v1.

ADR 0007 supersedes only the first-run location decision: Charon may create a
safe default under Documents while keeping this directory boundary unchanged.
ADR 0011 later replaces the active model with flat schema v2 Notes and managed
Attachments while preserving that same directory, authority, and durability
boundary.

## Revisit when

Revisit if measured scale makes the manifest unworkable, operating-system
semantics prevent reliable atomic rename on a supported filesystem, or user
research changes the transparent-local-files promise. Any replacement must
preserve export, migration, rollback, and conflict guarantees before adoption.
