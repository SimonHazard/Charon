# Testing Charon

## Local checks

Use the smallest checks relevant to a change:

```sh
bun run check
bun run build
bun run test:e2e
bun run check:privacy
bun run test:perf
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

`bun run verify:release` remains the exhaustive local convenience gate. It is
not required twice, and its full browser/performance matrix is not a release
ceremony. The automatic release workflow keeps the deterministic checks that
protect version consistency, compilation, updater signatures, privacy, data
safety, and complete release assets.

Quality runs for pull requests and remains manually dispatchable; Security
remains manual. Protected `main` updates deploy the site and evaluate the
desktop manifest version. A new consistent version starts the macOS, Linux, and
Windows release matrix, while an already-published version exits without
rebuilding. Separate portability and unsigned review-build workflows would
duplicate the most expensive jobs without strengthening the release boundary.

Use Quality once when a release candidate needs GitHub-hosted confirmation. Use
Security after dependency changes or as an occasional explicit audit. Deploy
the site only when its public content changes. Routine pushes consume no Actions
minutes.

## Deterministic browser fixture

Desktop E2E tests use `/?fixture=demo`, a synthetic Workspace. Fixture Notes,
Tags, Attachment names, paths, and timestamps never touch a real Workspace and
are removed from the production bundle.

The fixture proves React behavior, layout, focus, drafts, copy composition, and
error states. It cannot prove native IPC, operating-system permissions, global
shortcut delivery, selected-text access, clipboard restoration, file pickers,
window lifecycle, first-launch warnings, or installed updater behavior.

## Native and updater validation

Pure and mocked tests cover boundaries that could lose data or violate privacy:

- Workspace transactions, migration, recovery, watcher behavior, permanent
  deletion, managed Attachments, and path containment;
- double-Shift gesture timing, duplicate suppression, permission denial, bounded
  acquisition, clipboard ownership, and no-Paste behavior;
- deterministic `Copy as Markdown` output;
- updater disabled/no-update/available/error states, signature enforcement, and
  dirty-draft restart deferral;
- cross-manifest version consistency and complete release-asset metadata.

Native use by the operator and users supplies compatibility feedback. Windows
and X11 capture begin as experimental after implementation; Wayland never claims
double Shift. Reports become ordinary issues and patch releases. A report must
not include selected content, clipboard data, Note content, or Workspace paths.

## Historical evidence

The macOS adapter has development evidence for Input Monitoring and
Accessibility separation, false-positive handling, public Accessibility
selection, ADR 0010's bounded Copy fallback, focus preservation, and concurrent
clipboard changes. That evidence informs the current contract but is not rerun
as an exhaustive matrix before every side-project release.

Measured search runs with 20,000 Notes remained within the checked performance
budget. The exact implementation milestones and commit references live in
[`IMPLEMENTATION_HISTORY.md`](IMPLEMENTATION_HISTORY.md).
