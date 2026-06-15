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
from PIL import Image, ImageDraw, ImageFont

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
    # Iconic card: centered orb, the "DebateIt" wordmark, and one line of
    # positioning. The orb is the brand surface; the tagline says what the
    # product is so the share/search card sells the round, not just a logo.
    img = vertical_gradient().convert("RGBA")

    # Orb sits a touch higher than the wordmark-only version to leave room
    # for the tagline beneath the brand.
    orb_cx, orb_cy, orb_R = W // 2, 210, 140
    draw_orb(img, cx=orb_cx, cy=orb_cy, R=orb_R, accent=RED)

    draw = ImageDraw.Draw(img, "RGBA")

    # ── "DebateIt" wordmark, centered under the orb ──────────────
    # White "Debate" + red "It", no space, mirroring the site wordmark
    # (the old "Debate"+red"AI" split, rebranded 2026-06-08).
    brand = font(82, "black")
    debate_w = draw.textbbox((0, 0), "Debate", font=brand)[2]
    it_w = draw.textbbox((0, 0), "It", font=brand)[2]
    total_w = debate_w + it_w
    wx = (W - total_w) // 2
    wy = 388
    draw.text((wx, wy), "Debate", font=brand, fill=WHITE)
    draw.text((wx + debate_w, wy), "It", font=brand, fill=RED)

    # ── Positioning line: live debate + AI adjudication ──────────
    # The card's actual job. Matches og:title / the page <title>.
    tag = font(36, "bold")
    tagline = "Debate live. AI adjudicates every round."
    tw = draw.textbbox((0, 0), tagline, font=tag)[2]
    draw.text(((W - tw) // 2, 500), tagline, font=tag, fill=(255, 255, 255, 214))

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
