# ADR 0023: Opt-in background mode with a menu bar or notification area icon

## Status

Accepted on 2026-10-02 (operator asked to complete the plan queue); native
spike evidence pending operator verification. Amends `docs/PRODUCT.md` (a new
job and journey), `docs/UX.md` (close semantics and Preferences contents),
`docs/PRIVACY.md` (preferences contents and listener lifetime),
`docs/ARCHITECTURE.md`, and `AGENTS.md` (one UI bullet). Builds on plan 039's
window lifecycle (`reveal_main`, macOS close-to-hide, the editor close guard).

## Context

`docs/FEATURE_BACKLOG.md` asks for an opt-in mode in which closing the window
hides Charon while the process, and therefore double-Shift capture, keeps
running, with a visible icon and an explicit Quit. Before this decision,
closing the window quit Charon on Windows and Linux and stopped capture; macOS
already hid on close (plan 039) but showed no menu bar icon. The backlog
forbids any implicit capture or action, and the mode must stay local,
explicit, and reversible. Above all it must never strand the user with a
hidden window and no way to reopen or quit it.

Tauri 2.11.5 ships an official tray API behind its `tray-icon` Cargo feature
(`tray-icon 0.24`). On Linux that crate loads `libayatana-appindicator3` or
`libappindicator3` lazily and panics when neither library can be opened; even
with the library present, an icon is visible only when a StatusNotifier host
owns `org.kde.StatusNotifierWatcher` (stock GNOME needs an extension). Proving
a Linux probe that never reports a false "available" needs GNOME and KDE, X11
and Wayland, with and without the library, which this release does not have.

## Decision

1. Background mode is opt-in, **off by default**, stored as `backgroundMode` in
   native preferences (schema v1, `#[serde(default)]`), and switchable at any
   time in Preferences.
2. On **macOS and Windows**, enabling it shows one Rust-owned icon built with
   Tauri's official `tray-icon` feature. Cargo enables that feature only for
   macOS and Windows targets. Its glyph is the app icon from
   `default_window_icon()`, used as is: a template image of the full-colour
   square icon would render as a solid silhouette, and no monochrome glyph
   exists yet. The menu holds only "Open Charon" and "Quit Charon". On macOS a
   click shows the menu (menu bar convention); on Windows a left click reveals
   Charon and a right click shows the menu.
3. Closing the window hides Charon **only while that icon exists**, except on
   macOS, which keeps plan 039's close-to-hide with or without the icon and
   keeps its Dock icon. If the icon cannot be built, background mode stays
   inactive, closing keeps quitting on Windows, and Preferences says so.
4. **Linux: unavailable in this release.** No tray is compiled or created on
   Linux, closing keeps quitting, and Preferences shows a disabled toggle with
   the visible reason. No AppIndicator package hint is added. The runtime
   snapshot reports `trayAvailability: unavailable` there.
5. Quit is always explicit (the icon menu, Preferences' Quit Charon while the
   mode is active, `Cmd+Q` on macOS) and draft-safe like the updater restart:
   the icon's Quit and `Cmd+Q` ask the webview, which saves an open editor
   first. Composer text, a failed save, or a drawing with unsaved strokes keeps
   Charon running and revealed, with a warning toast and the protected text (or
   the drawing's discard prompt) in view. A 10 s watchdog exits only if the
   webview never answers, and a second request while it answers waits for it.
   On macOS, `Cmd+Q` is the app menu's Quit item: Charon keeps Tauri's default
   menu and replaces only that item with one of the same title and shortcut
   (amended 2026-10-02, see Consequences).
6. No capture, Copy, Paste, notification, or other action becomes implicit.
   The icon exposes no Note content, count, or status, and adds no network
   request.
7. All labels come from Paraglide: React sends "Open Charon", "Quit Charon",
   and the tooltip through `shell_set_labels`, again on a language change. Rust
   hardcodes no UI copy, and the webview receives no `core:tray` or `core:menu`
   permission; only the app-manifest permissions of the four new custom
   commands (`preferences_set_background_mode`, `shell_set_labels`,
   `shell_quit`, `shell_cancel_quit`).

## Spike evidence

Observed on the operator's Apple Silicon Mac (macOS 26.6.2), in the working tree,
without `tauri build` and without system permission prompts:

| Check | Result |
| --- | --- |
| `cargo tree -i tray-icon` for macOS (host), `x86_64-pc-windows-msvc`, and `x86_64-unknown-linux-gnu` | present for macOS and Windows; absent for Linux, so no `libappindicator` code is compiled there |
| `Cargo.lock` after enabling the feature | unchanged (`tray-icon 0.24.2`, `libappindicator 0.9.0`, `libloading 0.7.4` were already locked) |
| `tauri-build` feature check | passes: it ignores `tray-icon` and the config declares no `app.trayIcon` |
| Tray API (`TrayIconBuilder`, `MenuItem::set_text`, `TrayIcon::set_visible`, `default_window_icon`) | compiles; `cargo clippy --all-targets -D warnings` and `cargo test` pass on macOS |
| `bun run tauri:dev` with the feature enabled (background mode off, the default) | built and launched; the app was still running after about 30 s and the log shows no panic; `removeUnusedCommands` stripped every JS `tray` and `menu` plugin command. The window and the labels round trip were not observed (no screen inspection) |
| Tauri CLI 2.11.4 manifest rewrite during `tauri dev` | the CLI rewrote `Cargo.toml` (it normalised one whitespace typo) and kept the target-only `tray-icon` feature |
| Windows cross-check (`x86_64-pc-windows-gnu`) | not run: the installed target has no usable standard library for this toolchain, and installing one needs a download |
| macOS menu bar icon, click menu, Open reveals and focuses, Quit paths, hidden double-Shift capture | not tested: needs a bundled app and enabling the mode in the operator's real preferences (operator to verify) |
| `Cmd+Q` through the replaced app menu item with a dirty composer, an open dirty editor, and a clean shelf; the item's title, position, and shortcut | compiled and unit-tested (`quit_step`); not observed natively (operator to verify) |
| Windows notification area icon, left-click `Up` reveal, right-click menu, Quit paths, second launch while hidden | not tested: no Windows hardware (operator to verify) |
| Linux | not tested and not shipped: no tray is created (Decision 4) |
| Release binary size delta | not measured: needs `tauri build` (operator to verify) |

## Consequences

- `PreferencesSnapshot` gains `backgroundMode` (persisted) plus the runtime-only
  `trayAvailability` and `backgroundActive`. A manual downgrade to a build
  without `backgroundMode` treats a file that contains it as corrupt, backs it
  up as `preferences.corrupt-*.json`, and falls back to defaults; the updater
  never downgrades.
- The tray is built once per process and then only shown or hidden, so its
  menu handler is registered once. Background mode becomes active on launch
  only after the webview sends its labels; until then a Windows close still
  quits.
- The editor's close handler never destroys a window that background mode
  hides, and the editor's draft guard now also refuses while a drawing holds
  unsaved strokes.
- `Cmd+Q` on macOS runs the draft guard (amended 2026-10-02 after review: the
  first version left Tauri's default Quit item, which sends AppKit's
  `terminate:`). With Tauri 2.11.5 and tao 0.35.3 that path emits no
  preventable event: tao implements no `applicationShouldTerminate:`, so
  `applicationWillTerminate:` becomes `RunEvent::Exit` directly, and Tauri
  sends `RunEvent::ExitRequested` without a code only after the last window
  was destroyed. Charon therefore replaces the menu item instead of guarding
  an exit request. AppKit's other terminate paths (the Dock menu's Quit,
  logging out, restarting) still quit at once; an open editor's autosave and
  the composer's unsent text are then unprotected, as before.
- Start at login, start hidden, hiding the macOS Dock icon, and a monochrome
  template glyph remain separate decisions.

## Revisit when

- A Linux spike proves a StatusNotifier probe on GNOME (with and without the
  AppIndicator extension) and KDE Plasma, on X11 and Wayland, never reports a
  false "available", and finds no crash path once the probe gates creation.
- A Tauri release adopts `tray-icon`'s pure-Rust `ksni` backend (no
  `libappindicator`), which would remove the library hazard.
- The operator's native checks contradict a row above, or a monochrome glyph
  is designed.
- tao implements `applicationShouldTerminate:` (or Tauri exposes it), which
  would let the Dock menu's Quit and logging out run the draft guard too.
