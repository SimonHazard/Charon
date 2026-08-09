# Charon desktop assets

Source root: `/Users/simonhazard/Documents/Codex/2026-07-31/j-aimerais-faire-un-logo-partir-2/outputs/charon-brand-kit-final/`.

These files are app-owned copies. Do not import them from the site or move them
into `@charon/theme`. The absolute source path is reproducibility documentation
only and must never enter the product UI, diagnostics, or generated metadata.

| Local file | Source file | SHA-256 | Usage |
|---|---|---|---|
| `charon-app-icon.svg` | `svg/charon-app-icon.svg` | `4d6874a7fbb883652321d2ae3a4da373606382ed9fee1c1a291e60024ef05dbc` | Canonical native-app icon artwork reference. |
| `charon-icon-lavender.svg` | `svg/charon-icon-lavender.svg` | `54dfbefe7e8900315ecacaa095b5813790df69a771df1eb3da9c5b072b62f785` | Standalone icon on neutral or dark surfaces. |
| `charon-icon-dark.svg` | `svg/charon-icon-dark.svg` | `e1b28047e915c483bcb53918c9770608239efa1a1bc235d41fc168886c6d0283` | Standalone icon for light surfaces. |
| `charon-icon-light.svg` | `svg/charon-icon-light.svg` | `a756df75f47e6aa094a6f02f11f3a4e1184c8a92a6352f817f7cf01ba0213758` | Standalone icon for prune surfaces. |
| `charon-wordmark-color.svg` | `svg/charon-wordmark-color.svg` | `312bc0ef2f5ec7ac90ba5306f20c6bf05af143ede6d06ef9602ca7b2cc75abc7` | Primary wordmark on light and Solarized surfaces. |
| `charon-wordmark-reversed.svg` | `svg/charon-wordmark-reversed.svg` | `9b506740e53ce12545799ebb019c251b9b7db88d4e0dbc250a1cdcd50cf858f1` | Reversed wordmark on prune or dark surfaces. |
| `../../../src-tauri/icons/charon-app-icon-1024.png` | `favicon/charon-app-icon-1024.png` | `301bd102040763a2d33460f6433d483831d9fff5433fb0405a17ba05b550dea6` | Archived square master render. |
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
