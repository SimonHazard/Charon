# Plan 005: Serialize drafts, commands, events, and Workspace switches

> Treat visible text as durable intent. Preserve drafts across presentation and
> failures. Coordinate at application commands; no arbitrary timers or global
> input lock.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- apps/desktop/src/app apps/desktop/src/features/notes apps/desktop/src/features/preferences apps/desktop/src/lib/ipc apps/desktop/src/bindings apps/desktop/messages plans/README.md`

## Status

- **Priority/Risk/Effort**: P1 / HIGH / L
- **Depends on**: Plan 004
- **Category**: correctness, data loss, concurrency, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`note-editor.tsx:68-71` reports clean on unmount while autosave waits 650 ms.
Status/filter/expand can unmount the editor. `workspace-context.tsx:93-145`
queues only execute; choose/default at 148-194 bypass it and apply snapshots
without generation tokens. Late old results can overwrite a new Workspace.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Context | `bun run test:desktop -- workspace-context command-coordinator` | pass |
| Draft | `bun run test:desktop -- draft-controller note-editor note-screen` | pass |
| E2E | `bun run test:e2e -- --grep "draft|workspace switch|stale event"` | pass |
| Quality | `bun run --cwd apps/desktop typecheck && bun run check` | exit 0 |

Suggested skills: `vercel-react-best-practices` and `apple-design`.

## Scope and workflow

In: command coordinator, Workspace generation/revision guards, Note-ID draft
registry above virtual rows, close/switch policy, event/result dedupe, localized
contextual errors and tests. Out: persisted drafts, sync, global UI locks,
navigation, generic state framework, persistence changes.

- Branch: `codex/premium-loop`
- Exact commit: `fix(desktop): preserve drafts across workspace races`
- No push/PR.

## Steps

1. Write a paused-Promise race matrix: autosave × close/filter/status/virtual
   unmount/other Note/Tag/Attachment/watcher/chooser/default/client/window close.
   Define order, cancel, preserved input, focus, error—no real-time sleeps.
2. Lift ephemeral draft ownership above rows: ID, acknowledged base revision/body,
   current input, save state, content-free error. Unmount never clears it and it
   is never persisted.
3. One coordinator sequences body/Tag/Attachment/status/Delete/Workspace switch.
   Attach `{workspaceGeneration, revision}` to every result/event, dedupe one
   committed delta, ignore old generations, reset gaps.
4. Presentation changes first save; failure keeps draft/editor and Retry/Cancel.
   Explicit confirmed discard only where required. Animations never own effects.
5. Queue chooser, candidate validation/swap, preference refresh, and first reset
   as one exclusive operation. Cancel/failure keeps old generation/watcher/pages/
   draft/focus; success retires old events before new state applies.

## Done criteria

- [ ] Draft survives unmount until acknowledged save or confirmed discard.
- [ ] All mutations/switches have one coordinator and generation+revision checks.
- [ ] Result/event duplicate is idempotent; old Workspace cannot replace new.
- [ ] Failed save/switch preserves input and remains actionable.
- [ ] Targeted/E2E/type/aggregate pass; plan/index `DONE` in exact commit.

## STOP conditions

- Requires draft persistence outside contract.
- Workspace can switch before dirty resolution.
- Result/event applies without generation+revision validation.
- Animation/timer owns durable effect or unrelated input is globally disabled.

## Maintenance

Every new command declares coordinator order, optimistic state, failure
preservation, and switch interaction.
