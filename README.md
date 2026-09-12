# PUBG Numbers Feed

100 numbered killfeed team icons for **PUBG: BATTLEGROUNDS** — big, high-contrast team digits in distinct colors, readable on any background at any killfeed size.

![All icons](preview/preview.png)

## Why numbers

Flags require memorizing 100 flag-to-team mappings. Numbers don't: the team digit is the icon. Each team gets its own color so entries can be told apart at a glance, while the digit itself stays the primary identifier.

## Features

- **100 icons** (`001.png`–`100.png`) covering squads, duos and solos
- **Geologica ExtraBold (800)** digits, auto-fitted per digit count so 1-, 2- and 3-digit numbers all fill the icon
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

[Geologica](https://fonts.google.com/specimen/Geologica) by Nyisha Mirza Kalimar, Nazareth Seferian & Eben Sorkin — ExtraBold (weight 800), auto-sized up to 72 px on the 64 px canvas with a 4 px margin, so digits fill 80–90% of the icon regardless of digit count.

**Stretched resolutions (16:10 on 16:9 panels) are accounted for:** the layout keeps ~10% headroom and relies on the heavy 800 weight, so counters of `0`, `6`, `8`, `9` stay open and digits remain fully legible under the ~11% non-uniform scaling. The font is bundled in `src/assets/fonts/` under the [SIL Open Font License 1.1](src/assets/fonts/Geologica-OFL.txt).

## Credits

- Install flow and `Observer` layout follow [nitnat/pubg-flagfeed](https://github.com/nitnat/pubg-flagfeed), the project that inspired this one
- Original custom killfeed icon idea: [Kowo](https://youtu.be/8OWbQ_wXhpk)

## License

- Code and generated icons: [MIT](LICENSE)
- Bundled font (`src/assets/fonts/`): SIL OFL 1.1
