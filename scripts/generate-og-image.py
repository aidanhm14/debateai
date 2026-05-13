#!/usr/bin/env python3
"""Generate the 1200x630 OG card at app/og-image.png.

Twitter/X, LinkedIn, Slack, iMessage all expect 1.91:1 (≈1200x630) for the
big "summary_large_image" preview. The previous 512x512 logo got rendered
as the small grey-padded thumbnail, which is what shipping links looked
like. Re-run this script when the wordmark or tagline needs to change.

    python3 scripts/generate-og-image.py
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
OUT = "app/og-image.png"

BG_TOP = (15, 4, 6)
BG_BOT = (28, 10, 14)
RED = (239, 68, 68)
RED_SOFT = (239, 68, 68, 90)
WHITE = (255, 255, 255)
DIM = (255, 255, 255, 180)
GHOST = (255, 255, 255, 110)

SF = "/System/Library/Fonts/SFNS.ttf"
HELV = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size, weight="bold"):
    try:
        f = ImageFont.truetype(SF, size)
        if hasattr(f, "set_variation_by_name"):
            try:
                f.set_variation_by_name("Black" if weight == "black" else "Bold" if weight == "bold" else "Regular")
            except Exception:
                pass
        return f
    except Exception:
        return ImageFont.truetype(HELV, size)


img = Image.new("RGB", (W, H), BG_TOP)
px = img.load()
for y in range(H):
    t = y / (H - 1)
    r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
    g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
    b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)

glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((-220, -260, 520, 420), fill=(239, 68, 68, 70))
gd.ellipse((760, 320, 1480, 940), fill=(239, 68, 68, 50))
glow = glow.filter(ImageFilter.GaussianBlur(80))
img.paste(glow, (0, 0), glow)

draw = ImageDraw.Draw(img, "RGBA")

draw.rounded_rectangle((72, 72, 184, 184), radius=26, fill=(20, 8, 12, 255), outline=(239, 68, 68, 220), width=3)
mark_font = font(120, "black")
mb = draw.textbbox((0, 0), "D", font=mark_font)
mw, mh = mb[2] - mb[0], mb[3] - mb[1]
draw.text((72 + (112 - mw) / 2 - mb[0], 72 + (112 - mh) / 2 - mb[1] - 6), "D", font=mark_font, fill=RED)

brand = font(46, "black")
brand_w = draw.textbbox((0, 0), "Debate ", font=brand)[2]
draw.text((72, 232), "Debate ", font=brand, fill=WHITE)
draw.text((72 + brand_w, 232), "AI", font=brand, fill=RED)

tagline = font(78, "black")
draw.text((72, 296), "Most AI agrees.", font=tagline, fill=WHITE)
contrast_y = 384
prefix = "This one "
prefix_w = draw.textbbox((0, 0), prefix, font=tagline)[2]
draw.text((72, contrast_y), prefix, font=tagline, fill=WHITE)
draw.text((72 + prefix_w, contrast_y), "argues.", font=tagline, fill=RED)

sub = font(30, "bold")
draw.text((72, 484), "Find the hole in your case before the round does.", font=sub, fill=DIM)

chip_font = font(22, "bold")
chips = ["WSDC", "BP", "APDA", "Policy", "LD", "PF", "Congress", "MUN"]
x = 76
y = 522
gap = 12
pad_x = 16
pad_y = 9
for c in chips:
    tb = draw.textbbox((0, 0), c, font=chip_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    bw = tw + pad_x * 2
    bh = th + pad_y * 2 + 4
    draw.rounded_rectangle((x, y, x + bw, y + bh), radius=bh / 2, outline=(239, 68, 68, 140), width=2, fill=(239, 68, 68, 28))
    draw.text((x + pad_x - tb[0], y + pad_y - tb[1]), c, font=chip_font, fill=WHITE)
    x += bw + gap

url_font = font(26, "bold")
ub = draw.textbbox((0, 0), "debateai.com", font=url_font)
uw = ub[2] - ub[0]
draw.text((W - 76 - uw, 96), "debateai.com", font=url_font, fill=RED)

img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT} ({W}x{H})")
