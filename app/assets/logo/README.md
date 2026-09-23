# Debatable wordmark

The September 23, 2026 wordmark follows Aidan's heavy, solid-red TED
lettering reference. It uses outlined Helvetica Neue Condensed Black,
expanded horizontally for the broad proportions. No font file or live SVG
text is shipped. Existing navigation positions and responsive sizes stay
with each page; `css/wordmark.css` applies the same artwork everywhere.

`debatable-wordmark.svg` is the tightly cropped header artwork.
`debatable-logo.svg` and the 128/256 PNGs are transparent square downloads
using the same paths. The extension carries a local copy, `wordmark.svg`.

To regenerate on macOS with fontTools installed:

```sh
python3 scripts/generate-wordmark.py
node scripts/export-wordmark.mjs
```

The generator reads `/System/Library/Fonts/HelveticaNeue.ttc`; raster export
requires the Playwright dependency and Chromium from `e2e/`. The vector is
checked in, so normal builds do not require either tool.
