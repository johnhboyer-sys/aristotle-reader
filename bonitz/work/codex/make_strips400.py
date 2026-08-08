"""
Cut the 400 dpi columns into strips with the SAME geometry batch3.make_strips
used for the book.pdf strips, so a Codex re-read isolates the scan as the only
changed variable.

Old strips: 1400px wide, 700 tall, 110 overlap -> ~11.8 lines/strip, ~1.9 shared.
The 400 dpi columns are 1334px wide natively; upscaling to 1400 would invent
pixels, so keep native width and scale the strip height by the same ratio.

    python3 work/codex/make_strips400.py page-052-L [...]
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
# 15-52 (the gold/training range) and 53-62 (kraken's independent read) were
# built into different directories; look in both.
COLS = [ROOT / 'work/kraken400/cols', ROOT / 'work/kraken400/read/cols']
OUT = ROOT / 'work/codex/strips400'


def find(stem: str) -> Path:
    for d in COLS:
        f = d / f'{stem}.png'
        if f.exists():
            return f
    sys.exit(f'no 400 dpi column image for {stem}')


for stem in sys.argv[1:]:
    im = Image.open(find(stem)).convert('RGB')
    strip_h = round(700 * im.width / 1400)
    overlap = round(110 * im.width / 1400)
    d = OUT / stem
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob('strip-*.png'):
        f.unlink()
    y, i = 0, 1
    while y < im.height:
        im.crop((0, y, im.width, min(im.height, y + strip_h))).save(d / f'strip-{i:02d}.png')
        if y + strip_h >= im.height:
            break
        y += strip_h - overlap
        i += 1
    print(f'{stem}: {i} strips of {im.width}x{strip_h}, overlap {overlap}')
