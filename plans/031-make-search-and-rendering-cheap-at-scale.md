# Plan 031: Make search and list rendering cheap at 20k Notes, and make the perf gate measure the real code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`. Use the `vercel-react-best-practices` skill if available
> for the memoization steps.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src/features/notes/search.ts apps/desktop/src/features/notes/search.test.ts apps/desktop/src/features/notes/note-screen.tsx apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-list.tsx apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/app/workspace-context.tsx apps/desktop/src/app/providers.tsx scripts/check-performance.ts docs/TESTING.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a search cache must invalidate correctly — stale search is worse than slow search)
- **Depends on**: none (do it before or after Plan 030 Step 1; re-run the gate after both)
- **Category**: perf / tests
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Measured on this machine with a 20k fixture: `filterNotes` median ≈25 ms per
call, and it runs not only per keystroke but on **every snapshot** — every
autosave (650 ms debounce), status toggle, tag edit, and external event —
because `snapshot.notes` is a fresh JSON array each time. Each call
re-normalizes (`NFKC` + lowercasing + regex) every Note's body, tags, and file
names. The `allTags` map is rebuilt in a second pass. Context provider values
are fresh object literals on every render (`WorkspaceContext`,
`PreferencesContext`) and `setTheme`/`setLocale` are recreated, so `memo(NoteRow)`
and `useMessages()` consumers cannot bail out. The editor's dirty effect
depends on the whole `draft` object and calls `setWorkspaceSwitchBlocked` on
every keystroke. Each row splits the full body twice per render.

Meanwhile `scripts/check-performance.ts` benchmarks a hand-written filter
(no `normalize`, no regex, single token) that measures ≈18 ms for the same
data — a divergent copy of production search, so a regression in `search.ts`
cannot move the gate. `docs/TESTING.md:52-55` presents that number as the
20k budget.

## Current state

- `apps/desktop/src/features/notes/search.ts` — `normalizeSearchText`,
  `filterNotes` (joins body/tags/fileNames per note per call; `tokens.every`).
- `apps/desktop/src/features/notes/note-screen.tsx:74-77` —
  `notes = useMemo(() => filterNotes(snapshot.notes, { query, tag }), [query, snapshot.notes, tag])`;
  `:78-` `allTags` map built from `snapshot.notes`; `:258` search
  `onChange={(e) => setQuery(e.target.value)}` (no deferral).
- `apps/desktop/src/features/notes/note-row.tsx:23` `memo(NoteRow)`; `:60`
  `useMessages()`; `:61-62` `noteFirstLine(note.body)` and a second
  `note.body.split(...)` per render.
- `apps/desktop/src/features/notes/note-list.tsx:65` `notes.findIndex(...)`
  per arrow key (Plan 029 Step 11 removes it — coordinate).
- `apps/desktop/src/app/workspace-context.tsx:276` provider `value={{ ... }}`
  literal; `apps/desktop/src/app/providers.tsx:41-48,51` `setTheme`/`setLocale`
  and `PreferencesContext.Provider value={{ theme, locale, setTheme, setLocale }}`.
- `apps/desktop/src/features/notes/note-editor.tsx:83-86` dirty effect deps
  `[draft, onDirtyChange]` (Plan 026 Step 2 changes this to a boolean —
  coordinate; if 026 landed, skip that part).
- `scripts/check-performance.ts:14-31` (full file in recon) — synthetic 20k
  notes, inline filter, 9 samples, threshold 50 ms; gzip budget 230 KiB
  (current ≈184 KiB).
- `docs/TESTING.md:52-55` performance paragraph (Plan 028 Step 7 rewords it;
  update the number here once measured).

Conventions: `useMemo`/`useCallback` with exact deps; no new dependencies;
Vitest tests next to the module; Bun scripts throw on failure and print a
JSON summary.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test:desktop` | pass |
| Perf gate | `bun run build && bun run test:perf` | JSON with `search20kMedianMs` |
| E2E | `bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**:
- `apps/desktop/src/features/notes/search.ts`, `search.test.ts`, `note-screen.tsx`, `note-row.tsx`, `note-editor.tsx` (dirty effect only if Plan 026 has not), `note-list.tsx` (index lookup only if Plan 029 has not)
- `apps/desktop/src/app/workspace-context.tsx`, `providers.tsx`
- `scripts/check-performance.ts`, `docs/TESTING.md` (numbers)
- `apps/desktop/src/test/*` fixtures if a 20k fixture helper is needed

**Out of scope**:
- Rust snapshot shape (a body-less list projection is Plan 032's follow-up).
- Code splitting / `domMax` (Plan 030 Step 7 records the bundle decision).
- Search semantics (Plan 030 Step 1) — but design the cache so its fold fits.

## Git workflow

- Branch: `codex/031-search-render-performance`
- Commit message: `perf(desktop): cache search haystacks, memoize contexts, and benchmark real search`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the gate measure the real function

`scripts/check-performance.ts`: import `filterNotes` from
`apps/desktop/src/features/notes/search.ts` (Bun resolves TS directly; adjust
the relative path/`tsconfig` paths as needed — the script runs from the repo
root), build 20k `NoteDto`-shaped objects with realistic bodies (≥200 chars,
mixed case, accents), run a multi-token query (e.g. `"brief handoff"`), keep 9
samples/median. Record the new median in the log output. Do **not** raise the
50 ms threshold yet; if the real median exceeds it, continue with Step 2 and
re-run.

**Verify**: `bun run build && bun run test:perf` → prints the median (may fail the threshold until Step 2 — note the value).

### Step 2: Incremental search index

In `search.ts`, add `createSearchIndex()` returning `{ filter(notes, filter), }`
that keeps a `Map<noteId, { updatedAt: string; haystack: string }>`; on each
call, for every note reuse the entry when `updatedAt` (and `attachments.length`
/tags length as a cheap guard) is unchanged, else re-normalize; drop entries
for ids no longer present. Expose `filterNotes` as a thin wrapper over a
module-level index for tests, and have `NoteScreen` hold one index instance
(`useRef(createSearchIndex())`). Build `allTags` inside the same pass (return
it from `filter` or a sibling method) so `snapshot.notes` is iterated once.
Keep the pure `normalizeSearchText` export (Plan 030 Step 1 extends it).

Add tests: cache hit does not re-normalize (spy), a body change invalidates
only that note, a removed note disappears from results, results identical to
the previous implementation for the existing test corpus.

**Verify**: `bun run test:desktop -- search` → pass; `bun run test:perf` → median well under 50 ms (expect single-digit ms warm; record it).

### Step 3: Stable context values and callbacks

- `workspace-context.tsx`: wrap the provider `value` in `useMemo` with exact
  deps; if the value mixes volatile snapshot state and stable actions, split
  into two contexts (`WorkspaceStateContext`, `WorkspaceActionsContext`) and
  keep `useWorkspace()` returning both for compatibility.
- `providers.tsx`: `useCallback` for `setTheme`/`setLocale`; `useMemo` for the
  `PreferencesContext` value.
- `note-editor.tsx:83-86`: depend on a boolean `dirty` (skip if Plan 026 did it).
- `note-row.tsx:61-62`: derive title/snippet with one `useMemo` keyed on
  `note.body` that scans for the first three non-empty lines without splitting
  the whole body.

Add a render-count test for `NoteRow` (React Testing Library + a counter) that
proves a snapshot change touching a different note does not re-render an
unchanged row when its `note` object identity is preserved (see Step 4).

**Verify**: `bun run test:desktop` → pass.

### Step 4: Preserve Note object identity across snapshots (small, high leverage)

In `workspace-context.tsx` `applySnapshot` (or a helper), reuse the previous
`NoteDto` object for each id whose `updatedAt`, `status`, tag/attachment
counts, and body length are unchanged (shallow-compare via a small
`sameNote(a, b)` — compare `updatedAt` plus `status`, `tags` array equality,
`attachments` ids). This lets `memo(NoteRow)` bail out for untouched rows and
lets the Step 2 index skip work by identity. Guard with a test that a changed
note gets the new object and an unchanged one keeps the old reference.

**Verify**: `bun run test:desktop -- workspace-context note-row` → pass.

### Step 5: Defer the filter off the keystroke (measure first)

Only if typing at 20k notes still drops frames after Steps 2-4: feed
`useDeferredValue(query)` into the filter memo while keeping the input value
urgent. Re-measure with the perf gate and in the browser fixture (Performance
panel). Skip if unnecessary and record why.

**Verify**: `bun run test:perf` and manual typing check.

### Step 6: Update the documented budget

`docs/TESTING.md`: state the gate now benchmarks `filterNotes` itself with a
multi-token query and record the measured median from Step 2 (keep the 50 ms
ceiling). Coordinate with Plan 028 Step 7's rewording.

**Verify**: `grep -n "filterNotes" docs/TESTING.md` → 1 match.

## Test plan

- `search.test.ts`: cache behaviour (3 tests) + equivalence.
- `workspace-context.test.tsx`: identity preservation.
- `note-row.test.tsx` (create if missing): render-count bailout.
- Perf gate before/after numbers recorded in the status row.

## Done criteria

- [ ] `scripts/check-performance.ts` imports and measures the real `filterNotes` with a multi-token query
- [ ] Search uses an incremental index; a one-note change re-normalizes one note (test)
- [ ] Provider values and setters are memoized; `NoteRow` bails out for unchanged notes (test)
- [ ] Unchanged `NoteDto` objects keep identity across snapshots (test)
- [ ] `bun run test:perf` median recorded and < 50 ms; gzip < 230 KiB
- [ ] `bun run typecheck && bun run test:desktop` and Chromium e2e pass
- [ ] `plans/README.md` status row for 031 updated

## STOP conditions

- The cache can return stale results in any test you can construct (e.g. a
  note whose `updatedAt` does not change when tags change) — stop and report
  the exact case; do not ship a heuristic that can go stale.
- Splitting the workspace context breaks `useWorkspace()` consumers in tests
  in a way that needs a broad refactor — keep one context with a memoized
  value and report.

## Maintenance notes

- If Rust ever ships a body-less list projection (Plan 032 follow-up), the
  index should key on that projection and fetch bodies lazily.
- Keep the perf script importing production code; never re-implement the
  filter inline again.
