# Plan 003: Make commits authoritative and Attachment I/O bounded

> Implement ADR 0012 exactly inside Workspace. Add regression tests before each
> production change; no entity repositories or generic streaming services.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- docs/adr/0012* apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/tests apps/desktop/src/bindings plans/README.md`

## Status

- **Priority/Risk/Effort**: P0 / HIGH / XL
- **Depends on**: Plan 002
- **Category**: durability, performance, privacy, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

One Note permits twenty 100 MiB Attachments. `storage.rs:302-322` reads a source
into one `Vec`; `workspace/mod.rs:483-528` accumulates sources; `recovery.rs:95-149`
loads/stages full before/after sets; `mod.rs:613-617` reads payloads for health.
A metadata edit therefore scales with total Attachment bytes. Post-commit
directory sync can also return failure after disk authority changed.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Recovery/storage | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace` | pass |
| Contract | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --test workspace_contract` | pass |
| Bindings | `bun run bindings:generate && bun run bindings:check` | current |
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Aggregate | `bun run check` | exit 0 |

Suggested skill: `thermo-nuclear-code-quality-review` after green tests.

## Scope and workflow

In: storage/recovery/error internals, streamed import, delta journal, metadata
health, typed committed-cleanup outcome, bindings/contextual result, tests. Out:
schema/limit changes, external references, upload/preview/execute, read protocol.

- Branch: `codex/premium-loop`
- Exact commit: `fix(workspace): bound attachment transactions`
- No push/PR.

## Steps

1. For every injected phase, assert live state, reopened state, records, active
   bytes, and exactly-once outcome for body/import/remove/Delete.
2. Replace full backups with a delta journal of affected paths only: previous
   bounded copy when rollback needs it and next staged file when finish needs it.
   Never open unchanged Attachments.
3. Stream a regular non-symlink external file outside Workspace through a fixed
   buffer to transaction staging; validate canonical containment, length and
   identity/modified metadata before/after; stop over limit or on replacement,
   growth, short copy. Sync before commit and persist no source path.
4. Make health validation metadata/regular-file/containment-only without reading
   valid payloads.
5. Once manifest is durable, apply live state and emit one event even if cleanup
   warns. Retry cleanup, never the already committed mutation.
6. Test zero/exact/limit+1/sparse, short/change, symlink/directory/special/inside,
   duplicate/multi partial failure, all crash phases, deletion residue, v1
   migration, and content/source-path privacy sentinels.

## Done criteria

- [ ] Import/health use bounded streaming/metadata I/O.
- [ ] Unchanged managed files are never read/staged/rewritten.
- [ ] Peak buffer is independent of total selected/existing Attachment bytes.
- [ ] Live/reopened state agree after every phase; cleanup Retry cannot duplicate.
- [ ] Deletion/migration/privacy remain exact; all gates pass.
- [ ] Plan/index `DONE` in exact commit.

## STOP conditions

- External source path must outlive command scope or bytes cross React/IPC.
- Unchanged bytes must be copied, or a crash can acknowledge then roll back.
- Successful Delete leaves normal completed backup bytes.
- Schema/limits need change without another ADR.

## Maintenance

Keep I/O-count tests for every new Workspace command; O(total Attachment bytes)
metadata work is release-blocking.
