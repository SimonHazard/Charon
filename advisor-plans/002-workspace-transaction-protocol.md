# Plan 002: Accept the bounded Workspace transaction protocol

> This is the ADR/test-seam gate. Do not change the on-disk algorithm before ADR
> acceptance. Keep real-filesystem and in-memory Workspace as the only seams.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- docs/adr docs/ARCHITECTURE.md docs/PRIVACY.md apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/tests plans/README.md`

## Status

- **Priority/Risk/Effort**: P0 / HIGH / M
- **Depends on**: none
- **Category**: architecture, durability, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`workspace/recovery.rs:95-128` loads/stages every previous and next Attachment.
Lines 153-178 commit the manifest, remove the transaction, then may return a
generic backup-directory sync error. `workspace/mod.rs:140-152` updates memory
only on success or deletion cleanup error, so disk and live state can diverge.
Changing this recovery/persistence contract requires a new accepted ADR.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Recovery | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace::recovery` | pass |
| Contract | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --test workspace_contract` | pass |
| Quality | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |

Suggested skill: `thermo-nuclear-code-quality-review` after the state machine
and test seams exist.

## Scope and workflow

In: ADR 0012, reconciled architecture/privacy/deletion wording, named commit
phases, counting/failing storage seam, passing characterization tests. Out:
active algorithm changes, databases, schema changes, deletion weakening, UI.

- Branch: `codex/premium-loop`
- Exact commit: `docs(adr): accept bounded workspace transactions`
- No push/PR.

## Steps

1. Accept ADR 0012 defining one manifest rename/sync commit boundary;
   `NotCommitted`, `Committed`, `CommittedCleanupPending`; delta staging;
   streamed bounded acquisition; deterministic startup convergence; unchanged
   deletion/v1 migration/privacy; and rejection of full Workspace rollback copies.
2. State a crash truth table for ordinary update, import, Attachment delete,
   Note delete, and migration interaction. Every phase has one recovery and one
   user-visible outcome.
3. Extend the existing failing storage with typed hooks before staging, after
   staged sync, files apply, manifest rename/sync, cleanup removal, and final
   directory sync, plus byte/read/write/chunk counters.
4. Add passing tests proving fixture validity, injection, reopened authority,
   record/active-byte inspection, and counters without blessing current
   amplification as a requirement.

## Done criteria

- [ ] ADR 0012 accepted and consistent with every contract.
- [ ] Commit boundary/outcomes and full recovery truth table are unambiguous.
- [ ] Tests inject every phase and count I/O; no production behavior changes.
- [ ] Targeted/contract/fmt/Clippy pass; plan/index `DONE` in exact commit.

## STOP conditions

- Protocol weakens permanent deletion or byte-exact migration.
- Recovery needs an external source path after command scope.
- It requires a third persistence seam/generic repository.
- Commit cannot be one durable manifest transition.

## Maintenance

Every future Workspace mutation enters this truth table; new journal states need
ADR and crash tests first.
