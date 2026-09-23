"""Outline the shared Debatable wordmark; never ship a system font file.

Run on macOS with Python/fontTools. The checked-in SVG is the production
asset, so every browser and native webview displays the same letterforms.
"""
from pathlib import Path
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[1]
fonts = TTCollection('/System/Library/Fonts/HelveticaNeue.ttc').fonts
font = next(f for f in fonts if f['name'].getDebugName(6) == 'HelveticaNeue-CondensedBlack')
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
x = 0
for letter in 'Debatable':
    name = cmap[ord(letter)]
    # Open the black cut to the broad proportions of the requested mark.
    transform = (1.16, 0, 0, -1, x * 1.16, 0)
    glyphs[name].draw(TransformPen(pen, transform))
    glyphs[name].draw(TransformPen(bounds, transform))
    x += font['hmtx'][name][0] - 12

left, top, right, bottom = bounds.bounds
padding = 12
width, height = right - left + padding * 2, bottom - top + padding * 2
art = f'<path fill="#ef4444" d="{pen.getCommands()}" transform="translate({padding-left:g} {padding-top:g})"/>'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" role="img" aria-label="Debatable"><title>Debatable</title>{art}</svg>\n'
out = ROOT / 'app/assets/logo'
(out / 'debatable-wordmark.svg').write_text(svg)
(ROOT / 'app/float-extension/wordmark.svg').write_text(svg)
scale = 920 / width
square = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="Debatable"><title>Debatable</title><g transform="translate(52 {(1024-height*scale)/2:g}) scale({scale:g})">{art}</g></svg>\n'
(out / 'debatable-logo.svg').write_text(square)
print(f'Wordmark: {width:g} × {height:g}; CSS width at .8em high: {width/height*.8:.5f}em')
