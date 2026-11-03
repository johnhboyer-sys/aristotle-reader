# B's two cuts of each chalkboard photograph: desk 1600x667 and phone 720x900,
# both as printed (RGB) and in black and white (B's tone curve, from
# round five's bw.py). usage: python3 -I cuts.py <srcdir> <outroot> [preview]
# With "preview", writes one sheet with the crop boxes drawn instead.
import sys, os
from PIL import Image, ImageDraw
SRC, OUT = sys.argv[1], sys.argv[2]
PREVIEW = len(sys.argv) > 3
# id: (file, desk box (x0, y0, x1, y1), phone box)
CUTS = {
    'APr': ('schrek-full.jpg', (0, 400, 2838, 1583), (0, 120, 2838, 3668)),
    'Int': ('utr-25.jpg', (0, 860, 2610, 1948), (0, 240, 2610, 3503)),
    'Top': ('getty-2-full.jpg', (737, 1060, 4221, 2512), (1020, 676, 3293, 3517)),
}
if len(sys.argv) > 4: CUTS = {k: v for k, v in CUTS.items() if k in sys.argv[4].split(',')}
LO, HI, MAXGAIN = 0.004, 0.996, 1.6
def tone(im):
    lum = im.convert('RGB').convert('L', matrix=(0.2126, 0.7152, 0.0722, 0))
    hist = lum.histogram(); n = sum(hist)
    acc = lo = 0
    for i, c in enumerate(hist):
        acc += c
        if acc >= n * LO: lo = i; break
    acc, hi = 0, 255
    for i, c in enumerate(hist):
        acc += c
        if acc >= n * HI: hi = i; break
    span = max(1, hi - lo); gain = min(MAXGAIN, 255 / span)
    mid = (lo + hi) / 2
    out0 = 127.5 - gain * (mid - lo) if gain < 255 / span else 0
    def level(v):
        x = max(0.0, min(255.0, out0 + (v - lo) * gain)) / 255
        s = x + 0.12 * (x - 0.5) * (1 - abs(2 * x - 1)) * 2
        return int(round(max(0.0, min(1.0, s)) * 255))
    return lum.point([level(v) for v in range(256)])
if PREVIEW:
    tiles = []
    for k, (f, d, p) in CUTS.items():
        im = Image.open(os.path.join(SRC, f)).convert('RGB')
        dr = ImageDraw.Draw(im)
        dr.rectangle(d, outline=(255, 0, 0), width=max(6, im.width // 200))
        dr.rectangle(p, outline=(0, 160, 255), width=max(6, im.width // 200))
        im.thumbnail((700, 700)); tiles.append(im)
    sheet = Image.new('RGB', (sum(t.width + 10 for t in tiles), max(t.height for t in tiles)), 'white')
    x = 0
    for t in tiles: sheet.paste(t, (x, 0)); x += t.width + 10
    sheet.save(OUT); print('preview', OUT); sys.exit()
for k, (f, d, p) in CUTS.items():
    im = Image.open(os.path.join(SRC, f)).convert('RGB')
    for cut, box, size in (('desk', d, (1600, 667)), ('phone', p, (720, 900))):
        w, h = box[2] - box[0], box[3] - box[1]
        assert abs(w / h - size[0] / size[1]) < 0.01, (k, cut, w / h, size[0] / size[1])
        c = im.crop(box).resize(size, Image.LANCZOS)
        for sub, img in (('printed', c), ('bw', tone(c))):
            path = os.path.join(OUT, sub, cut); os.makedirs(path, exist_ok=True)
            img.save(os.path.join(path, f'{k}.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
        print(k, cut, box, size)
