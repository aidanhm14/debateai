#!/usr/bin/env python3
"""Generate the 1200x630 OG card at app/og-image.png.

Twitter/X, LinkedIn, Slack, iMessage all expect 1.91:1 (≈1200x630) for the
big "summary_large_image" preview. Square logos render as the small
grey-padded thumbnail.

The card mirrors the voice-debate orb visualizer — same crimson aurora,
sine-modulated waveform ring, pulsing core, hot white center — frozen
at a phase that looks organic rather than perfectly circular. The orb
IS the brand surface; the wordmark and URL just identify it.

Re-run when the visual needs to change:

    python3 scripts/generate-og-image.py
"""

import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
OUT = "app/og-image.png"

# Match the crimson page background — same gradient family as
# data-theme="crimson" in landing.html so the OG card and the landing
# read as one continuous surface.
BG_TOP = (15, 4, 6)
BG_BOT = (28, 10, 14)
RED = (239, 68, 68)
WHITE = (255, 255, 255)
DIM = (255, 255, 255, 200)
GHOST = (255, 255, 255, 130)

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


def vertical_gradient():
    img = Image.new("RGB", (W, H), BG_TOP)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        for x in range(W):
            px[x, y] = (r, g, b)
    return img


def radial_glow(size, color_rgb, peak_alpha=180, falloff_pow=1.6):
    """Pixel-accurate radial gradient disk centered in a `size x size` square.

    Alpha drops from `peak_alpha` at the center to 0 at the edge, with a
    power-curve falloff so the glow has a soft halo instead of a hard
    linear ramp. Used for the aurora and the pulsing core.
    """
    cx = cy = size / 2
    R = size / 2
    pixels = bytearray()
    r0, g0, b0 = color_rgb
    for y in range(size):
        dy = y - cy
        for x in range(size):
            dx = x - cx
            d = math.hypot(dx, dy)
            t = max(0.0, 1.0 - d / R)
            a = int(peak_alpha * (t ** falloff_pow))
            pixels.extend([r0, g0, b0, a])
    return Image.frombytes("RGBA", (size, size), bytes(pixels))


def draw_orb(img, cx, cy, R, accent=RED):
    """A clean crimson orb: layered glows, a crisp circular rim, and a hot
    plasma center.

    The earlier version froze voice-debate's sine-modulated waveform ring,
    which at OG-thumbnail scale rendered as a jagged red blob (the "really
    bad" image). A smooth, supersampled circle reads as intentional and
    premium while keeping the same aurora-orb identity.
    """
    a = accent

    # ── Aurora — wide atmospheric wash + tight inner halo ─────────
    outer_r = int(R * 3.4)
    img.alpha_composite(radial_glow(outer_r * 2, a, peak_alpha=115, falloff_pow=2.4), (cx - outer_r, cy - outer_r))
    inner_r = int(R * 1.85)
    img.alpha_composite(radial_glow(inner_r * 2, a, peak_alpha=205, falloff_pow=1.5), (cx - inner_r, cy - inner_r))

    # ── Filled core glow (soft red disk inside the rim) ───────────
    core_r = int(R * 1.02)
    img.alpha_composite(radial_glow(core_r * 2, a, peak_alpha=210, falloff_pow=1.15), (cx - core_r, cy - core_r))

    # ── Crisp circular rim ────────────────────────────────────────
    # Drawn 4x oversize then downscaled with LANCZOS so the edge is
    # smoothly antialiased (PIL's ellipse stroke aliases badly at 1x).
    SS = 4
    box = int(R * 2.5)
    rs = box * SS
    ring = Image.new("RGBA", (rs, rs), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    c = rs / 2
    rr = R * SS
    rd.ellipse((c - rr, c - rr, c + rr, c + rr), outline=(a[0], a[1], a[2], 240), width=3 * SS)
    ring = ring.resize((box, box), Image.LANCZOS)
    img.alpha_composite(ring, (cx - box // 2, cy - box // 2))

    # ── Soft white plasma + hot center ────────────────────────────
    soft_r = int(R * 0.5)
    img.alpha_composite(radial_glow(soft_r * 2, (255, 255, 255), peak_alpha=150, falloff_pow=1.5), (cx - soft_r, cy - soft_r))
    hot_r = int(R * 0.2)
    img.alpha_composite(radial_glow(hot_r * 2, (255, 255, 255), peak_alpha=255, falloff_pow=0.9), (cx - hot_r, cy - hot_r))


def main():
    base = vertical_gradient()

    # A subtle ambient red at the left so the dark background reads as
    # alive without competing with the orb's aurora on the right.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-280, -200, 380, 460), fill=(239, 68, 68, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    base.paste(glow, (0, 0), glow)

    img = base.convert("RGBA")

    # Orb sits on the right so the left half can carry the message.
    # Smaller R than the text-free version (200 → 125) — the orb's
    # outer aurora still reaches across the canvas, but the inner
    # bright structure is contained to the right third.
    # cy bumped 285 → 360 + cx 950 → 970 so the orb's bright ring
    # clears the top-right URL band (y≈88–112). Earlier placement
    # had the inner ring's top at y≈76, which collided with the
    # "debateai.com" text in Twitter/Discord/Slack embeds.
    draw_orb(img, cx=970, cy=355, R=132, accent=RED)

    draw = ImageDraw.Draw(img, "RGBA")

    # ── Brand strip (top-left) + URL (top-right) ──────────────────
    brand = font(40, "black")
    debate_w = draw.textbbox((0, 0), "Debate ", font=brand)[2]
    draw.text((72, 78), "Debate ", font=brand, fill=WHITE)
    draw.text((72 + debate_w, 78), "AI", font=brand, fill=RED)

    url_font = font(24, "bold")
    ub = draw.textbbox((0, 0), "debateai.com", font=url_font)
    draw.text((W - 72 - (ub[2] - ub[0]), 88), "debateai.com", font=url_font, fill=RED)

    # ── Headline (two lines, left-aligned) ────────────────────────
    headline = font(68, "black")
    draw.text((72, 200), "Find your weakness.", font=headline, fill=WHITE)
    before_w = draw.textbbox((0, 0), "Before ", font=headline)[2]
    they_w = draw.textbbox((0, 0), "they", font=headline)[2]
    y2 = 278
    draw.text((72, y2), "Before ", font=headline, fill=WHITE)
    draw.text((72 + before_w, y2), "they", font=headline, fill=RED)
    draw.text((72 + before_w + they_w, y2), " do.", font=headline, fill=WHITE)

    # ── Sub copy ──────────────────────────────────────────────────
    sub = font(26, "bold")
    draw.text((72, 372), "Pick a motion. Argue out loud. Get a real ballot.", font=sub, fill=DIM)

    # ── Format chips across the bottom ────────────────────────────
    chip_font = font(20, "bold")
    chips = ["WSDC", "BP", "APDA", "Policy", "LD", "PF", "Congress", "MUN"]
    x = 72
    y = 510
    gap = 10
    pad_x = 14
    pad_y = 8
    for c in chips:
        tb = draw.textbbox((0, 0), c, font=chip_font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        bw = tw + pad_x * 2
        bh = th + pad_y * 2 + 4
        draw.rounded_rectangle(
            (x, y, x + bw, y + bh),
            radius=bh / 2,
            outline=(239, 68, 68, 150),
            width=2,
            fill=(239, 68, 68, 28),
        )
        draw.text((x + pad_x - tb[0], y + pad_y - tb[1]), c, font=chip_font, fill=WHITE)
        x += bw + gap

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
