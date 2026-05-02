"""Debate AI — Adversarial Geometry logo generator.

Renders a square app icon and a horizontal wordmark variant. Uses Pillow with
4x supersampling for crisp edges. Outputs PNGs at multiple sizes.
"""
from __future__ import annotations

import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
FONTS = "/Users/aidanhm/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/4c58fc1a-8555-4181-a94c-f5ab25878257/c376f6dd-f3c2-4d64-bad9-1f663b07c033/skills/canvas-design/canvas-fonts"

BG = (10, 10, 10, 255)            # #0a0a0a
RED = (239, 68, 68, 255)          # #ef4444 (coral red)
RED_HOT = (255, 90, 90, 255)      # brighter coral for tips
WHITE = (235, 235, 235, 255)      # bone white
WHITE_DIM = (170, 170, 170, 255)
ACCENT_RING = (239, 68, 68, 90)   # transparent red for halo
STAR = (200, 200, 220, 28)        # very faint constellation


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(4))


def draw_constellation(img: Image.Image, scale: int) -> None:
    """Whisper-quiet stardust. Dots only — no lines. Distant signal, not decoration."""
    import random
    rng = random.Random(7)
    W, H = img.size
    cx_, cy_ = W / 2, H / 2
    draw = ImageDraw.Draw(img, "RGBA")

    for _ in range(60):
        x = rng.randint(0, W)
        y = rng.randint(0, H)
        d = math.hypot(x - cx_, y - cy_)
        # skip dots that fall on or near the orb (it's the focal point — must stay clean)
        if d < W * 0.46:
            continue
        # bias toward smaller dots; a few bright ones for sparkle
        size_pick = rng.random()
        if size_pick > 0.95:
            r = 2 * scale
            alpha = 60
        elif size_pick > 0.80:
            r = 1 * scale
            alpha = 38
        else:
            r = 1 * scale
            alpha = 18
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(220, 220, 235, alpha))


def draw_orb_halo(img: Image.Image, cx: int, cy: int, R: int, scale: int) -> None:
    """Atmospheric red glow — feels like emitted light, not a drawn ring."""
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    # soft outer bloom
    for rr, a in [
        (int(R * 1.06), 26),
        (int(R * 1.14), 30),
        (int(R * 1.26), 22),
        (int(R * 1.45), 14),
        (int(R * 1.70), 7),
    ]:
        hd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                   fill=(239, 68, 68, a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=22 * scale))
    img.alpha_composite(halo)


def draw_orb_disc(img: Image.Image, cx: int, cy: int, R: int, scale: int) -> None:
    """Dark disc with subtle radial warmth and a clean coral rim."""
    grad = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    steps = 80
    for i in range(steps, 0, -1):
        t = i / steps
        rr = int(R * t)
        # center: very subtle warm ember; edge: deep carbon
        col = lerp_color((30, 14, 18, 255), (8, 8, 10, 255), t * t)
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    img.alpha_composite(grad)

    # the orb rim — coral, single hairline, slightly soft
    rim = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.ellipse([cx - R, cy - R, cx + R, cy + R],
               outline=(239, 80, 80, 230), width=max(2, 3 * scale))
    rim = rim.filter(ImageFilter.GaussianBlur(radius=0.6 * scale))
    img.alpha_composite(rim)


def bar_height_pattern(n: int) -> list[float]:
    """Hand-tuned heights for a 'speaking' equalizer arc. Returns 0..1 floats."""
    # Aesthetic, not random — calibrated like a master sound designer.
    pattern = [
        0.30, 0.55, 0.42, 0.78, 0.62, 0.92, 0.70, 0.85,
        0.95, 0.74, 0.88, 0.60, 0.80, 0.50, 0.66, 0.40,
        0.55, 0.34, 0.46, 0.28,
    ]
    if n <= len(pattern):
        return pattern[:n]
    # tile if more requested
    out = []
    while len(out) < n:
        out.extend(pattern)
    return out[:n]


def draw_clash_bars(img: Image.Image, cx: int, cy: int, R: int, scale: int) -> None:
    """Vertical bars arrayed across the orb — left arc white (calm), right arc red (impassioned).

    The bars share a common horizontal baseline through the orb's vertical center.
    The middle bar is the brightest, the meeting point — same height as the tallest
    side bar, never punching above. The whole ensemble fits well within the orb.
    """
    n_per_side = 10
    total = n_per_side * 2 + 1   # both sides + center
    span = R * 1.36              # horizontal extent — fits comfortably inside orb
    bar_w = max(2, int(span / (total * 1.9)))
    gap = (span - bar_w * total) / (total - 1)
    start_x = cx - span / 2 + bar_w / 2

    heights = bar_height_pattern(n_per_side)
    bars_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bars_layer)

    # tallest bar reaches ~52% of orb diameter top-to-bottom
    max_h = R * 1.04

    def rounded_bar(draw, x, half_h, color):
        x0 = int(x - bar_w / 2)
        x1 = int(x + bar_w / 2)
        y0 = int(cy - half_h)
        y1 = int(cy + half_h)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=bar_w / 2, fill=color)

    # taper outermost bars so silhouette curves with the orb
    def edge_taper(idx_from_center: int) -> float:
        t = idx_from_center / (n_per_side + 1)
        # smooth ease-out so far bars stay readable but bow inward
        return 1.0 - (t * t) * 0.55

    # LEFT side — bone white, more restrained amplitude (the listener)
    for i in range(n_per_side):
        idx_from_center = n_per_side - i
        x = start_x + i * (bar_w + gap)
        h = heights[idx_from_center - 1] * 0.62 * edge_taper(idx_from_center)
        half_h = h * max_h / 2
        col = WHITE if idx_from_center <= 6 else WHITE_DIM
        rounded_bar(bd, x, half_h, col)

    # RIGHT side — coral red, impassioned (the speaker)
    for i in range(n_per_side):
        idx_from_center = i + 1
        x = start_x + (n_per_side + 1 + i) * (bar_w + gap)
        h = heights[idx_from_center - 1] * 0.98 * edge_taper(idx_from_center)
        half_h = h * max_h / 2
        # hottest near the meridian, cooler at the edges
        t = 1.0 - (i / (n_per_side - 1)) * 0.55
        col = lerp_color(RED, RED_HOT, t)
        rounded_bar(bd, x, half_h, col)

    # CENTER bar — the meeting point. Same height as the tallest neighboring bar.
    # Pure bright white. Carries the meaning of the whole composition.
    cx_x = start_x + n_per_side * (bar_w + gap)
    # match the tallest right-side bar height (idx 1, the 0.30 in the pattern * 0.98 ... no:
    # actually the visual climax should equal the tallest right-side bar):
    tallest_right = max(heights[i] * 0.98 * edge_taper(i + 1) for i in range(n_per_side))
    center_h = tallest_right * max_h / 2
    rounded_bar(bd, cx_x, center_h, (255, 255, 255, 255))

    # tight gem-like halo on the center bar — kissing the bar's silhouette,
    # not bloomy. This is the focal point; precision matters more than glow.
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr_x = bar_w * 1.4
    gr_y = center_h * 0.95
    gd.ellipse([cx_x - gr_x, cy - gr_y, cx_x + gr_x, cy + gr_y],
               fill=(255, 210, 210, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=4 * scale))

    img.alpha_composite(glow)
    img.alpha_composite(bars_layer)


def build_icon(size: int = 1024, transparent_bg: bool = False, with_constellation: bool = True) -> Image.Image:
    scale = 4  # supersample
    W = H = size * scale
    bg = (0, 0, 0, 0) if transparent_bg else BG
    img = Image.new("RGBA", (W, H), bg)

    cx, cy = W // 2, H // 2
    R = int(W * 0.34)  # orb radius

    if not transparent_bg and with_constellation:
        draw_constellation(img, scale)

    draw_orb_halo(img, cx, cy, R, scale)
    draw_orb_disc(img, cx, cy, R, scale)
    draw_clash_bars(img, cx, cy, R, scale)

    # final downsample with high-quality filter
    return img.resize((size, size), Image.LANCZOS)


def find_font(path_options: list[str], size: int) -> ImageFont.FreeTypeFont:
    for p in path_options:
        full = os.path.join(FONTS, p)
        if os.path.exists(full):
            return ImageFont.truetype(full, size)
    return ImageFont.load_default()


def build_wordmark(height: int = 600, padding_ratio: float = 0.18) -> Image.Image:
    """Mark on the left, 'Debate AI.' wordmark to the right.
    Canvas width is fit to content with generous padding — no dead space.
    """
    scale = 3
    H = height * scale

    font_size = int(H * 0.52)
    font = find_font([
        "BigShoulders-Bold.ttf",
        "InstrumentSans-Bold.ttf",
        "BricolageGrotesque-Bold.ttf",
        "GeistMono-Bold.ttf",
    ], font_size)

    # measure text first to compute canvas width — DebateAI as one word.
    # Tight TED-style tracking: render each glyph individually, kerning down ~6%.
    debate = "Debate"
    ai = "AI"
    period = "."
    track = -0.05  # negative tracking, % of font size

    def measure_glyphs(text):
        m_img = Image.new("RGBA", (10, 10))
        m = ImageDraw.Draw(m_img)
        widths = []
        for ch in text:
            b = m.textbbox((0, 0), ch, font=font)
            widths.append(b[2] - b[0])
        kern = int(font_size * track)
        total = sum(widths) + kern * (len(text) - 1)
        return widths, kern, total

    deb_w, kern, debate_w = measure_glyphs(debate)
    ai_w_list, _, ai_w_total = measure_glyphs(ai)
    per_w = ImageDraw.Draw(Image.new("RGBA", (10, 10))).textbbox((0, 0), period, font=font)[2]
    text_total_w = debate_w + ai_w_total + per_w + kern * 2  # one kern between Debate->AI, one before period

    pad = int(H * padding_ratio)
    R = int(H * 0.34)
    orb_diameter = R * 2
    gap = int(H * 0.18)  # space between orb and text
    W = pad + orb_diameter + gap + text_total_w + pad

    img = Image.new("RGBA", (W, H), BG)
    draw_constellation(img, scale)

    cx = pad + R
    cy = H // 2
    draw_orb_halo(img, cx, cy, R, scale)
    draw_orb_disc(img, cx, cy, R, scale)
    draw_clash_bars(img, cx, cy, R, scale)

    draw = ImageDraw.Draw(img)
    text_x = cx + R + gap
    # vertical centering off cap-height of "D" (clean, ignores descenders)
    cap_box = ImageDraw.Draw(Image.new("RGBA", (10, 10))).textbbox((0, 0), "D", font=font)
    cap_h = cap_box[3] - cap_box[1]
    text_y = (H - cap_h) // 2 - cap_box[1]

    def draw_tracked(start_x, text, fill):
        x = start_x
        for ch in text:
            draw.text((x, text_y), ch, fill=fill, font=font)
            b = ImageDraw.Draw(Image.new("RGBA", (10, 10))).textbbox((0, 0), ch, font=font)
            x += (b[2] - b[0]) + kern
        return x - kern  # end x of last glyph (no trailing kern)

    end_debate = draw_tracked(text_x, debate, RED)
    end_ai = draw_tracked(end_debate + kern, ai, WHITE)
    draw.text((end_ai + kern, text_y), period, fill=WHITE, font=font)

    target_w = int(W / scale)
    return img.resize((target_w, height), Image.LANCZOS)


def main():
    # primary app icon — solid background
    icon = build_icon(1024, transparent_bg=False, with_constellation=True)
    icon.save(os.path.join(OUT, "debate-ai-logo-1024.png"))

    # icon variants without constellation (cleaner for small sizes)
    icon_clean = build_icon(1024, transparent_bg=False, with_constellation=False)
    icon_clean.save(os.path.join(OUT, "debate-ai-logo-1024-clean.png"))

    # multi-size exports for favicon / app
    for s in (512, 256, 128, 64, 32):
        v = build_icon(s, transparent_bg=False, with_constellation=False)
        v.save(os.path.join(OUT, f"debate-ai-logo-{s}.png"))

    # transparent background versions for overlay use
    for s in (1024, 512, 256):
        v = build_icon(s, transparent_bg=True, with_constellation=False)
        v.save(os.path.join(OUT, f"debate-ai-logo-{s}-transparent.png"))

    # wordmark — canvas auto-fits content
    wm = build_wordmark(600)
    wm.save(os.path.join(OUT, f"debate-ai-wordmark-{wm.size[0]}x{wm.size[1]}.png"))
    wm_lg = build_wordmark(1000)
    wm_lg.save(os.path.join(OUT, f"debate-ai-wordmark-{wm_lg.size[0]}x{wm_lg.size[1]}.png"))

    print("done. wrote files to:", OUT)
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            p = os.path.join(OUT, f)
            print(f"  {f}: {os.path.getsize(p)//1024} KB")


if __name__ == "__main__":
    main()
