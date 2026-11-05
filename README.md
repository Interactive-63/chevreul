# Chevreul

The colours you want, from the paints you have.

Chevreul is a free browser-based colour unmixer for artists. Tick the paints you own, choose a colour or pick one from a photo, and it works out the percentages of your paints that come closest.

Use it at [chevreul.i63.app](https://chevreul.i63.app).

## How it works

Paint does not mix the way light does on a screen. Each pigment absorbs some wavelengths and scatters others, so averaging RGB values gives colours real paint will not make. Chevreul models each paint as absorption and scattering curves across the visible spectrum, combines them with Kubelka-Munk theory, and searches your palette for the mix with the smallest CIEDE2000 difference from the target. A recipe can also be simplified to small whole parts, using the smallest ratio that stays within about one CIEDE2000 of the exact mix.

It runs entirely in the browser. There is no backend, no account, no analytics and no cookies. Photos are read on the device and never uploaded, and the palette is saved in the browser's local storage.

The name comes from Michel Eugène Chevreul, author of *The Laws of Contrast of Colour*.

## Limits

- Results are predictions. Test a recipe on paper before relying on it.
- Accuracy against real paint has not been measured.
- Screens cannot show every paint colour, so the colours on the page are approximate.

## Running it

Requires Node 24 or later.

```
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run build` | Type checks, then builds to `dist/` |
| `npm test` | Runs the tests |
| `npm run typecheck` | Type checks only |

## Project layout

- `src/colour/`: the colour science and solver, free of DOM code.
- `src/worker/`: runs the solver in a Web Worker.
- `src/app/`: application state, palette storage and photo handling.
- `src/ui/`: the interface.
- `src/data/`: the paint data and CIE tables.
- `tests/`: mirrors `src/`.

## Paint data

The paint set is spectral data from heavy body acrylic paint. Other paints will mix differently.

`src/data/heavy-body-acrylic.json` and `tests/fixtures/heavy-body-reference.json` are excluded from the code licence and are for non-commercial use only. See [LICENSE](LICENSE).

## Licence

The code is under the [MIT licence](LICENSE), apart from the paint data described above.

## Credits

- CIE standard illuminant and observer tables, derived from Rochester Institute of Technology's published data.
- CIEDE2000 test pairs from Sharma, Wu and Dalal (2005).
- [Young Serif](https://fontsource.org/fonts/young-serif), [Literata](https://fontsource.org/fonts/literata) and [Martian Mono](https://fontsource.org/fonts/martian-mono), all under the SIL Open Font License 1.1.

Developed by [Interactive 63](https://interactive63.com).
