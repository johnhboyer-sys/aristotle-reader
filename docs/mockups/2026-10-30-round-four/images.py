"""Fetch the round-four pictures into img/ (gitignored).

- Getty photographs (CC0): picks.json gives each work's Getty object, the
  IIIF id of its image, and two crops (fractions of the image): `desk`, a
  wide one for the desktop poster (1440 by 600), and `phone`, a tall one for
  the phone poster (4 by 5). The IIIF server cuts each region from the
  full-size original. Writes img/desk/<work>.jpg (1600 wide at most) and
  img/phone/<work>.jpg (720 wide at most).
- Aldine pages (Public Domain Mark): aldine-map.json gives each work's leaf
  in the Boston Public Library copy at the Internet Archive (opera01aris to
  opera06aris) and the box of the detail the pages show. Writes
  img/ald/<work>.jpg (the detail) and img/ald/<work>-page.jpg.

Downloads are kept in img-src/ (gitignored), so a rerun works offline.

    python3 docs/mockups/2026-10-30-round-four/images.py

Needs Pillow.
"""
import json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'img-src')
OUT = os.path.join(HERE, 'img')


def fetch(urls, path):
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return
    err = None
    for url in urls:
        for i in range(3):
            try:
                with urllib.request.urlopen(url, timeout=180) as r:
                    data = r.read()
                open(path, 'wb').write(data)
                return
            except Exception as e:  # a smaller original refuses !2600; try the next form
                err = e
                if getattr(e, 'code', None) == 400:
                    break
                time.sleep(3 * (i + 1))
    raise RuntimeError(f'{path}: {err}')


def save(im, path, box, quality):
    im = im.copy()
    im.thumbnail(box, Image.LANCZOS)
    im.save(path, quality=quality, optimize=True, progressive=True)


SHAPES = {'desk': (1600, 667), 'phone': (720, 900)}


def photo(item):
    k, p = item
    for shape, (w, h) in SHAPES.items():
        src = os.path.join(SRC, 'getty', f'{k}-{shape}.jpg')
        a, b, c, d = p[shape]
        region = 'pct:' + ','.join(f'{v * 100:.3f}' for v in (a, b, c - a, d - b))
        base = f"https://media.getty.edu/iiif/image/{p['image']}/{region}"
        # A region smaller than the size asked for is refused (400): take it whole.
        fetch([f'{base}/!{w},{h}/0/default.jpg', f'{base}/max/0/default.jpg'], src)
        save(Image.open(src).convert('RGB'), os.path.join(OUT, shape, f'{k}.jpg'), (w, h), 82)
    return k


def aldine(item):
    k, a = item
    src = os.path.join(SRC, 'aldine', f'{k}.jpg')
    fetch([f"https://archive.org/download/{a['item']}/page/n{a['leaf']}_w1400.jpg"], src)
    im = Image.open(src).convert('RGB')
    x0, y0, x1, y1 = a['detail']
    det = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
    save(det, os.path.join(OUT, 'ald', f'{k}.jpg'), (720, 720), 80)
    save(im, os.path.join(OUT, 'ald', f'{k}-page.jpg'), (960, 1520), 72)
    return k


if __name__ == '__main__':
    for d in [os.path.join(SRC, 'getty'), os.path.join(SRC, 'aldine'), os.path.join(OUT, 'desk'), os.path.join(OUT, 'phone'), os.path.join(OUT, 'ald')]:
        os.makedirs(d, exist_ok=True)
    picks = json.load(open(os.path.join(HERE, 'picks.json')))
    amap = json.load(open(os.path.join(HERE, 'aldine-map.json')))
    with ThreadPoolExecutor(6) as ex:
        n = len(list(ex.map(photo, picks.items())))
        m = len(list(ex.map(aldine, amap.items())))
    print(f'{n} photographs, {m} Aldine pages')
