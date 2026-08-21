# Execution journal

One file per executed plan, written by the session that executed it. This
directory is the only memory shared between sessions: each run starts with a
fresh context and reads every entry here before touching code.

- `<id>.md` — written by an executed session. Prose, in French.
- `<id>.run.json` — optional execution metadata: status, cost, duration, commit.
- `logs/<id>.jsonl` — raw session stream, ignored by git. Read it when a session
  ends without an entry.
- `report.html` — generated from every `<id>.md`. Never edit it by hand.

Entries stay as historical evidence, like the plans themselves.

## Command

Rebuild the report from existing entries:

```sh
bun scripts/execution-report.ts
```
