"""Re-cut app/img/pfp/* from the source screenshots.

The rail's stand-in pictures (soul.md, 2026-08-25: "bring back the real
photos - never reverse this"). Sources are phone screenshots of profile
pictures from another app; the avatar is a circle of radius 398 centred at
(603, 1136) on a 1206x2622 capture, found by fitting a circle to the edge
map and identical across the batch.

IMG_6413 IS DELIBERATELY ABSENT AND MUST STAY ABSENT. It is a photograph
of a child. The site owner's go-ahead for the batch is not that child's
consent, so it is the one image in the set that is not his to publish.
Everything else in the batch is his call and has been made twice.

Usage: python3 scripts/crop-pfp-batch.py   (writes straight into app/img/pfp)
"""
import os
from PIL import Image
SRC = os.path.expanduser('~/Downloads')
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app', 'img', 'pfp')
os.makedirs(OUT, exist_ok=True)
CX, CY, R = 603, 1136, 398
# 6413 excluded: it is a photograph of a child.
names = {
 'IMG_6403':'default', 'IMG_6404':'danbo', 'IMG_6405':'duo', 'IMG_6406':'snow',
 'IMG_6407':'krispy', 'IMG_6408':'pug', 'IMG_6409':'chibi', 'IMG_6410':'cap',
 'IMG_6411':'lisa', 'IMG_6412':'cash',
}
for k, v in sorted(names.items()):
    im = Image.open(os.path.join(SRC, k + '.PNG')).convert('RGB')
    box = (CX - R, CY - R, CX + R, CY + R)
    im.crop(box).resize((320, 320), Image.LANCZOS).save(os.path.join(OUT, v + '.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
    print(v, 'ok')
