"""Generate the full iOS AppIcon.appiconset from the master 1024 logo.

Apple requires a solid (non-transparent) icon. We use the clean variant
(no constellation) on a solid carbon-black background. Apple applies the
squircle mask automatically — we ship a square PNG.
"""
from __future__ import annotations
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.abspath(os.path.join(HERE, "..", "..", "logo", "debate-ai-logo-1024-clean.png"))
OUT = os.path.join(HERE, "AppIcon.appiconset")

# Apple icon sizes (post-iOS 14 unified asset is 1024 + the rest derived for marketing).
# Modern Xcode (iOS 17+) accepts a single 1024 in AppIcon.appiconset and generates
# the rest. We still ship classic sizes for safety and for older toolchains.
ICONS = [
    # filename, pt size, scale, idiom
    ("icon-20@2x.png",   20, 2, "iphone"),
    ("icon-20@3x.png",   20, 3, "iphone"),
    ("icon-29@2x.png",   29, 2, "iphone"),
    ("icon-29@3x.png",   29, 3, "iphone"),
    ("icon-40@2x.png",   40, 2, "iphone"),
    ("icon-40@3x.png",   40, 3, "iphone"),
    ("icon-60@2x.png",   60, 2, "iphone"),
    ("icon-60@3x.png",   60, 3, "iphone"),
    ("icon-20@1x-ipad.png", 20, 1, "ipad"),
    ("icon-20@2x-ipad.png", 20, 2, "ipad"),
    ("icon-29@1x-ipad.png", 29, 1, "ipad"),
    ("icon-29@2x-ipad.png", 29, 2, "ipad"),
    ("icon-40@1x-ipad.png", 40, 1, "ipad"),
    ("icon-40@2x-ipad.png", 40, 2, "ipad"),
    ("icon-76@2x-ipad.png", 76, 2, "ipad"),
    ("icon-83.5@2x-ipad.png", 83.5, 2, "ipad"),
    ("icon-1024.png",    1024, 1, "ios-marketing"),
]


def build():
    if not os.path.exists(SOURCE):
        print(f"ERROR: source logo not found at {SOURCE}", file=sys.stderr)
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)

    src = Image.open(SOURCE).convert("RGBA")
    # iOS requires opaque — composite onto solid carbon black.
    bg = Image.new("RGBA", src.size, (10, 10, 10, 255))
    src = Image.alpha_composite(bg, src).convert("RGB")

    images_meta = []
    for filename, pt, scale, idiom in ICONS:
        px = int(round(pt * scale))
        out_path = os.path.join(OUT, filename)
        resized = src.resize((px, px), Image.LANCZOS)
        resized.save(out_path, "PNG", optimize=True)
        images_meta.append({
            "filename": filename,
            "idiom": idiom,
            "scale": f"{scale}x",
            "size": f"{pt}x{pt}",
        })

    contents = {
        "images": images_meta,
        "info": {"author": "xcode", "version": 1},
    }
    with open(os.path.join(OUT, "Contents.json"), "w") as f:
        json.dump(contents, f, indent=2)

    print(f"wrote {len(ICONS)} icons + Contents.json to {OUT}")
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        if os.path.isfile(p):
            print(f"  {f}: {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    build()
