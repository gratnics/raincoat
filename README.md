# Raincoat

Raincoat is the icon set used by Seirein. Every icon is drawn on a 24×24 grid and colored with `currentColor`, in two styles: `line` and `fill`.

- line: 68 icons
- fill: 18 icons (each has a line counterpart with the same name)

## Layout

```
icons/line/   Line icons (<name>.svg)
icons/fill/   Fill icons (<name>.svg)
scripts/      Build, preview, and generator scripts
sets.json     Icon names grouped by the batch they were drawn in (used by the preview)
```

## Scripts

```bash
npm run build
```

Writes `dist/icons.json` and `dist/info.json` in Iconify JSON format with the prefix `raincoat`. Icons are named `<name>-line` and `<name>-fill`, so a full icon name looks like `raincoat:add-line`.

```bash
npm run preview
```

Writes `preview/index.html`, which shows every icon at several sizes on light and dark backgrounds.

```bash
node scripts/gen-rotated.mjs
```

Generates `icons/line/pin.svg`, `icons/line/umbrella.svg`, and `icons/line/tool.svg` from their unrotated coordinates. Do not edit these three SVG files directly; change the settings in the script and run it again.

## Design rules

- `stroke-width="2"` on the 24×24 grid
- Round line caps and line joins
- A 2px margin around the edge of the grid
- No `transform`, `id`, or `style` attributes, and no fixed colors

## License

[Apache-2.0](LICENSE)
