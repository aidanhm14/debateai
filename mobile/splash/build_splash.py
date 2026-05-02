"""Generate launch screen / splash images for iOS.

Capacitor's default splash plugin expects a 2732x2732 image (universal,
covers all iPhone/iPad orientations). The image is centered and cropped
per-device. We render a centered orb on solid carbon black.
"""
from __future__ import annotations
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.abspath(os.path.join(HERE, "..", "..", "logo", "debate-ai-logo-1024-clean.png"))
OUT_DIR = HERE

SIZES = [
    ("splash-2732x2732.png", 2732, 2732),
    ("splash-1242x2688.png", 1242, 2688),  # iPhone XS Max portrait
    ("splash-2732x2732-dark.png", 2732, 2732),
]

BG = (10, 10, 10, 255)


def build():
    if not os.path.exists(SOURCE):
        print(f"ERROR: source logo not found at {SOURCE}", file=sys.stderr)
        sys.exit(1)

    src = Image.open(SOURCE).convert("RGBA")
    sw, sh = src.size

    for name, w, h in SIZES:
        canvas = Image.new("RGBA", (w, h), BG)
        # orb takes ~28% of the shorter dim — generous breathing room
        target = int(min(w, h) * 0.32)
        scale = target / sw
        new_size = (int(sw * scale), int(sh * scale))
        resized = src.resize(new_size, Image.LANCZOS)
        ox = (w - new_size[0]) // 2
        oy = (h - new_size[1]) // 2
        canvas.alpha_composite(resized, (ox, oy))
        canvas.convert("RGB").save(os.path.join(OUT_DIR, name), "PNG", optimize=True)

    print(f"wrote {len(SIZES)} splash images to {OUT_DIR}")
    for f in sorted(os.listdir(OUT_DIR)):
        if f.endswith(".png"):
            p = os.path.join(OUT_DIR, f)
            print(f"  {f}: {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    build()
