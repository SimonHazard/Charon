# Execution journal

One file per executed plan, written by the session that executed it. This
directory is the only memory shared between sessions: each run starts with a
fresh context and reads every entry here before touching code.

- `<id>.md` — written by the session. Prose, in French. Format and rules:
  [`scripts/plan-executor-rules.md`](../../scripts/plan-executor-rules.md).
- `<id>.run.json` — written by the runner. Status, cost, duration, commit.
- `logs/<id>.jsonl` — raw session stream, ignored by git. Read it when a session
  ends without an entry.
- `report.html` — generated from every `<id>.md`. Never edit it by hand.

Entries stay as historical evidence, like the plans themselves.

## Commands

Run the queue (one `claude -p` session per plan, in order):

```sh
bun scripts/run-plans.ts --dry-run
bun scripts/run-plans.ts --from 021
```

Rebuild the report from existing entries, without running anything:

```sh
bun scripts/execution-report.ts
```
