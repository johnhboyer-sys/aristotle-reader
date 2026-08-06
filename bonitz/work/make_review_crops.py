"""Stitch a column's strips back into one image and crop a given printed line.

The strips are 1400px wide, 700px tall, overlapping by 110px, so strip i sits
at y = i*(700-110) in the reassembled column. Line bands are found by ink
projection rather than by dividing the height evenly, because the columns are
not perfectly even and a half-line drift would put the wrong text in the crop.
"""
from __future__ import annotations
import base64, io, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STRIPS = ROOT / 'images' / 'strips'
STRIP_H, OVERLAP = 700, 110


def stitch(page: str, col: str) -> Image.Image:
    d = STRIPS / f'page-{page}-{col}'
    files = sorted(d.glob('strip-*.png'))
    if not files:
        raise FileNotFoundError(d)
    ims = [Image.open(f).convert('L') for f in files]
    step = STRIP_H - OVERLAP
    total = step * (len(ims) - 1) + ims[-1].height
    out = Image.new('L', (ims[0].width, total), 255)
    for i, im in enumerate(ims):
        out.paste(im, (0, i * step))
    return out


def text_extent(im: Image.Image) -> tuple[int, int]:
    """First and last row of the column that carry real text ink.

    Per-line band detection proved unreliable here (detached accents and
    touching descenders merge or split bands, giving 14-59 bands where there
    are 61 lines). The book is set with even leading, so locating the block
    once and dividing it evenly is far more dependable.
    """
    w, h = im.size
    px = im.load()
    x0, x1 = int(w * 0.02), int(w * 0.97)
    rows = []
    for y in range(h):
        n = 0
        for x in range(x0, x1, 3):
            if px[x, y] < 128:
                n += 1
        rows.append(n)
    # a real text row has substantially more ink than a stray speck
    thresh = max(3, max(rows) // 12)
    ink = [y for y, v in enumerate(rows) if v >= thresh]
    if not ink:
        return 0, h
    return ink[0], ink[-1] + 1


def crop_line(page: str, col: str, line: int, nlines: int = 61,
              pad: int = 30) -> Image.Image:
    im = stitch(page, col)
    top_y, bot_y = text_extent(im)
    span = (bot_y - top_y) / nlines
    top = int(top_y + (line - 1) * span)
    bot = int(top_y + line * span)
    top = max(0, top - pad)
    bot = min(im.height, bot + pad)
    return im.crop((0, top, im.width, bot))


def as_data_uri(im: Image.Image, max_w: int = 1100) -> str:
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)),
                       Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


if __name__ == '__main__':
    page, col, line = sys.argv[1], sys.argv[2], int(sys.argv[3])
    im = crop_line(page, col, line)
    out = ROOT / 'work' / 'review_crops' / f'p{page}{col}-l{line}.png'
    out.parent.mkdir(exist_ok=True)
    im.save(out)
    print(out, im.size)
