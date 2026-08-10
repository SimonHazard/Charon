# Platform capture support

This document is the evidence ledger for ADRs 0002, 0006, 0008, 0009, 0010,
and 0011. A capability is `supported` only after the exact final build passes
its complete physical matrix. Runtime capability reporting remains
authoritative.

## Current support state

| Platform | Portable composer focus | Modifier capture | Selected-text acquisition | Product status |
| --- | --- | --- | --- | --- |
| macOS 14+ | `CmdOrCtrl+Shift+Space` global activation passed in Plan 007; ADR 0011 retargets it to the bottom composer and requires regression evidence after implementation | Native passive unmodified double-Shift listener passed the final physical gesture and false-positive matrix | AX-first hybrid adapter with ADR 0010's bounded Copy fallback passed the final physical matrix | Development capture support is proved. Plan 012 repeats the refactored physical matrix; Plan 015 repeats it on the stable Developer ID signed and notarized artifact before release advertising. |
| Linux X11 | Pinned Tauri implementation compiles; physical global-activation evidence remains required | Not implemented | Not implemented | Visible bottom composer is supported by the product contract; global and modifier-only claims remain unproved. |
| Linux Wayland | Compositor and portal dependent; no local global-activation evidence | No universal modifier-only protocol accepted | Not implemented | Visible bottom composer only; no modifier-only claim. |
| Windows | Pinned Tauri implementation compiles; no signed Windows evidence | Not implemented | Not implemented | Visible bottom composer is supported by the product contract; global and modifier-only claims remain unproved. |

The macOS fallback does not create a Linux or Windows support claim. Each target
needs its own accessibility, input, clipboard, focus, permission, and signed-
build evidence before promotion.

The current bundle identity is `dev.simonhazard.charon`. It replaces the
pre-release `dev.charon.app` identifier because Tauri 2 warns against bundle
identifiers ending in `.app`. The Plan 007 evidence below remains historical
development evidence only; its TCC grants do not transfer to the new identity.

## macOS evidence collected during Plan 007

Environment first recorded on 2026-07-31 and finally accepted on 2026-08-04:

- macOS 26.5 (25F71), arm64;
- Tauri CLI 2.11.4 and Rust crate 2.11.5;
- bundle identifier `dev.charon.app`;
- final executable SHA-256
  `e8eb9b9ff4ad2b1d21078bb5544f2e434202ab19f27ade0af3d9b416afc8e5ce`;
- ad-hoc hardened-runtime signature, designated requirement
  `cdhash H"c5466d22ef54932d38a6ba5a9792559f32b9c3f0"`;
- `codesign --verify --deep --strict` passed for the final debug bundle;
- the build output was copied byte-for-byte to `/Applications/Charon.app` for
  TCC testing; the installed executable retained the same SHA-256, designated
  requirement, and valid signature.

### Permission and gesture findings

- ADR 0008 keeps the product capabilities separate:
  `CGPreflightListenEventAccess` gates the passive listener, while
  `AXIsProcessTrusted`/`AXIsProcessTrustedWithOptions` separately gate selected-
  text acquisition.
- The explicit Input Monitoring action uses the public
  `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` API. This symbol and request
  type were verified in the installed macOS 26 SDK after
  `CGRequestListenEventAccess` failed to register the ad-hoc bundle reliably.
- Each ad-hoc rebuild changed the designated requirement. Only the exact
  `Accessibility` and `ListenEvent` decisions for `dev.charon.app` were reset
  after those identity changes; no broad TCC reset was used. On this macOS 26.5
  host, the final Input Monitoring grant still required the documented manual
  `+` flow for the byte-identical app installed in `/Applications`.
- TCC and Charon's localized permission state both confirmed Input Monitoring
  and Accessibility before the final matrix. Charon was restarted once after
  the grant so the passive listener could register.
- Direct AX acquisition physically worked in TextEdit/AppKit and the editable
  Chrome URL field.
- Static selected text in a Chrome page and selected Codex conversation text did
  not create a note through the public AX ladder. Increasing the parent walk
  from 32 to 128 and adding pointer hit-testing did not make those cases pass.
- The accepted response is ADR 0010's bounded synthetic source Copy transaction,
  not a deeper tree scan, a private API, another TCC permission, Electron, or a
  privileged helper.

### Accepted acquisition implementation

The accepted macOS adapter:

1. try ADR 0009's bounded public Accessibility ladder first;
2. only after a no-selection result, snapshot the complete current pasteboard
   within Plan 007's bounds;
3. post one public Command-C to the unchanged foreground application;
4. read only a newly produced text value within the bounded timeout;
5. restore the snapshot only while the pasteboard still has the transaction-
   owned change count;
6. skip restoration rather than overwrite a concurrent clipboard write;
7. never post Paste, monitor clipboard history, log content, or steal focus.

The transient clipboard value may be visible to an installed clipboard manager.
That limitation is disclosed in `docs/PRIVACY.md` and is part of the release
acceptance, not something the implementation can guarantee away.

## Final macOS acceptance matrix

Every row passed physically on 2026-08-04 against the one final debug
executable identified above. The tester reported every required case as
`PASS`. Charon exposes no acquisition-path diagnostic, by design, so paths are
recorded only where prior direct evidence plus the AX-first invariant proves
them; the remaining application-family rows record the accepted hybrid result
without adding content instrumentation.

| Case | Final result | Acquisition or observation |
| --- | --- | --- |
| Fresh launch opens or safely creates the visible default Workspace | Passed | Visible default Workspace opened safely |
| Portable accelerator activates Charon from another app | Passed for the Plan 007 surface | ADR 0011 now requires reveal plus bottom-composer focus; Plan 012 must verify that refactored target |
| False-positive gestures do not trigger | Passed | Shift+letter, repeat, hold, mixed Shift, Command change, and three taps were no-ops |
| Empty selection creates nothing | Passed | No note and no Charon surface |
| TextEdit/AppKit selection creates one note and leaves clipboard unchanged | Passed | Direct AX, proved before the hybrid fallback and preserved by AX-first ordering |
| Chrome URL field creates one note | Passed | Direct AX, proved before the hybrid fallback and preserved by AX-first ordering |
| Static Chrome page selection creates one note, preserves focus, and restores text clipboard | Passed | Bounded Copy; the direct AX ladder was previously proved to return no selection |
| Codex conversation selection creates one note, preserves focus, and restores clipboard | Passed | Bounded Copy; the direct AX ladder was previously proved to return no selection |
| Safari/WebKit static text | Passed | AX-first hybrid path; exact branch intentionally not surfaced |
| VS Code/Cursor editor text when installed | Passed | AX-first hybrid path; exact branch intentionally not surfaced |
| Preview PDF text | Passed | AX-first hybrid path; exact branch intentionally not surfaced |
| Rich/multi-item pasteboard restores exactly | Passed | Complete item/type snapshot restored |
| Concurrent clipboard write is never overwritten | Passed | Concurrent marker remained authoritative |
| Unchanged, blocked, or slow Copy creates nothing safely | Passed | Bounded no-op |
| Secure field and canvas-only source create nothing | Passed | Secure/inaccessible no-op |
| Clipboard-manager disclosure matches observed behavior | Passed | Transient selection may be observed; Charon retains no history |
| Manual capture input creates one note and preserves failure text | Passed for the Plan 007 surface | One versioned Workspace command; Plan 012 must repeat against the bottom composer |
| Restart registers one listener, worker, and accelerator | Passed | One action per gesture after restart |

Ad-hoc debug evidence is development-only. Plan 012 must repeat the matrix after
the single-shelf refactor, and Plan 015 must repeat it on the stable Developer ID
signed and notarized artifact before macOS capture is advertised as release-
supported.

## References

- [ADR 0010](adr/0010-bounded-copy-selection-fallback.md)
- [ADR 0011](adr/0011-rapid-capture-product.md)
- [Tin SelectionCapture.swift](https://github.com/enzofrasca/tin/blob/main/Tin/Services/SelectionCapture.swift)
- [Apple DTS Input Monitoring request guidance](https://developer.apple.com/forums/thread/828052)
- [Apple Accessibility trust API](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [Apple NSPasteboard changeCount](https://developer.apple.com/documentation/appkit/nspasteboard/changecount)
- [Apple CGEvent posting](https://developer.apple.com/documentation/coregraphics/cgevent/post(tap:))
- [Tauri global shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
