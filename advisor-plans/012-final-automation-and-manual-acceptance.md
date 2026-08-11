# Plan 012: Run final automation and hand over the complete manual matrix

> **Executor instructions**: This plan closes automation and creates the human
> acceptance artifact. It does not authorize signing-secret creation, artifact
> installation, deployment, tagging, publication, or platform promotion. Run
> automation twice; then stop at `AWAITING MANUAL` and hand the exact candidate
> plus this entire matrix to the operator. Do not start until Product Plan 014
> is `DONE` and Product Plan 015 has assembled its operator-authorized protected
> GitHub draft and updater artifacts; public promotion is not a prerequisite.

> **Drift check (run first)**:
> `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- . ':!advisor-plans'`

## Status

- **Priority**: P1
- **Effort**: L automation + XL physical matrix
- **Risk**: HIGH
- **Depends on**: Advisor Plan 011; Product Plan 014 `DONE`; Product Plan 015
  protected draft ready for manual acceptance
- **Category**: release, manual testing, evidence
- **Planned at**: `a0543d0bc9ba49d2eb21f631d5e76104a920fd58`, 2026-08-09
- **State**: TODO

## Why this matters

Browser and unit tests cannot prove native permissions, focus preservation,
pasteboard races, real filesystem durability, OS assistive technology, exact
artifact trust posture, installers, or the deployed Cloudflare edge. The loop must finish all
automatable work, then give a human one complete, evidence-oriented checklist
instead of scattered notes across Plans 011-015 and platform docs.

## Commands

| Purpose | Command | Expected result |
|---|---|---|
| Clean tree | `git status --short` | empty before each release run |
| Frozen install | `bun install --frozen-lockfile` | exit 0 |
| Release gate | `bun run verify:release` | exit 0 twice from separate processes |
| Bun security | `bun audit` | zero vulnerabilities |
| Rust security | `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | zero vulnerabilities; reviewed warnings only |
| Debug bundle | `bun run tauri:build -- --debug` | local candidate builds for available host |
| Workers dry run | `bun run --cwd apps/site workers:dry-run` | static deployment package validates |
| Diff | `git diff --check && git status --short` | only intentional documentation/status changes |

## Scope

**In scope**: final automated runs, evidence manifest template, creation of
`docs/MANUAL_ACCEPTANCE.md`, exact manual cases below, links from testing/release
docs, and transition to `AWAITING MANUAL`.

**Out of scope**: silently fixing a newly found P0/P1 failure in this catch-all
plan, signing/publishing/deploying/installing without authority, marking an
untested platform supported, or accepting a manual row without evidence.

## Git workflow

- Branch: `codex/premium-loop`
- Automated handoff commit: `docs(test): add the manual release acceptance matrix`
- After every applicable manual row passes, human evidence commit:
  `test(release): record manual acceptance`
- Do not push, tag, publish, deploy, or install unless separately authorized.

## Steps

### Step 1: Prove a clean automated candidate twice

From a clean worktree, run Commands in order. Close all test servers/processes,
then repeat `verify:release` from a fresh shell/process. Record commit, Bun/Node/
Rust versions, OS/architecture, build hashes, test counts, duration, and report
paths. Do not edit thresholds between the two runs.

**Verify**: both runs pass with identical generated files and no skipped/only
test, secret, private content, or untracked build artifact.

### Step 2: Materialize the evidence document

Create `docs/MANUAL_ACCEPTANCE.md` containing:

- candidate version, commit, artifact file name, SHA-256, OS/architecture;
- platform signing/notarization status, Tauri updater-signature fingerprint when
  applicable, checksum, and installer source as separate evidence fields;
- tester, date/timezone, device/display/input/assistive-tech versions;
- exact Workspace fixture ID and a statement that data is synthetic;
- columns `ID`, `platform`, `result`, `evidence`, `issue`, and `notes`;
- every test below, unchanged except for implementation-accurate labels/paths;
- `PASS`, `FAIL`, `BLOCKED`, `N/A: justified`, never a blank accepted row.

**Verify**: TESTING, RELEASE_CHECKLIST, RELEASING, platform support, and this
advisor index link to the one document.

### Step 3: Hand off and stop

Commit the documentation/status change with the automated handoff commit. Mark
this plan and index `AWAITING MANUAL`, then stop. The operator performs the
matrix against exact artifacts. Any failure returns to the owning plan with a
regression test; do not patch ad hoc inside the evidence document.

**Verify**: no release/product status is promoted merely by reaching the handoff.

## Complete manual acceptance matrix

All rows are required unless the platform/feature column explicitly makes them
inapplicable. “Exact candidate” means the same hash intended for release or
platform-support evidence.

### A. Candidate identity, installation, and lifecycle

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| A01 | Each candidate | Record file name, size, SHA-256, commit/version, OS/arch, GitHub draft/tag source, platform-signing status, and Tauri updater signature separately. | Evidence uniquely identifies one immutable artifact; no debug artifact is called a release and no updater signature is presented as OS publisher identity. |
| A02 | macOS release | Run `codesign --verify --deep --strict`, inspect the exact ad-hoc identity/bundle ID, and record Gatekeeper/notarization behavior on a clean machine. | Ad-hoc identity is exact, notarization is absent, required user override/warnings are documented, and no Developer ID trust is claimed. |
| A03 | Windows release | Inspect the exact installer's Authenticode state and record SmartScreen behavior on a clean machine. | Unsigned status and observed warning/override are explicit; the Tauri updater signature is documented separately and no publisher reputation is implied. |
| A04 | Linux release | Verify package/checksum and launch from the supported desktop environment. | Package installs/launches with documented system dependencies. |
| A05 | Each candidate | Fresh install/first launch, quit normally, relaunch. | One main window, no content loss, same validated Workspace reopens. |
| A06 | Each candidate | Minimize/hide Charon, launch a second instance. Repeat while already visible. | Existing window returns and bottom composer receives focus once; no second process/window, draft, or Note. |
| A07 | Each candidate | Resize to 400×720, 480×720, 520×720, and 720×480; quit/relaunch after each valid size. | Compact breakpoint behavior and saved window state restore without off-screen/clipped composer, Attachment actions, or controls. |
| A08 | Each candidate | Launch offline while observing outbound connections. | Desktop remains functional and makes no undisclosed request. |

### B. Workspace bootstrap, switching, watcher, and migration

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| B01 | Each candidate | On a clean profile with no target directory, launch. | Safely creates/opens visible `Documents/Charon`; no account/setup dead end. |
| B02 | Each candidate | Pre-create unrelated `Documents/Charon` without a manifest; launch. | It is untouched; safe `Charon Workspace` fallback or explicit chooser is used. |
| B03 | Each candidate | Make both default names unsafe/unavailable. | Contextual, content-free chooser/failure appears; no unrelated directory is modified. |
| B04 | Each candidate | Choose a valid existing Workspace, cancel chooser, then choose invalid/corrupt folder. | Cancel changes nothing; invalid candidate leaves current Workspace/watcher/draft active. |
| B05 | Each candidate | With a dirty editor, request Workspace switch; cancel, then save and retry. | Cancel preserves exact draft; successful save precedes one atomic switch. |
| B06 | Each candidate | Trigger candidate watcher/snapshot/preference-write failure using the documented test fixture/build. | Previous Workspace remains authoritative; committed switch warning is truthful and retry-safe. |
| B07 | Each candidate | Switch successfully, restart, then Copy as Markdown for a managed Attachment. | New Workspace reopens; canonical path points only inside the new root. |
| B08 | Each candidate | Edit/add/remove a Note file externally using a documented supported case. | Watcher updates/reset once, preserves coherent revision and active draft policy. |
| B09 | Each candidate | Open a valid schema v1 fixture with active and already-trashed bodies. | Active bodies migrate byte-exactly; legacy trash becomes visible user-owned Markdown and is not re-imported. |
| B10 | Each candidate | Repeat v1 migration with destination collision/interruption fixture. | Recovery is bounded/deterministic; nothing is hidden, overwritten, merged, or silently destroyed. |
| B11 | Each candidate | Inspect a large-attachment Workspace at open while measuring disk reads. | Health validation does not read valid Attachment payload bytes; missing/invalid references remain contextual. |

### C. Composer, list, search, Selection, and status

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| C01 | Each candidate | Enter whitespace, then a real line with Enter and button; double-submit rapidly. | Whitespace creates nothing; each explicit valid intent creates exactly one Open Note and clears only on success. |
| C02 | Each candidate | Make Workspace temporarily unwritable and submit composer text. | Exact text/focus is preserved with localized Retry; no duplicate appears after recovery. |
| C03 | Each candidate | Search body, Tag, Attachment name, multiple Unicode tokens, and no-result cases in Open/Done. | Results, counts, normalization, empty states, and clear behavior are correct. |
| C04 | Each candidate | Use keyboard only through virtualized 20,000-Note fixture: arrows, Home/End, Enter, Space, Shift+Arrow, Select all, Escape. | DOM/visual/assistive focus agree; target scrolls into view; Selection order/reconciliation stays correct. |
| C05 | Each candidate | Toggle one and many Notes Open/Done, including injected failure. | One acknowledged mutation per intent; failure is contextual/retryable and does not lose focus/Selection. |
| C06 | Each candidate | Change search/status while a selected or active Note disappears. | Selection and focus reconcile to nearest valid Note or composer; no hidden selected IDs remain. |

### D. Editor, drafts, Tags, Attachments, and preview

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| D01 | Each candidate | Open editor by pointer and Enter; close, reverse mid-animation at 0.25×, open another Note rapidly. | Expansion originates/returns to live row, retargets smoothly, never locks input, fires no duplicate save. |
| D02 | Each candidate | Type, wait for autosave, blur, filter away, virtual-scroll away, change locale/theme, and reopen. | Acknowledged save persists; unsaved draft survives presentation unmount until saved/discarded explicitly. |
| D03 | Each candidate | Inject save failure, then try status change, editor close, another Note, and Workspace switch. | Exact draft/caret where feasible and error remain; no navigation/switch silently discards it. |
| D04 | Each candidate | Cause external revision conflict while editing, then Retry/rebase. | User draft remains visible; only acknowledged base updates; no last-write-wins data loss. |
| D05 | Each candidate | Add/remove Tags rapidly; test duplicates, 16/17 Tags, 48/49 scalars, whitespace, controls, Turkish I, ß, composed accents, emoji. | Native contract wins; first spelling/order remains; invalid input is preserved/explained; no lost Tag update. |
| D06 | Each candidate | Preview headings, paragraphs, bullets, tasks, blank lines, code-like text, raw HTML/script and malicious links. | Semantic valid output, safe rendering, no orphan list item or script execution. |
| D07 | Each candidate | Cancel Attachment picker; import regular 0-byte, normal, exact 100 MiB, and multiple files up to count limit. | Cancel changes nothing; valid copies are Note-owned, ordered, bounded, and source paths are not persisted/logged. |
| D08 | Each candidate | Try 100 MiB+1, 21st file, duplicate source, symlink, directory, special file, inside-Workspace source, and changing source fixture. | Each fails closed with input/draft preserved and no partial/orphan managed file. |
| D09 | Each candidate | Import a 100 MiB sparse/synthetic file while recording peak RSS and disk traffic. | Peak stays within the documented threshold; unchanged existing Attachments are not read/rewritten. |
| D10 | Each candidate | Remove an Attachment; cancel once, confirm once, inject cleanup warning then Retry. | Correct file name/irreversibility; bytes removed after commit; warning cannot repeat the already committed removal. |
| D11 | Each candidate | Inspect editor/list at coarse pointer/touch emulation. | Critical actions stay visible with usable effective targets; hover is never required. |

### E. ClipboardComposer and permanent deletion

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| E01 | Each candidate | Copy one Note with/without Tags/Attachments and multiple Notes in visible Selection order. | Output exactly matches canonical headings, separators, inline-code escaping, Tag order, Attachment order, names and canonical managed paths. |
| E02 | Each candidate | Copy with a missing/escaping managed Attachment reference and with clipboard write denial. | Clipboard remains unchanged; contextual error/Retry appears; Note state is unchanged. |
| E03 | Each candidate | Paste the result manually into a plain text editor and an agent composer. | Charon never pastes/uploads; user sees disclosed local paths and controls any later Attachment action. |
| E04 | Each candidate | Delete one/many Notes; cancel, then confirm. | Confirmation names count/irreversibility; success removes active Markdown and managed bytes, clears Selection, focuses nearest survivor/composer. |
| E05 | Each candidate | Inspect `notes/`, `attachments/`, and normal transaction backups after successful Delete. | No deleted body or managed Attachment bytes remain in active files or normal completed Charon backups. |
| E06 | Each candidate | Inject pre-commit crash/failure and reopen. | Old revision rolls back coherently; no acknowledged deletion/import/update vanishes. |
| E07 | Each candidate | Inject post-manifest cleanup failure and reopen/Retry. | New revision remains authoritative in memory/disk; cleanup warning is truthful; Retry never duplicates the mutation. |
| E08 | Each candidate | Confirm deletion disclosure against OS snapshots/external/synced backups. | UI/docs do not claim control over those external histories. |

### F. macOS selected-text capture and permissions

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| F01 | Exact macOS candidate | Start with neither permission; launch and inspect Preferences. Request Input Monitoring and Accessibility separately. | No prompt on mount; states/actions are distinct and localized; denial keeps composer/portable shortcut usable. |
| F02 | Exact macOS candidate | Restart after grants/revocation and after rebuild or artifact-identity change. | Runtime re-preflights truthfully and registers exactly one listener only when allowed; ad-hoc TCC continuity is never assumed. |
| F03 | Exact macOS candidate | Try Shift+letter, repeat, hold, mixed Shift, Command changes, triple taps and boundary timings. | False-positive matrix creates no Note and never suppresses/reposts ordinary input. |
| F04 | Exact macOS candidate | Empty/whitespace selection. | No Note, no Charon reveal, source focus unchanged. |
| F05 | Exact macOS candidate | Capture TextEdit/AppKit selection and Chrome editable URL field. | Direct AX path creates exactly one byte-exact Note; clipboard/source focus unchanged. |
| F06 | Exact macOS candidate | Capture static Safari/WebKit, Chrome, and Codex selected text. | AX-first hybrid creates exactly one Note; Charon remains hidden/unfocused; bounded Copy disclosure is accurate. |
| F07 | Exact macOS candidate | Capture VS Code/Cursor editor and Preview PDF text when installed. | Exactly one Note or an honestly recorded unsupported row; no private API/product-specific rule. |
| F08 | Exact macOS candidate | Secure field, canvas/protected/blocked source. | Fails closed with no Note, capture/log, or source mutation. |
| F09 | Exact macOS candidate | Preload text then rich/multi-item pasteboards; capture fallback. | Complete snapshot restores exactly when transaction still owns change count. |
| F10 | Exact macOS candidate | Trigger unchanged/blocked/slow Copy and timeout. | Creates nothing; pre-existing clipboard is never mistaken for selection. |
| F11 | Exact macOS candidate | Write concurrently to clipboard during fallback. | Newer concurrent value remains authoritative; Charon skips restoration. |
| F12 | Exact macOS candidate | Trigger restoration failure and inspect next visible Charon session. | Content-free actionable warning appears; captured value never appears in logs/errors. |
| F13 | Exact macOS candidate | Observe fallback with an installed clipboard manager. | Transient selected text may be visible exactly as privacy disclosure says; Charon retains no history. |
| F14 | Exact macOS candidate | Repeat capture rapidly and after restart. | Single-flight, at most one Note per valid gesture, one listener/worker/accelerator. |
| F15 | Exact macOS candidate | Use portable `CmdOrCtrl+Shift+Space` hidden and visible. | Reveals existing window and focuses composer only; no draft/Note or enhanced permission required. |

### G. Linux and Windows pragmatic support

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| G01 | Linux X11 exact candidate | Install/launch; invoke portable shortcut from another app. | Existing window/composer focuses once if proved; no modifier-only/selected-text claim. |
| G02 | Linux Wayland exact candidate | Repeat standard shortcut on named compositor and test visible composer fallback. | Result is recorded per compositor; unsupported global activation is explained honestly, not disguised. |
| G03 | Windows exact candidate | Install/launch; invoke portable shortcut from another app. | Existing window/composer focuses once if proved; no modifier-only/selected-text claim. |
| G04 | Linux/Windows | Run composer, search, Open/Done, editor, Tag, Attachment picker, copy, Delete, folder switch/restart. | Standard product workflow passes with native dialogs and local files. |
| G05 | Linux/Windows | Inspect Preferences/capture help. | Unsupported enhanced capture is explicit; no synthetic Copy, low-level hook, or misleading permission action exists. |

### H. Accessibility, localization, themes, and motion preferences

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| H01 | macOS VoiceOver | Traverse titlebar, search, filters, virtual list, row actions, editor/preview, Tags, Attachments, Preferences, Delete, composer and errors. | Logical names/order/state, no trap, focus/Selection distinction, announcements and focus return are correct. |
| H02 | Linux Orca | Repeat standard workflow and portable shortcut. | Same semantics pass; modifier-only capture is not tested/claimed. |
| H03 | Windows Narrator | Repeat standard workflow and portable shortcut. | Same semantics pass; names/current/selected/pending/error state are announced. |
| H04 | Each candidate | Keyboard-only complete journey with visible focus. | No hover-only control, trap, lost focus, or mismatch after virtual scroll/dialog close. |
| H05 | Each candidate | Set WebView/OS scaling to 200%; test 720×480 (effective 360px) plus long EN/FR labels, errors, Tags, and Attachment names. | No clipped action/error/composer, hidden feature, or horizontal product scroll; text reflows. |
| H06 | Each candidate | Test Solarized first run, Light and Dark, then restart. | Solarized defaults; choices persist; wordmark/focus/error/selection contrast remains correct. |
| H07 | Each candidate | Test EN and FR, switch live/restart, inspect every error/permission/destructive string. | No mixed/hardcoded language; technical format labels remain canonical where specified. |
| H08 | Each candidate | Enable reduced motion and reverse editor/filter/preferences actions. | No spatial animation; static/crossfade outcome, same focus/function, no timer lock. |
| H09 | Each candidate | Enable reduced transparency. | Header/composer/popover materials become solid without losing hierarchy. |
| H10 | Each candidate | Enable increased contrast/high contrast. | Semantic boundaries/focus/selection/errors strengthen and remain distinguishable. |
| H11 | Each candidate | Run editor/filter/selection/Preferences motion at normal and 0.25×; reverse mid-flight. | Immediate feedback, current-value retargeting, symmetric origin/return, exactly-once side effects. |

### I. Static site on Cloudflare Workers

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| I01 | Local Wrangler | Serve built `dist`; visit every EN/FR home/privacy/download/changelog route and missing route. | Static routes/assets work at `/`; nearest custom 404 returns HTTP 404; no Worker app/API. |
| I02 | Protected deployed preview/production, if authorized | Record deployment/version/domain and visit the same matrix. | Exact reviewed artifact is served; canonical/hreflang/sitemap/robots use approved origin. |
| I03 | Desktop/mobile browsers | Review 390, 768, 1280, 1536 widths in Solarized/Light/Dark and EN/FR. | No overflow/clipping; clear editorial hierarchy; current nav/theme state and focus are visible. |
| I04 | Keyboard/screen reader | Traverse skip link, header nav, locale/theme controls, media/captions/transcript, CTA and footer. | Localized landmarks/current state, logical order, no trap, complete nonvisual content. |
| I05 | Browser with JS disabled | Visit every content route. | Core copy, navigation, privacy, release truth, media alternatives and 404 remain useful. |
| I06 | Reduced preferences | Enable reduced motion/transparency and increased contrast. | Capture passage becomes static/crossfade; content/CTA never gated; contrast remains sufficient. |
| I07 | Network inspector | Load every route and use controls. | No analytics, tracker, form, third-party embed, runtime API, GitHub browser API, or unexpected request. |
| I08 | Product truth | Compare screenshot/video/transcript/specimen/platform/download claims to exact app candidate. | Media is real synthetic-data capture; canonical Markdown exact; no automatic paste/upload or unsupported platform/release claim. |
| I09 | Lab report | Run the documented local/Workers performance method. | LCP ≤2.5 s, CLS ≤0.1, TBT/interaction proxy budgets pass; report does not claim field INP. |
| I10 | Cache/update | Publish an authorized preview revision, then verify hashed assets and HTML update/rollback behavior. | No mixed-version broken page; rollback selects a previously verified deployment. |

### J. Release, updater, privacy, and incident operations

| ID | Platform | Procedure | Expected result |
|---|---|---|---|
| J01 | Release operator | Follow RELEASING from version bump through protected draft without undocumented knowledge. | Every secret/approval/manual/publication gate is explicit; agents stop at human boundaries. |
| J02 | Each built artifact | Inspect bundle for test fixtures, source maps, synthetic/private sentinels, home paths, external brand source, keys/certs/passwords. | None are shipped; only approved assets/config exist. |
| J03 | Desktop runtime | Inspect logs/errors during all failure cases. | No Note/Tag/selection/clipboard content, external source path, managed absolute path outside explicit clipboard payload, or secret appears. |
| J04 | Updater, only if configured | From a prior Tauri-updater-signed version, opt in/check, defer with a dirty draft, accept explicitly, and launch the new Tauri-updater-signed version. | No default-on/silent install/restart; updater signature, GitHub `latest.json` endpoint, version, and notes are correct; dirty draft is preserved; platform signing posture is unchanged. |
| J05 | Updater, only if configured | Tamper package/manifest/signature and simulate endpoint/network failure. | Verification fails closed with contextual content-free error; current version/data remains usable. |
| J06 | Release operator | Exercise draft promotion denial, artifact yank, site rollback, and Tauri updater-key compromise tabletop. | Runbook stops jobs/removes latest metadata/rotates updater trust and never replaces an asset under the same tag; it does not promise OS certificate revocation. |
| J07 | Release operator | Compare platform-support/site/download claims with passed exact-artifact rows. | Only proved capabilities are promoted; blocked/untested rows remain explicit. |

## Manual completion rule

The operator may mark this plan `DONE` only when:

- every applicable row is `PASS` with evidence against the exact candidate;
- every `N/A` has a contract/platform justification;
- no P0/P1 failure is open;
- exact ad-hoc macOS candidate capture evidence exists before advertising macOS
  release capture, with Gatekeeper and TCC limitations disclosed;
- Linux/Windows claims match their own artifacts and environments;
- any actual Cloudflare deployment was explicitly authorized and recorded;
- existing product Plans 011, 012, 014, and 015 are updated only where their own
  physical/secret/operator done criteria are genuinely satisfied.

## Done criteria

- [ ] `verify:release` passes twice from clean processes without threshold edits.
- [ ] Candidate/evidence metadata and the entire matrix exist in one linked doc.
- [ ] Automated handoff commit is created and status becomes `AWAITING MANUAL`.
- [ ] Human rows are performed against immutable exact artifacts.
- [ ] Failures return to owning plans with regression tests and new artifact hash.
- [ ] Final claims/statuses match passed evidence only.
- [ ] Human evidence commit records final acceptance before this plan becomes `DONE`.

## STOP conditions

- Either automated release run fails or produces different generated output.
- A security vulnerability, serious/critical accessibility issue, data loss,
  deletion residue, source-path/content leak, clipboard overwrite, focus theft,
  false capture, or unsupported claim appears.
- Exact artifact hash, platform trust posture, updater signature when applicable,
  or platform environment is missing.
- A required manual row cannot be performed and has no valid `N/A` contract.
- Signing, installation, deployment, tagging, publication, secret creation, or
  platform promotion lacks operator authority.

## Maintenance notes

Clone the evidence document per release; never overwrite older accepted evidence.
Any artifact rebuild invalidates hash, platform-trust, and updater-signature rows
and requires them again. Native capture, installer, updater, accessibility, and
deployed-site rows remain human gates until a trustworthy platform automation
explicitly replaces them.
