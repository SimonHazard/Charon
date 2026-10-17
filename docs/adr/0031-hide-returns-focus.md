# ADR 0031: Hiding returns focus, and the composer shortcut toggles

## Status

Accepted on 2026-10-17 by operator decision. Amends ADR 0023's macOS close
behaviour and ADR 0025's composer shortcut, which now also hides Charon when
it is frontmost.

## Context

Charon is used in short visits: reveal it, write or copy, go back to the
application in front of it. On macOS, closing Charon's window hid only the
window, so the application stayed active with no window and the user had to
click back into their previous app.

## Decision

1. `ipc::shell::hide_main` hides Charon so the previous application gets focus
   back, by platform:
   - **macOS**: hide the application (`NSApplication hide:`), which
     reactivates the last application. Revealing unhides it first.
   - **Windows with the background-mode icon** (ADR 0023): hide the window.
   - **Everywhere else**: minimize the window, because a hidden window needs
     the icon to come back.
2. Closing the main window on macOS hides the application through it.
3. The composer shortcut toggles: while Charon's window has focus, the
   shortcut hides Charon; otherwise it reveals Charon and focuses the composer
   as before.
4. Escape hides Charon when nothing else consumes it: no open dialog, popover,
   menu, or editor, no search query, and no IME composition. Escape keeps its
   first job everywhere else (closing the topmost surface, clearing search).
5. The command menu's Hide Charon calls the same path through the
   `shell_hide` command.

Hiding never closes the window, an editor, or a draft, and capture stays
armed.

## Alternatives rejected

- **Hiding the window everywhere**: on Windows without the icon, and on Linux,
  a hidden window would have no visible way back.
- **A separate hide shortcut**: ADR 0025 allows one configurable shortcut;
  toggling it is how launcher-style tools such as Spotlight behave.

## Consequences

- Escape at the shelf's root now hides Charon instead of doing nothing.
- Pressing the composer shortcut while typing in Charon hides it.

## Revisit when

Revisit if users report losing their place after an accidental Escape, or if
a platform reactivates the wrong application after hiding.
