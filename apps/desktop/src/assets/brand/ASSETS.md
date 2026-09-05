# Charon desktop assets

The desktop keeps only the canonical artwork used to generate native icons.
Web UI marks and wordmarks were removed with the in-shelf logo. Do not import
site-owned copies or move artwork into `@charon/theme`.

| Local file | Source file | SHA-256 | Usage |
|---|---|---|---|
| `charon-app-icon.svg` | `svg/charon-app-icon.svg` | `4d6874a7fbb883652321d2ae3a4da373606382ed9fee1c1a291e60024ef05dbc` | Canonical native-app icon artwork reference. |
| `../../../src-tauri/icons/charon-native-app-icon.svg` | Local native wrapper | `e31ad12c5c7e53105377c4dfc8ca2d7b9f1eca9ffd7b5783f11126219936cc87` | Sole input to the pinned Tauri icon generator. |

`src-tauri/icons/charon-native-app-icon.svg` wraps the approved app artwork in
a platform-safe rounded container with transparent outer corners. It does not
redraw or alter the approved Charon glyph. The pinned generator produces the
desktop, AppX, iOS, and Android icon families from this one source.

Regenerate native outputs from the desktop workspace with:

```sh
bun run tauri icon src-tauri/icons/charon-native-app-icon.svg
```

Never hand-edit the generated PNG, ICO, or ICNS files.
