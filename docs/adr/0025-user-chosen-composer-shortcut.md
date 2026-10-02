# ADR 0025: One user-chosen composer shortcut

## Status

Accepted on 2026-10-02 (operator asked to complete the plan queue); native
spike evidence pending operator verification. Narrows the `docs/PRODUCT.md`
non-goal "configurable shortcut catalog" to permit exactly one user-chosen
accelerator, and amends ADR 0011 Decision 12, ADR 0015 (the Windows/X11
composer accelerator becomes a default), `AGENTS.md`, `docs/UX.md`,
`docs/ARCHITECTURE.md`, `docs/PRIVACY.md` (preferences contents), and
`docs/platform-support.md`.

## Context

The reveal-and-focus-composer accelerator is hardcoded: `Cmd+Shift+Space` on
macOS and `Alt+Shift+Space` on Windows and X11. When another application or
the desktop already owns that combination, the shortcut silently fails (or, on
macOS, silently loses to the other owner) and the user cannot pick another
one. `docs/FEATURE_BACKLOG.md` asks for choosing it in Preferences with
validation, conflict handling, reset to default, and honest per-platform
limits.

ADR 0011 removed a shortcut catalog on purpose, and `docs/PRODUCT.md` lists a
"configurable shortcut catalog" as a non-goal. The need is narrower: one
accelerator for one action, with a safe way back to the default.

Charon registers the accelerator through the official
`tauri-plugin-global-shortcut` (`=2.3.2`, backed by `global-hotkey 0.8.0`).
Its `register` and `unregister` parse the string, then run the operating-system
call on the main thread and wait for it. Errors collapse into one string-typed
error. Conflict reporting differs by platform: Windows `RegisterHotKey` and X11
`XGrabKey` report a combination already held by another application, while
macOS `RegisterEventHotKey` is called without exclusivity and succeeds even
when the system or another application uses the combination. On Wayland the
GlobalShortcuts portal binds a session's shortcuts once and the desktop owns
the trigger.

## Decision

1. On macOS, Windows, and Linux X11 the user may replace the one
   reveal-and-focus-composer accelerator from Preferences and reset it to the
   platform default at any time. The choice is stored per machine in native
   preferences as `composerShortcut` (schema v1, `#[serde(default)]`; `null`
   or absent means the default). Nothing else is configurable.
2. Double Shift, every in-app key (`CmdOrCtrl+F`, Escape, editor and Note
   keys), and the Wayland portal's trigger are unchanged. This is not a
   shortcut catalog and adds no in-app shortcut map.
3. Rust (`capture::shortcut`) validates every value deterministically and
   returns content-free errors; the webview only records the pressed keys and
   pre-screens the same two-modifier floor so it can keep recording. The rules:
   ASCII, at most 64 bytes, `+`-separated tokens without empty ones; modifiers
   `Cmd`/`Command`/`Super`/`Meta` (stored as `Cmd` on macOS, `Super`
   elsewhere), `Ctrl`/`Control`, `Alt`/`Option`, `Shift`, and
   `CmdOrCtrl` (`Cmd` on macOS, `Ctrl` elsewhere), each at most once; exactly
   one final key among `A`-`Z`, `0`-`9`, `Space`, and `F1`-`F24` (`F1`-`F20`
   on macOS, whose backend maps no key beyond); at least two distinct
   modifiers.
   The canonical form orders modifiers `Cmd`/`Super`, `Ctrl`, `Alt`, `Shift`.
4. A reserved list, compared after normalization, refuses combinations the
   system or common editing commands use: macOS `Cmd+Shift+3`, `Cmd+Shift+4`,
   `Cmd+Shift+5`, `Cmd+Shift+Z`, `Cmd+Ctrl+Q`, `Cmd+Ctrl+Space`; Windows
   `Ctrl+Shift+Z`, `Super+Shift+S`; X11 `Ctrl+Shift+Z`, `Ctrl+Alt+T`,
   `Ctrl+Alt+L`. The list is a policy constant: changing it needs a unit-test
   update and a note here, not a new ADR.
5. A change registers the new accelerator **before** releasing the previous
   one. If registration fails, the previous accelerator stays active and
   untouched and Preferences shows a content-free conflict error; if releasing
   the previous one fails, the new one is released again. A change is stored
   only after it registered; if storing fails, the previous accelerator is
   registered again. Choosing the active accelerator again changes nothing,
   and choosing the default's keys is a reset.
6. At launch, a stored accelerator that fails validation or registration falls
   back to the platform default, and Preferences says so until the user
   chooses again or resets. A Wayland session ignores, but keeps, a value
   stored by an X11 session on the same machine.
7. Conflict detection is honest: Windows and X11 report an accelerator already
   held by another application; macOS cannot, so Preferences says plainly that
   Charon cannot detect every shortcut used by macOS or other applications.
8. Letters and digits are stored by physical key position (`event.code`), as
   the shortcut backends register them. On non-QWERTY layouts the displayed
   letter may differ from the keycap; this is a documented limitation.
9. On Wayland, Preferences shows the portal-assigned shortcut and says to
   change it in the desktop's keyboard settings; Charon offers no Change
   button.
10. The change runs on the main thread, where the plugin registers and where
    macOS and Windows deliver key presses. X11 and the Wayland portal deliver
    presses on their own threads, so Charon handles every press on the main
    thread too: a press never waits for a change that is itself waiting for the
    press's thread.

## Spike evidence

Observed on the operator's Apple Silicon Mac (macOS 26.6.2), in the working
tree, without `tauri build`, without system permission prompts, and without
writing the operator's preferences:

| Check | Result |
| --- | --- |
| Plugin and backend source (`tauri-plugin-global-shortcut 2.3.2`, `global-hotkey 0.8.0`, `tauri-runtime-wry 2.11.4`) | `register`/`unregister` run on the main thread through `run_on_main_thread` and a blocking receive, inline when already on the main thread. The key handler holds the plugin's shortcut map lock while it calls Charon. macOS delivers presses through a Carbon handler on the main thread, Windows through a message window on the main thread, and X11 on the backend's own event thread, which also performs registrations |
| Conflict reporting (backend source) | Windows maps `ERROR_HOTKEY_ALREADY_REGISTERED` to `AlreadyRegistered`; X11 maps `BadAccess` to `AlreadyRegistered`; macOS fails only when `RegisterEventHotKey` returns an OS error. All reach Charon as one string error, mapped to `shortcut_conflict` |
| macOS backend probe (a throwaway `global-hotkey 0.8.0` binary in the session scratchpad, each registration undone at once) | Register `CmdOrCtrl+Shift+Space`, then `Ctrl+Alt+N` before releasing it, then re-register the default: all `Ok`. `Cmd+Space` (Spotlight), `Cmd+Shift+3` (screenshot), `Cmd+Ctrl+Q` (lock screen), and `Cmd+Ctrl+Space` (character viewer) all returned `Ok`, so macOS cannot report conflicts with the system or other applications. The same combination twice in one process fails. `Cmd+Ctrl+F20` registers; `Cmd+Ctrl+F21` fails with "Unknown scancode" |
| One `tauri dev` launch (port 1421 through a CLI `--config` override because another project held port 1420; temporary instrumentation, removed afterwards, drove the coordinator through the same worker-to-main-thread path as `capture_set_shortcut` without storing anything) | At launch with the operator's preferences (no stored choice): `CmdOrCtrl+Shift+Space`, available, origin default. Change to `Ctrl+Alt+F19`: registered through the plugin, previous released, origin custom, 4 ms; the same value again: no-op; `Cmd+Shift+3`: `shortcut_reserved`; `Cmd+F`, `Cmd+Ctrl+F21`, and `Cmd+Space`: `invalid_shortcut` before reaching the plugin; reset: default registered again, origin default. A press dispatched to the main thread completed in 5 ms. No deadlock and no panic; `removeUnusedCommands` stripped the plugin's four webview commands, not `capture_set_shortcut` |
| A real key press of the new combination reveals Charon; the old one no longer does; the choice survives a relaunch; a hand-edited `"composerShortcut": "Cmd+F"` shows the fallback warning | not tested: needs key presses and the operator's real preferences (operator to verify) |
| Windows: runtime re-registration and a combination held by another application returning an error | not tested: no Windows hardware (operator to verify) |
| X11: same as Windows, and a press during a change | not tested: no Linux machine (operator to verify) |
| Wayland | nothing to change: the portal owns the trigger (Decision 9) |

## Consequences

- `CaptureCapabilities` gains `defaultShortcut`, `shortcutOrigin` (`default`,
  `custom`, `defaultAfterFailure`, `desktop`), and `shortcutConfigurable`. The
  active accelerator keeps the exact default string for users who never chose
  one. The app manifest, capability, and `generate_handler!` gain
  `capture_set_shortcut` (20 custom commands); the dormant `InvalidShortcut`
  error has a producer again, and `ShortcutReserved`,
  `ShortcutNotConfigurable`, and `ShortcutConflict` are new content-free
  errors.
- Help and Preferences display the active accelerator, default or chosen.
  `preferences_reset` also restores the default accelerator at once.
- On X11 and Wayland a composer press is now handled on the main thread, as it
  already was on macOS and Windows.
- As with ADRs 0023 and 0024, a manual downgrade to a build without the field
  treats the preferences file as corrupt, backs it up, and falls back to
  defaults; the updater never downgrades.
- Linux and Windows code paths are compiled and tested on CI only; this
  decision was implemented and observed on macOS.

## Revisit when

- An official plugin release reports conflicts on macOS or typed errors.
- The Wayland portal's `ConfigureShortcuts` (interface version 2) becomes
  widely available; a "Change in system settings" button could call it.
- A second configurable action is requested: that would be the catalog ADR
  0011 removed and needs its own ADR.
- The operator's native checks contradict a row above.
