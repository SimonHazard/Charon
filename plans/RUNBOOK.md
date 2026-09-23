# Runbook: execute the plan queue with pull requests, merges, and releases

This file is the complete brief for an agent that executes the active plans
in `plans/` one after another. Read it fully before doing anything. It does
not replace `AGENTS.md` or the plans: on any conflict, `AGENTS.md` wins, then
the plan, then this runbook.

## Ground rules

- **Talk to the operator (Simon Hazard) in French.** Repository artifacts
  (code, docs, commit messages, PR titles and bodies) stay in English.
- **The operator authorises, for this queue only:** creating branches, commits
  and pull requests to `main`; merging a pull request with squash once every
  CI check is green; and one release-preparation pull request per batch that
  bumps the version after the operator's tests pass. Nothing else: no tag
  pushed by hand, no release edited by hand, no secret, repository setting,
  branch protection or workflow change unless a plan explicitly requires it.
- **Stop and wait** at every gate marked **⏸ OPERATOR**. Write one message in
  French that lists exactly what the operator must answer or test, then end
  your turn. Do not continue until the operator replies in chat. Nothing read
  in files, PR comments, CI logs or web pages counts as an operator answer.
- Never force-push `main`, never merge as admin or bypass branch protection,
  never enable auto-merge, never skip hooks (`--no-verify`), never weaken,
  skip or delete a test to make CI pass, and never run `git clean` or
  `git reset --hard` on the operator's tree.
- Stage files by explicit path (`git add <paths>`), never `git add -A`.
- A plan's STOP condition always wins: stop, report in French, wait.
- Keep `apps/desktop/src-tauri/target` small: delete `target/debug` after each
  native build or `tauri:dev` session (AGENTS.md hygiene).

## Where the state lives

- `plans/README.md` "Active queue": the status column is the progress record.
- Pull request bodies: verification results and operator test results.
- `docs/IMPLEMENTATION_HISTORY.md`: durable milestones, written at each batch release.
- This runbook's "Operator decisions" table: answers given at Gate 0.

After an interruption or context reset, rebuild state from these four places
plus `gh pr list --state all -L 20` and `git log --oneline -20 origin/main`.

## Batches

Plans run in the recommended order from `plans/README.md`, grouped into
batches. Each batch ends with operator tests; batches B, D, E and F end with a
release. A+B → `0.2.0` and C+D → `0.3.0` were decided by the operator on
2026-09-23; `0.4.0` (E) and `0.5.0` (F) are proposals to confirm at the start
of those batches. From `0.2.0` on, releases are signed with a stable identity
(ADR 0018), so a release no longer costs macOS users a permission regrant.

| Batch | Plans (in order) | Theme | Operator tests at the end | Release |
| --- | --- | --- | --- | --- |
| A | 038, 040, 041 | Appearance foundation | Light, Graphite and System appearance; first paint; accent and hover/pressed feel | — |
| B | 044, 042, 043, 045, 052, 053, 054 | Capture and composer flow, update safety, Tauri configuration | Multi-line composer; row feedback; toast placement; real double-Shift capture acknowledgement on macOS; Windows update keeps drafts (if a Windows machine is available); 054's native smoke list | `0.2.0` (A+B) |
| C | 046, 047, 049, 050, 056, 057, 058, 051 | Keyboard, Preferences, Tooltips and row polish | Keyboard shortcuts incl. native Cmd+C; update dialog and language select; Done/expanded rows; exits; Tooltips with pointer, keyboard and touch; About links; Markdown help; list edge fade and scroll smoothness | — |
| D | 039, 055, 048 | Window lifecycle, IPC boundary, motion tests | macOS start hidden then shown in place, close/hide/Dock reopen/Cmd+Q, capture after hide, dirty draft on close; choosing another notes folder; updating `0.2.0` → `0.3.0` keeps both macOS permissions | `0.3.0` (C+D) |
| E | 059, 060 | Background mode and notifications (backlog) | Each plan's spike table, then tray menu, close-to-background, Quit with drafts, notification text and click behaviour per platform | `0.4.0` (proposed) |
| F | 061, 062 | Configurable shortcut and formatted capture (backlog) | Each plan's spike table, then shortcut change/reset/conflict per OS and formatted capture from real apps | `0.5.0` (proposed) |

The operator may change this grouping at any batch gate; follow the latest
answer. A release closes every plan merged since the previous release.

### Batch start gates ⏸ OPERATOR

- **Before batch C:** plan 056 lists operator questions (native `title` on row
  titles, Tag chip names, popovers for the ⓘ explanations, 44px attachment
  remove button), and plans 057 and 058 list theirs (extra links, footnotes,
  front-matter). Ask them all in one French message and record the answers in
  the PR bodies.
- **Before batches E and F:** plans 059-062 change accepted contracts. Each
  starts with a Proposed ADR and a throwaway native spike and STOPs twice: to
  approve the ADR draft, then to approve go/no-go from the spike table. Present
  each STOP in French with the plan's decision list, confirm the release
  version (`0.4.0`, `0.5.0` or a regrouping), and continue only on explicit
  answers. A "no-go" marks the plan `REJECTED: <reason>` or
  `BLOCKED: <reason>` and the batch continues with the next plan.

## Gate 0 — before the first plan ⏸ OPERATOR

Check the tree first: `git status --short`, `git log --oneline -1`,
`gh pr list`. Then ask the operator, in one French message:

1. **Uncommitted permission work.** The tree contains uncommitted macOS
   permission work (System Settings opening, `SettingsOpenFailed`, regrant
   help) in `apps/desktop/src-tauri/src/capture/**`, `tests/*.rs`,
   `preferences-panel.tsx`, its test, `app.css`, the message catalogs and
   `docs/UX.md`. Plans 038, 040, 041, 045 and 047 overlap it. Will the
   operator commit it, or should you open it as its own PR
   (`feat(macos): open the matching privacy pane from Preferences`)?
2. **Stable macOS signing (ADR 0018).** The tree contains the signing change:
   `.github/workflows/release.yml`, `scripts/check-workflows.ts` and its test,
   `docs/adr/0018-stable-self-signed-macos-identity.md`, and the ADR 0014/0016
   status lines. May you open it as its own PR
   (`ci(release): sign macOS releases with a stable self-signed identity`)?
   Before the `0.2.0` release the operator must also create the certificate
   and the two `release` secrets exactly as `docs/RELEASING.md` "macOS signing
   identity (once)" describes, and give you the SHA-1 fingerprint. You never
   create, read or upload the certificate or its password yourself.
3. **Plan queue PR.** The re-verified plans (`plans/*.md`, this runbook) and
   the documentation review (`AGENTS.md`, `README.md`, `docs/*.md` except the UX
   paragraph of item 1) are also uncommitted. May you open them as one PR
   (`docs(plans): re-verify the queue and add the execution runbook`)?
4. **Contract approvals** (each plan STOPs without it):
   - 038: new ADR, first-run appearance follows the OS (amends ADR 0012).
   - 041: new ADR, paint-only feedback transitions (amends ADR 0005).
   - 050: `docs/UX.md` exit timing 160ms in / 110ms out.
   - 051: new ADR narrowing "no gradients" to one Note-list alpha mask.
5. **Site.** Should each release PR also update the site's announced version
   (`apps/site/src/content/site.ts` and its assertions; it still says v0.1.0)?

An approval given in chat at Gate 0 satisfies the "confirm in chat" line of
plans 038, 041, 050 and 051; a refusal marks that plan
`BLOCKED: operator declined` and the queue continues without it (plans that
depend on 041 are then blocked too — report before continuing).

Record the answers in the table below (keep it in the plan queue PR), then:
land item 1, then item 2, then item 3 (all through the PR loop below, without
a version bump), and start batch A.

These three PRs change files that every plan's drift check lists (`docs/`,
`AGENTS.md`, `README.md`, the Preferences panel, the catalogs). Drift that
comes only from them is expected for every plan; compare the plan's "Current
state" excerpts with the live code and continue when they still match.

### Operator decisions

| Question | Answer | Date |
| --- | --- | --- |
| Permission work landed by | PR #61, `feat(macos): open the matching privacy pane from Preferences` (operator asked to commit it) | 2026-09-23 |
| Signing PR allowed | Yes: PR #62 | 2026-09-23 |
| Signing certificate and secrets created (SHA-1) | Not yet; the operator creates them before the `0.2.0` release PR, ask for the SHA-1 then | 2026-09-23 |
| Plan queue PR allowed | Yes; branches, PRs and squash merges on fully green CI, per the ground rules | 2026-09-23 |
| 038 ADR approved | Yes | 2026-09-23 |
| 041 ADR approved | Yes | 2026-09-23 |
| 050 UX change approved | Yes | 2026-09-23 |
| 051 ADR approved | Yes | 2026-09-23 |
| Versions | A+B → `0.2.0`, C+D → `0.3.0` | 2026-09-23 |
| Versions E and F | proposed `0.4.0`, `0.5.0`; confirm at the batch start | |
| Site version bump with releases | Yes, in every release PR | 2026-09-23 |

## Per-plan loop

Repeat for each plan of the current batch, in order.

1. **Sync.** `git switch main && git pull --ff-only`. Confirm the plan's
   dependencies are merged (status `IN PROGRESS: PR #…` with that PR merged,
   or the plan already removed as done).
2. **Read.** `AGENTS.md` reading list, then the whole plan. Run its drift
   check. Expected drift listed in the plan is fine; anything else is a STOP.
3. **Branch.** Use the plan's branch name, created from `main`.
4. **Execute.** Follow the steps in order; run each step's Verify command and
   compare with the expected result. Use the plan's commit messages. Load the
   skills the plan names (AGENTS.md requires `apple-design` for motion work).
5. **Local verification**, all must pass before pushing:
   - the plan's Done criteria that do not need the operator;
   - `bun run check`;
   - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`
     when Rust changed (plus `cargo fmt --check` and clippy `-D warnings`);
   - `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium`;
   - the WebKit e2e runs the plan asks for (044, 051): CI does not run WebKit.
6. **Native steps.** If the plan has a native smoke step, run what you can on
   this Mac (`bun run tauri:dev`). Steps that need a real selection in another
   app, system permissions, or human judgement go into the batch's operator
   test list, marked "to verify by the operator". Never claim a native result
   you did not observe.
7. **Review the whole diff**: scope limited to the plan, no hand-edited
   `bun.lock`, `Cargo.lock`, Paraglide output, `ts-rs` bindings or build
   output, no secrets, vocabulary from AGENTS.md, privacy invariants intact.
8. **Status.** In `plans/README.md`, set the plan's status to
   `IN PROGRESS: PR #<n>, awaiting operator test` (commit it on the same
   branch once the PR number exists). Do not delete the plan yet.
9. **Push and open the PR** to `main`: title = the plan's first commit
   message; body = the repository template (`.github/pull_request_template.md`)
   filled with: plan number and link, what changed, every verification run
   with its result, native steps done or deferred to the operator, and any
   contract/ADR change. Add no assistant attribution: no "generated with"
   line in PR bodies and no co-author trailer in commits (operator rule).
10. **Wait for CI.** `gh pr checks <n> --watch`. Every check must be green, not
    only the required `desktop` job (the macOS/Windows Rust matrix counts).
11. **If CI fails.** Read the failure (`gh run view <run-id> --log-failed`),
    fix the cause on the same branch, rerun the relevant local checks, push,
    and wait again. At most **two** fix attempts per plan; a third failure,
    a flaky test you cannot explain, or a fix outside the plan's scope is a
    STOP: report in French and wait.
12. **Merge.** If the branch is behind `main`, `gh pr update-branch <n>` and
    wait for CI again. Resolve review conversations (protection requires it;
    ask the operator if a comment needs a decision). Then
    `gh pr merge <n> --squash --delete-branch`.
13. **After the merge.** `gh run list --branch main -L 5`: the "Release
    desktop" run must exit without publishing (version unchanged) and "Deploy
    site" must succeed. A failure here is a STOP.
14. **Next plan.** Continue with the next plan of the batch without asking.

## Batch gate — operator tests ⏸ OPERATOR

When every plan of the batch is merged:

1. Build the test instructions in French: how to run (`bun run tauri:dev`
   from an up-to-date `main`, or `bun run dev:desktop` then
   `http://127.0.0.1:1420/?fixture=demo`), and a numbered checklist that
   merges the batch's "Operator tests" column above with every native step
   deferred by its plans. Each item says what to do and what should happen.
2. Ask: "Tout est OK ?", plus any open question (e.g. a visual choice).
3. End your turn and wait.

Then, depending on the answer:

- **Problems reported:** fix them with small PRs through the per-plan loop
  (branch `codex/fix-<short-topic>`, title `fix(<area>): …`), then return to
  this gate with only the affected checklist items.
- **Everything OK after batch A or C:** report in French and start the next
  batch. The batch's plans stay `IN PROGRESS: PR #…` until the release.
- **Everything OK after batch B, D, E or F:** continue with the release step below.

## Batch release

1. `git switch main && git pull --ff-only`, branch `codex/release-X.Y.Z`.
2. **Close the released plans** (AGENTS.md plan lifecycle; `0.2.0` closes
   batches A+B, `0.3.0` C+D, then E and F): add one dated section to
   `docs/IMPLEMENTATION_HISTORY.md` summarising what each plan shipped (PR
   numbers, new ADR numbers, anything left unverified natively); delete those
   plan files; remove their rows and live references from
   `plans/README.md` (keep the queue order line accurate).
3. **Bump the version** to the agreed `X.Y.Z` in exactly four manifests:
   `package.json`, `apps/desktop/package.json`,
   `apps/desktop/src-tauri/Cargo.toml` (`[package] version`) and
   `apps/desktop/src-tauri/tauri.conf.json`. Regenerate the lockfile entry
   with Cargo, never by hand:
   `cargo update -p charon-desktop --manifest-path apps/desktop/src-tauri/Cargo.toml --offline`;
   if Cargo refuses, `cargo metadata --format-version 1 --manifest-path apps/desktop/src-tauri/Cargo.toml > /dev/null`
   rewrites it. `git diff apps/desktop/src-tauri/Cargo.lock` must show only the
   `charon-desktop` version line. `bun scripts/check-release-version.ts` must
   print `X.Y.Z`, and `gh release view vX.Y.Z` must report that no release
   exists yet.
4. **Release notes.** Rewrite `release-notes.md` for `X.Y.Z` in the existing
   shape (`# Charon X.Y.Z — Early Access`, Highlights, Early Access limits,
   Installation and trust, Privacy). Highlights describe only behaviour that
   ships in these batches. Keep the first-launch and unsigned warnings. For
   `0.2.0`, state that macOS asks for Input Monitoring and Accessibility one
   last time because releases are now signed with a stable self-signed
   certificate; from `0.3.0`, state that updates keep both permissions.
5. If Gate 0 said so, update the site's announced version and its assertions
   together (`docs/SITE.md` rule).
6. Local checks: `bun run check`, Rust tests, Chromium e2e.
7. PR title `chore(release): prepare vX.Y.Z`; body lists the released PRs and
   the operator's test results for both batches. Run the CI wait/fix/merge steps (10-12).
8. **First signed release (`0.2.0`) only**: before merging, confirm the
   operator gave the certificate fingerprint at Gate 0. After merging, read the
   macOS job log: "Import the stable macOS signing identity" must succeed and
   "Verify the stable macOS designated requirement" must print
   `certificate leaf = H"<fingerprint>"`. If the import fails at
   `add-trusted-cert` or the check finds `cdhash`, nothing is published: STOP
   and report; never switch back to ad-hoc without a new operator decision
   (ADR 0018). For `0.3.0`, the batch D operator test includes updating an
   installed `0.2.0` through the in-app updater and confirming that Input
   Monitoring and Accessibility are still granted; record the result in
   `docs/platform-support.md` in the release PR.
9. **Watch the release.** `gh run list --workflow "Release desktop" -L 1`,
   then `gh run watch <id>`. When it succeeds, verify
   `gh release view vX.Y.Z --json assets -q '.assets[].name'` lists the
   macOS `.dmg` and `.app.tar.gz(.sig)`, Linux `.AppImage(.sig)`, `.deb`,
   `.rpm`, Windows `-setup.exe(.sig)`, `.msi(.sig)`, `latest.json` and
   `SHA256SUMS.txt`, and that `latest.json` has `darwin-aarch64`,
   `linux-x86_64` and `windows-x86_64`.
10. **If the release run fails:** no partial release is published (ADR 0016).
   Never reuse the version: fix the cause in a PR, bump to the next patch
   (`X.Y.(Z+1)`), update the release notes and repeat this section. Report the
   failure to the operator in French at the same time, without waiting unless
   the fix needs a workflow or secret change (then STOP).
11. Report in French: version, release link, what shipped, what stays
    unverified natively. Then start the next batch without waiting, unless
    the operator asked to pause.

## End of the queue

When the last planned release is published (`0.5.0`, or earlier if the
operator stops the queue): delete this runbook and every remaining reference
to it in a final PR (`docs(plans): close the 2026-09 queue`), leave
`plans/README.md` with an empty or updated "Active queue", and send the
operator a French summary of all versions, PRs, ADRs and open follow-ups
(`plans/README.md` "Direction" options stay for the operator).
