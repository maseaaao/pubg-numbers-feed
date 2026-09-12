# PUBG Numbers Feed

100 numbered killfeed team icons for **PUBG: BATTLEGROUNDS** — big, high-contrast team digits in distinct colors, readable on any background at any killfeed size.

![All icons](preview/preview.png)

## Why numbers

Flags require memorizing 100 flag-to-team mappings. Numbers don't: the team digit is the icon. Each team gets its own color so entries can be told apart at a glance, while the digit itself stays the primary identifier.

## Features

- **100 icons** (`001.png`–`100.png`) covering squads, duos and solos
- **Oxanium ExtraBold (800)** squared esports digits, auto-fitted per digit count so 1-, 2- and 3-digit numbers all fill the icon
- **Distinct color per team** — hues stepped by the golden angle (137.5°), so neighboring team numbers never share a hue
- **WCAG auto-contrast** — digit color (white / near-black) picked per background via relative luminance
- **Bordered digits** — every digit carries a high-contrast outline, so it stays readable on busy backgrounds and on any team color
- **Lightweight** — palette-quantized PNGs, ~0.5 KB per icon
- **Observer-ready** — `Teaminfo.csv` and folder layout match what the game expects

![Small size check](preview/small-size.png)

## Install (into the game)

1. Get the repo (clone, or download a [release](../../releases) zip and unzip it)
2. Open Windows Explorer and paste into the address bar:
   ```
   %LOCALAPPDATA%\TslGame\Saved
   ```
3. Copy the `Observer` folder there. It should contain `TeamIcon` and `Teaminfo.csv`
4. Play

## Build from source

Requires Node.js 24+. `node-canvas` is the only npm dependency (font rasterization); PNG encoding and zip packaging are built in-repo on top of `node:zlib`, and every generated icon passes a decode roundtrip check (worst channel deviation from nearest-palette quantization is capped at 16/255) before it is written.

```bash
npm install
npm run generate
```

Outputs:

- `Observer/` — icons + `Teaminfo.csv` (paste this into the game)
- `preview/` — contact sheets
- `dist/pubg-numbers-feed-v<version>.zip` — ready-to-share archive with the `Observer` folder

Tweak `COUNT`, `SIZE` or the palette in `teamColor()` inside `src/generate.js` and re-run.

## Typography

[Tektur](https://fonts.google.com/specimen/Tektur) by [The Tektur Project Authors](https://github.com/hyvyys/Tektur) — ExtraBold (weight 800), auto-sized up to 76 px on the 64 px canvas. Each icon is a full-canvas rounded chip (8 px radius) with transparent corners — the killfeed renderer respects alpha, matching how flag icons behave — and digits fill 85–95% of the usable space depending on digit count. Glyphs are laid out per-character with 0.06 em tracking so multi-digit numbers never fuse together.

**Stretched resolutions (16:10 on 16:9 panels) are accounted for:** the layout keeps ~10% headroom and relies on the heavy 800 weight, so counters of `0`, `6`, `8`, `9` stay open and digits remain fully legible under the ~11% non-uniform scaling. The font is bundled in `src/assets/fonts/` under the [SIL Open Font License 1.1](src/assets/fonts/Oxanium-OFL.txt).

## Credits

- Install flow and `Observer` layout follow [nitnat/pubg-flagfeed](https://github.com/nitnat/pubg-flagfeed), the project that inspired this one
- Original custom killfeed icon idea: [Kowo](https://youtu.be/8OWbQ_wXhpk)

## License

- Code and generated icons: [MIT](LICENSE)
- Bundled font (`src/assets/fonts/`): SIL OFL 1.1
