# Plan 021: Make Workspace and preferences persistence portable to Windows and Linux

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/src/ipc/workspace.rs apps/desktop/src-tauri/tests apps/desktop/messages`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the path-containment guard; keep every existing storage/recovery test green)
- **Depends on**: none
- **Category**: bug (cross-platform)
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

The operator wants Charon to work on Linux, Windows, and macOS. Today only
macOS has ever run the Rust core. Reading the code shows five defects that make
the app non-functional or silently degraded on Windows, plus one Linux
first-run failure:

1. `RealWorkspaceStorage` stores the canonical root returned by
   `std::fs::canonicalize`, which on Windows is a verbatim path
   (`\\?\C:\Users\...`). Every relative path in the crate is `/`-joined
   (`"notes/{id}.md"`, `"backups/{tx}/previous/manifest.json"`), and
   `self.root.join(relative)` produces `\\?\C:\...\Charon\notes/abc.md`.
   Win32 does not accept `/` inside a verbatim path, so nested reads, writes,
   and renames fail — the first Note creation fails, and any Workspace with
   Notes cannot be opened.
2. `preferences/storage.rs::sync_directory` fsyncs a directory without a
   `#[cfg(unix)]` gate; on Windows opening a directory as a `File` fails, so
   every preferences write reports an error after the rename already happened
   — and every Workspace open/create calls `remember_workspace`, so every open
   surfaces a `preferences_*` error on Windows.
3. `watch.rs::relevant()` matches `"notes/"`, `"backups/"` and splits on `/`
   against a `to_string_lossy()` path; on Windows the relative remainder uses
   `\`, so external edits to Notes are never detected.
4. `MemoryWorkspaceStorage::create_dir_all` builds directory keys with
   `PathBuf::push` (backslashes on Windows) while every lookup uses `/`-joined
   strings, so `cargo test` cannot pass on Windows.
5. `canonical_managed_path` returns the raw verbatim string, so
   `Copy as Markdown` on Windows emits `\\?\C:\...` attachment paths.
6. On Linux without XDG user dirs, `app.path().document_dir()` fails and the
   first run shows the unrelated "selected path is outside the workspace"
   message.

Also, `preferences.json` (which stores `lastWorkspacePath`) is written without
the `0o600` mode that Workspace files already use on Unix.

Fixing these makes the Rust core correct on all three platforms and is the
prerequisite for Plan 022 (a Windows/Linux `cargo test` gate) to give a green
signal.

## Current state

Files and roles:

- `apps/desktop/src-tauri/src/workspace/storage.rs` — `WorkspaceStorage` trait,
  `RealWorkspaceStorage` (real FS, canonical root, symlink/traversal guards),
  `FailingWorkspaceStorage` (test fault injection), `MemoryWorkspaceStorage`
  (in-memory test double), `validate_relative`, `path_string`.
- `apps/desktop/src-tauri/src/workspace/watch.rs` — notify-based watcher;
  `relevant()` filters event paths.
- `apps/desktop/src-tauri/src/workspace/mod.rs` — `Workspace`;
  `reconcile_external_changes` (line 271+) normalizes `\` to `/` at line 283.
- `apps/desktop/src-tauri/src/preferences/storage.rs` — atomic preferences
  writes; `sync_directory` at lines 103-106.
- `apps/desktop/src-tauri/src/ipc/workspace.rs` — `workspace_bootstrap_default`
  (lines 84-96) resolves `document_dir()/Charon`.
- `apps/desktop/src-tauri/src/workspace/error.rs` — `WorkspaceError` and its
  IPC mapping to `code`/`message_key`.
- `apps/desktop/messages/en.json`, `fr.json` — Paraglide messages (all desktop
  copy goes through Paraglide; keys are flat snake_case).

Excerpts (verify these match before editing):

`storage.rs:79-98` — canonical root:

```rust
pub(crate) fn create(root: &Path) -> Result<Self, WorkspaceError> {
    ...
    fs::create_dir_all(root)?;
    let root = fs::canonicalize(root).map_err(|_| WorkspaceError::InvalidPath)?;
```

`storage.rs:100-142` — `resolve()` builds `let candidate = self.root.join(relative);`
(line 102), walks components with `cursor.push(component.as_os_str())` (line
105), and for a missing leaf returns `canonical_parent.join(file_name)` (line
141), where `file_name` is taken from the `/`-containing candidate.

`storage.rs:465-474` — memory storage:

```rust
fn create_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
    validate_relative(relative)?;
    let mut state = self.inner.lock().expect("memory storage lock");
    let mut cursor = PathBuf::new();
    for component in Path::new(relative).components() {
        cursor.push(component.as_os_str());
        state.directories.insert(path_string(&cursor)?);
    }
```

`storage.rs:325-339` — `canonical_managed_path` returns
`canonical.into_os_string().into_string()`.

`storage.rs:266-277` — `sync_dir` is already correctly gated `#[cfg(unix)]`.

`watch.rs:164-178`:

```rust
fn relevant(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else { return false; };
    let relative = relative.to_string_lossy();
    if relative.starts_with("backups/")
        || relative.split('/').any(|component| component.starts_with(".charon-"))
    { return false; }
    relative == "charon.workspace.json"
        || (relative.starts_with("notes/") && relative.ends_with(".md"))
}
```

`preferences/storage.rs:103-106`:

```rust
fn sync_directory(path: &Path) -> Result<(), PreferencesError> {
    File::open(path)?.sync_all()?;
    Ok(())
}
```

`preferences/storage.rs:64-70` — the temp file is opened with
`OpenOptions::new().write(true).create_new(true)` and no `.mode()`.

`ipc/workspace.rs:88-92`:

```rust
let documents = app
    .path()
    .document_dir()
    .map_err(|_| crate::workspace::WorkspaceError::InvalidPath)?;
```

Conventions to match:

- Relative Workspace paths are always `/`-joined `&str` values validated by
  `validate_relative` (`storage.rs:631-644`); keep that contract — normalize at
  the storage boundary, not at call sites.
- Errors are typed `WorkspaceError` variants mapped to content-free IPC codes
  in `workspace/error.rs`; never put a filesystem path in an error message.
- Tests: unit tests live in `#[cfg(test)] mod tests` at the bottom of each file
  (see `storage.rs:652-683`), integration tests in
  `apps/desktop/src-tauri/tests/workspace_contract.rs`.
- Vocabulary from `AGENTS.md`: `Workspace` is the durable boundary; do not add
  services or wrappers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | all pass (73 `#[test]`s in `src/` plus the `tests/` contract suites; some are cfg-gated) |
| Clippy | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Format | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` | exit 0 |
| Bindings | `bun run bindings:check` | exit 0 (only if a DTO changes) |
| Messages/typecheck | `bun run typecheck` | exit 0 (after adding message keys) |
| Full JS gate | `bun run check` | exit 0 (note: `bun run lint` currently fails on a local `.claude/` file — see Plan 028; use `bun run typecheck && bun run test` if so) |

You cannot run Windows tests locally on macOS/Linux. Write the fixes so that
the new unit tests exercise the Windows-specific inputs (backslash paths,
verbatim prefixes) on every platform where possible.

## Scope

**In scope** (the only files you should modify):
- `apps/desktop/src-tauri/src/workspace/storage.rs`
- `apps/desktop/src-tauri/src/workspace/watch.rs`
- `apps/desktop/src-tauri/src/workspace/mod.rs` (only the `replace('\\', "/")` at line 283 if made redundant)
- `apps/desktop/src-tauri/src/preferences/storage.rs`
- `apps/desktop/src-tauri/src/ipc/workspace.rs`
- `apps/desktop/src-tauri/src/workspace/error.rs` (new variant + IPC code only)
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json` (one new key)
- `apps/desktop/src-tauri/tests/workspace_contract.rs` (new tests)
- `docs/platform-support.md` (one paragraph recording what is now portable by construction)

**Out of scope** (do NOT touch):
- `apps/desktop/src-tauri/src/workspace/recovery.rs`, `migration.rs`,
  `command.rs`, `model.rs` — the transaction design is unchanged here (Plan 032
  owns it).
- `apps/desktop/src-tauri/src/capture/**` — platform capture adapters are
  by-design stubs on Linux/Windows.
- CI workflows — Plan 022.
- Any frontend file except the two message JSON files.

## Git workflow

- Branch: `codex/021-portable-persistence`
- Commit message: `fix(workspace): make persistence portable to windows and linux`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `simplify_canonical` helper and use it for the root, the watcher root, and user-facing paths

In `storage.rs`, add two `pub(crate)` functions (the watcher needs them too):

```rust
/// Strips the Windows verbatim prefix (`\\?\` or `\\?\UNC\`) from a path
/// string. Compiled and unit-tested on every platform (pure string logic);
/// a no-op for paths without the prefix.
pub(crate) fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

/// `fs::canonicalize` followed by `strip_verbatim_prefix`, so results can be
/// joined with `/`-relative paths and shown to users on every platform.
pub(crate) fn simplify_canonical(path: &Path) -> std::io::Result<PathBuf> {
    fs::canonicalize(path).map(|canonical| strip_verbatim_prefix(&canonical))
}
```

Replace **every** `fs::canonicalize` call in `RealWorkspaceStorage` with
`simplify_canonical` — there are eight: `create` (:85), `open` (:93),
`resolve` (**three** sites: :111 component walk, :125 existing candidate, :136
missing-leaf parent), `create_dir_all` (:167), `read_external_regular` (:285),
`canonical_managed_path` (:331) — so that **both sides of every
`starts_with(&self.root)` comparison use the same simplified form**. Never mix
simplified and verbatim forms in one comparison.

Also replace `std::fs::canonicalize(root)` in `watch.rs:24`
(`WorkspaceWatcher::start`) with `super::storage::simplify_canonical(root)`;
otherwise the watched root stays verbatim on Windows while the Workspace root
becomes simplified, and `mod.rs:280`'s `strip_prefix(root)` never matches.
`Workspace::start_watching` (`mod.rs:167-175`) passes `self.storage.root()`,
which is already simplified after this step, so the two roots agree.

Add a unit test in `storage.rs` for `strip_verbatim_prefix` with the string
inputs `\\?\C:\Users\x\Charon` → `C:\Users\x\Charon`,
`\\?\UNC\server\share\Charon` → `\\server\share\Charon`, and `/tmp/x` →
`/tmp/x` (this test discriminates on every OS because it is pure string
logic).

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` → all pass; `grep -n "fs::canonicalize" apps/desktop/src-tauri/src/workspace/storage.rs apps/desktop/src-tauri/src/workspace/watch.rs` → exactly one match, inside `simplify_canonical`.

### Step 2: Join relative paths component-wise instead of `root.join("a/b")`

In `storage.rs`, add:

```rust
fn join_relative(root: &Path, relative: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for part in relative.split('/').filter(|part| !part.is_empty()) {
        path.push(part);
    }
    path
}
```

Also add the leaf splitter (exact semantics, so two executors write the same
code):

```rust
/// Splits a validated `/`-relative path into (parent, leaf).
/// `"notes/a.md"` → `(Some("notes"), "a.md")`; `"a.md"` → `(None, "a.md")`.
/// Returns `InvalidPath` for an empty leaf (`""`, `"notes/"`).
fn split_relative_leaf(relative: &str) -> Result<(Option<&str>, &str), WorkspaceError> {
    let (parent, leaf) = match relative.rsplit_once('/') {
        Some((parent, leaf)) => (Some(parent), leaf),
        None => (None, relative),
    };
    if leaf.is_empty() { return Err(WorkspaceError::InvalidPath); }
    Ok((parent, leaf))
}
```

Replace `self.root.join(relative)` in `resolve()` (line 102) and `exists()`
(line 237) with `join_relative(&self.root, relative)`. In `resolve()`, keep the
component walk as is (it already pushes components one at a time). Rewrite the
missing-leaf branch (lines 135-141) as: `let (parent, leaf) = split_relative_leaf(relative)?;`
→ `let parent_path = parent.map_or_else(|| self.root.clone(), |p| join_relative(&self.root, p));`
→ `let canonical_parent = simplify_canonical(&parent_path).map_err(|_| WorkspaceError::InvalidPath)?;`
→ containment check → `Ok(canonical_parent.join(leaf))`. This removes every
place where a `/`-containing string is pushed as one component and keeps the
existing `InvalidPath` behaviour for malformed leaves.

**Verify**: `cargo test ... --locked` → all pass; `grep -n "self.root.join(" apps/desktop/src-tauri/src/workspace/storage.rs` → no matches.

### Step 3: Make `MemoryWorkspaceStorage` keys always `/`-joined

In `create_dir_all` (storage.rs:465-474) accumulate a `String` joined with `'/'`
instead of a `PathBuf`:

```rust
let mut cursor = String::new();
for part in relative.split('/').filter(|part| !part.is_empty()) {
    if !cursor.is_empty() { cursor.push('/'); }
    cursor.push_str(part);
    state.directories.insert(cursor.clone());
}
```

`path_string` is still used by `MemoryWorkspaceStorage::write_synced`
(`storage.rs:487-493`, `.map(path_string)` on `Path::parent()`); replace that
call with `split_relative_leaf(relative)?.0.unwrap_or_default()` (Step 2's
helper — the parent of a `/`-relative string, `""` for root) and then delete
`path_string`. Add a unit test in `storage.rs` `mod tests`:

```rust
#[test]
fn memory_storage_uses_forward_slash_keys_on_every_platform() {
    let storage = MemoryWorkspaceStorage::new();
    storage.create_dir_all("backups/tx/previous").expect("dirs");
    storage.write_synced("backups/tx/previous/manifest.json", b"{}").expect("write");
    assert_eq!(storage.list("backups").expect("list"), vec!["tx".to_owned()]);
    assert!(storage.exists("backups/tx/previous/manifest.json").expect("exists"));
}
```

**Verify**: `cargo test ... --locked memory_storage` → passes.

### Step 4: Make the watcher filter separator-agnostic

Rewrite `relevant()` in `watch.rs` as a thin wrapper over a pure,
platform-independent function on components, preserving today's semantics
exactly (`notes/` at **any depth** ending in `.md` is relevant; anything under
`backups/`, and any path with a `.charon-` component, is not):

```rust
fn relevant(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else { return false; };
    let parts: Vec<&str> = relative
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect();
    relevant_components(&parts)
}

fn relevant_components(parts: &[&str]) -> bool {
    if parts.first() == Some(&"backups") { return false; }
    if parts.iter().any(|part| part.starts_with(".charon-")) { return false; }
    match parts {
        ["charon.workspace.json"] => true,
        ["notes", rest @ ..] => rest.last().is_some_and(|leaf| leaf.ends_with(".md")),
        _ => false,
    }
}
```

Add a unit test for `relevant_components` with slices
`["notes","x.md"]` → true, `["notes","sub","x.md"]` → true,
`["backups","t","m"]` → false, `["notes",".charon-x.md"]` → false,
`["charon.workspace.json"]` → true, `["attachments","n","a.png"]` → false
(this discriminates on every OS). Keep the existing two watcher tests.

If `mod.rs:283`'s `.replace('\\', "/")` is still needed by the reconcile code
(it converts the watched path back to a `/`-relative key), leave it; otherwise
delete it. Do not change anything else in `mod.rs`.

**Verify**: `cargo test ... --locked watch` → passes.

### Step 5: Gate the preferences directory fsync and set `0o600` on Unix

In `preferences/storage.rs`:

```rust
fn sync_directory(path: &Path) -> Result<(), PreferencesError> {
    #[cfg(unix)]
    std::fs::File::open(path)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
```

`File` is imported at `preferences/storage.rs:1` (`use std::fs::{self, File, OpenOptions};`)
only for this function; drop `File` from that import (use the fully-qualified
path above) so Windows does not fail `clippy -D warnings` with `unused_imports`.

In `write_inner`, mirror `workspace/storage.rs:187-191`:

```rust
let mut options = OpenOptions::new();
options.write(true).create_new(true);
#[cfg(unix)]
{
    use std::os::unix::fs::OpenOptionsExt;
    options.mode(0o600);
}
let mut file = options.open(&temporary)?;
```

Add a `#[cfg(unix)]` test asserting `preferences.json` mode is `0o600` after
`write` (use `std::os::unix::fs::PermissionsExt`).

**Verify**: `cargo test ... --locked preferences` → passes.

### Step 6: Fall back safely when `document_dir()` is unavailable (Linux)

In `ipc/workspace.rs::workspace_bootstrap_default`, replace the hard failure:

```rust
let documents = match app.path().document_dir() {
    Ok(path) => path,
    Err(_) => app
        .path()
        .home_dir()
        .map(|home| home.join("Documents"))
        .map_err(|_| crate::workspace::WorkspaceError::DefaultLocationUnavailable)?,
};
```

Add `WorkspaceError::DefaultLocationUnavailable` in `workspace/error.rs`, mapped
to code `default_location_unavailable` and message key
`workspace_error_default_location_unavailable`. Add that key to `en.json`
("Charon could not find a Documents folder for the default Notes folder.
Choose a folder to continue.") and `fr.json` ("Charon n’a pas trouvé de
dossier Documents pour le dossier de notes par défaut. Choisissez un dossier
pour continuer." — use the typographic apostrophe `’` like every other FR
string). Follow the existing `workspace_error_*` key style (`en.json:69` is
`workspace_error_invalid_path`). No frontend code change is needed: the
frontend resolves `messageKey` dynamically
(`apps/desktop/src/components/workspace-state.tsx:22`) and `code` is a free
string in the binding. Do not add a fallback that silently creates a Workspace
anywhere other than under Documents or the home directory.

Note that `resolve_default_workspace_path` (`ipc/workspace.rs:235-251`) still
guards against adopting an unrelated directory; keep it.

**Verify**: `grep -c "workspace_error_default_location_unavailable" apps/desktop/messages/en.json apps/desktop/messages/fr.json` → `1` each; `bun run typecheck` → exit 0 (this recompiles Paraglide messages; it needs network/cache access to the inlang CDN plugins and does not by itself prove the key exists — the grep does); `cargo test ... --locked` → all pass, including a new unit test in `error.rs`/`ipc/workspace.rs` asserting the new variant maps to `code == "default_location_unavailable"`.

### Step 7: Strip verbatim prefixes from user-facing paths and record the contract

`canonical_managed_path` now returns the simplified canonical path (Step 1), so
`Copy as Markdown` and `ExternalFile::identity` no longer see `\\?\`. Add a
unit test in `storage.rs` that asserts `canonical_managed_path` output does not
start with `\\?\` for a real temp Workspace with one attachment file (create
the file directly under `attachments/<note>/<id>.txt` in the temp dir; the
storage layer does not care about the manifest). Be honest about what the new
tests prove: the `strip_verbatim_prefix` and `relevant_components` tests
(Steps 1 and 4) discriminate on every OS because they are pure; the
filesystem-level tests (this step, Step 3, the contract round-trip) exercise
the new code paths everywhere but only *fail before the fix* on Windows —
Plan 022's Windows CI leg is where they earn their keep. Do not weaken them to
make them "fail locally".

Append one paragraph to `docs/platform-support.md` under "Current support
state" stating that Workspace/preferences persistence, path containment, the
watcher filter, and Copy-as-Markdown path output are separator- and
verbatim-prefix-agnostic by construction, and that runtime Windows/Linux
evidence is still gated by Plan 022 CI and the physical matrices.

**Verify**: `cargo fmt ... --check` → exit 0; `cargo clippy ... -D warnings` → exit 0; `cargo test ... --locked` → all pass.

## Test plan

- New unit tests (Steps 3, 4, 5, 7) as specified; model on
  `storage.rs:656-667` (`memory_storage_rejects_traversal`) and
  `watch.rs:198-215`.
- New contract test in `tests/workspace_contract.rs`: create a real Workspace,
  add a Note, reopen, assert body round-trips — this exercises
  `join_relative`/`simplify_canonical` through the real path. Model on the
  existing create/open tests near the top of that file.
- Verification: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` → all pass, including ≥5 new tests.

## Done criteria

- [ ] `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` all exit 0
- [ ] `grep -n "self.root.join(" apps/desktop/src-tauri/src/workspace/storage.rs` → no matches
- [ ] `grep -n "fs::canonicalize" apps/desktop/src-tauri/src/workspace/storage.rs apps/desktop/src-tauri/src/workspace/watch.rs` → exactly one match, inside `simplify_canonical`
- [ ] `grep -n "cfg(unix)" apps/desktop/src-tauri/src/preferences/storage.rs` → ≥2 matches (fsync gate and mode)
- [ ] `relevant()` in `watch.rs` contains no `starts_with("notes/")`, `"backups/"`, or `split('/')`
- [ ] `bun run typecheck && bun run test` exit 0
- [ ] `git status --short` shows only in-scope files
- [ ] `plans/README.md` status row for 021 updated

## STOP conditions

- The excerpts in "Current state" do not match the live code.
- Making both sides of a `starts_with(&self.root)` comparison use the
  simplified form causes `real_storage_rejects_symlink_escapes` or any
  `workspace_contract` traversal test to fail — do not weaken the guard; report.
- The fix appears to require changing `recovery.rs`, `migration.rs`, or the
  transaction record format.
- `bun run typecheck` fails for a reason unrelated to the new message key.

## Maintenance notes

- Plan 022 adds the Windows/Linux CI matrix; expect its first Windows run to
  reveal anything this plan missed (record it in the plan's status row rather
  than patching CI around it).
- Any new storage method must accept `/`-relative strings and go through
  `join_relative`; reviewers should reject `root.join(<str with '/'>)`.
- Windows ACL hardening (an equivalent of `0o600`) is deliberately deferred:
  workspace confidentiality on Windows relies on the parent directory ACL under
  `%USERPROFILE%`. Record this in `docs/PRIVACY.md` if the operator wants it
  disclosed.
- Deferred, low value: `validate_uuid` (`model.rs:324-333`) accepts uppercase
  UUIDs, which diverge on case-insensitive filesystems; only reachable via a
  hand-edited manifest.
