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


def draw_orb(img, cx, cy, R, accent=RED, smooth_level=0.55, phase=2.7):
    """Port of voice-debate.html's startOrbAnimation, frozen mid-frame.

    smooth_level controls organic distortion — 0 is a clean circle, 0.7+
    is chaotic. phase rotates the waveform; a non-zero value avoids the
    symmetric pose at phase=0 that looks accidental.
    """
    # ── Aurora outer glow ─────────────────────────────────────────
    # Two stacked glows — a tight inner halo and a wide atmospheric
    # wash — so the orb reads bright at the ring AND has a presence
    # bleeding into the corners of the card.
    inner_r = int(R * 1.7)
    inner = radial_glow(inner_r * 2, accent, peak_alpha=int(190 + smooth_level * 50), falloff_pow=1.4)
    img.alpha_composite(inner, (cx - inner_r, cy - inner_r))

    outer_r = int(R * 3.2)
    outer = radial_glow(outer_r * 2, accent, peak_alpha=int(110 + smooth_level * 40), falloff_pow=2.2)
    img.alpha_composite(outer, (cx - outer_r, cy - outer_r))

    # ── Inner ring waveform ───────────────────────────────────────
    segments = 360
    points = []
    for i in range(segments + 1):
        t = i / segments
        a = t * math.pi * 2
        r = (R * (1 + smooth_level * 0.55)
             + math.sin(a * 6 + phase * 2) * (3 + smooth_level * 14)
             + math.sin(a * 11 - phase * 3) * (2 + smooth_level * 9)
             + math.cos(a * 3 + phase) * (4 + smooth_level * 6))
        points.append((cx + math.cos(a) * r, cy + math.sin(a) * r))

    ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    fill_alpha = int(255 * (0.12 + smooth_level * 0.08))
    rd.polygon(points, fill=(accent[0], accent[1], accent[2], fill_alpha))
    stroke_alpha = int(255 * (0.78 + smooth_level * 0.2))
    rd.line(points + [points[0]], fill=(accent[0], accent[1], accent[2], stroke_alpha), width=5, joint="curve")
    img.alpha_composite(ring)

    # ── Inner pulsing core ────────────────────────────────────────
    core_r = int(R * (0.7 + smooth_level * 0.25))
    core_size = core_r * 2
    core = radial_glow(core_size, accent, peak_alpha=int(230 + smooth_level * 25), falloff_pow=1.0)
    img.alpha_composite(core, (cx - core_r, cy - core_r))

    # Soft white inner glow under the hot center so the bright spot
    # reads as plasma, not a single dot.
    soft_r = int(R * 0.32)
    soft = radial_glow(soft_r * 2, (255, 255, 255), peak_alpha=int(140 + smooth_level * 60), falloff_pow=1.4)
    img.alpha_composite(soft, (cx - soft_r, cy - soft_r))

    # ── Bright hot center ─────────────────────────────────────────
    hot_r = int(12 + smooth_level * 18)
    hot = radial_glow(hot_r * 2, (255, 255, 255), peak_alpha=255, falloff_pow=0.9)
    img.alpha_composite(hot, (cx - hot_r, cy - hot_r))


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
    # Smaller R than the text-free version (200 → 135) — the orb's
    # outer aurora still reaches across the canvas, but the inner
    # bright structure is contained to the right third.
    draw_orb(img, cx=950, cy=285, R=135, accent=RED, smooth_level=0.55, phase=2.7)

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
    draw.text((72, 372), "Lay the bait. Eat their time. Take the ballot.", font=sub, fill=DIM)

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
