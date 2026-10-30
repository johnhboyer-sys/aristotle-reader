"""Build gelatin.html: the Getty gelatin silver candidates in
gelatin-candidates.json on B's posters, for John to vote on. Published as its
own artifact, with the pictures in img/ as supporting files.

    SSL_CERT_FILE=/etc/ssl/cert.pem python3 docs/mockups/2026-10-30-round-four/gelatin.py

gelatin-cuts.json holds, for each candidate, the print inside its mount or
card (`box`, fractions of the Getty image), the point each cut centres on
(`focus`), and any line the page should add about it (`flag`). A stereograph's box is its left half. The Getty's IIIF server cuts
the largest 2.4:1 and 4:5 regions that fit the box from the full-size
original. Writes img/gel/{desk,phone,whole}/<work>-<n>.jpg, gelatin.html, and
gelatin-test.html, a copy with a doctype for gelatin-check.cjs. Needs Pillow,
round one's data.json, and images.py run first (the Now row uses its cuts).
"""
import json, os
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from images import fetch, save, SHAPES, SRC, OUT

HERE = os.path.dirname(os.path.abspath(__file__))
RATIO = {'desk': 2.4, 'phone': 0.8}


def load(f):
    return json.load(open(os.path.join(HERE, f), encoding='utf-8'))


def cut(c, cuts, shape):
    """The largest region of the shape's ratio inside the box, centred on the focus as far as it fits."""
    W, H = c['width'], c['height']
    x0, y0, x1, y1 = cuts['box']
    bw, bh = (x1 - x0) * W, (y1 - y0) * H
    w = min(bw, bh * RATIO[shape])
    h = w / RATIO[shape]
    x = min(max(cuts['focus'][0] * W - w / 2, x0 * W), x1 * W - w)
    y = min(max(cuts['focus'][1] * H - h / 2, y0 * H), y1 * H - h)
    return x / W, y / H, w / W, h / H, w


def pictures(item):
    k, i, c, cuts = item
    name = f'{k}-{i}'
    low = []
    for shape, (w, h) in SHAPES.items():
        a, b, cw, ch, px = cut(c, cuts, shape)
        if px < w * 0.9:
            low.append(f'{name} {shape} {round(px)}px')
        base = f"https://media.getty.edu/iiif/image/{c['image']}/pct:{a * 100:.3f},{b * 100:.3f},{cw * 100:.3f},{ch * 100:.3f}"
        src = os.path.join(SRC, 'gelatin', f'{name}-{shape}.jpg')
        fetch([f'{base}/!{w},{h}/0/default.jpg', f'{base}/max/0/default.jpg'], src)
        save(Image.open(src).convert('RGB'), os.path.join(OUT, 'gel', shape, f'{name}.jpg'), (w, h), 82)
    save(Image.open(os.path.join(SRC, 'gelatin', f"{c['image']}-whole.jpg")).convert('RGB'), os.path.join(OUT, 'gel', 'whole', f'{name}.jpg'), (700, 700), 78)
    return low


candidates = load('gelatin-candidates.json')
cuts = load('gelatin-cuts.json')
photos = load('photos.json')
reg = load(os.path.join('..', '2026-10-29-directions', 'data.json'))['registry']
by = {w['id']: w for w in reg['works']}
order = [x['id'] for c in reg['categories'] for s in (c.get('subcategories') or [{'works': c.get('works') or []}]) for x in s['works']]
order += [w['id'] for w in reg['works'] if w['id'] not in order]

os.makedirs(os.path.join(SRC, 'gelatin'), exist_ok=True)
for s in ('desk', 'phone', 'whole'):
    os.makedirs(os.path.join(OUT, 'gel', s), exist_ok=True)
items = [(k, i, c, cuts[f'{k}.{i}']) for k in candidates for i, c in enumerate(candidates[k])]
with ThreadPoolExecutor(6) as ex:
    low = [x for r in ex.map(pictures, items) for x in r]

works = []
for k in order:
    if k not in candidates:
        continue
    now = photos[k]
    works.append({'id': k, 'title': by[k]['title'], 'now': {'title': now['title'], 'maker': now['maker'], 'date': now['date']}, 'cands': [{
        'n': i, 'title': c['title'], 'maker': c['maker'], 'date': c['date'], 'url': c['url'], 'cap': c['cap'], 'flag': cuts[f'{k}.{i}'].get('flag', ''),
        'a': round(c['width'] / c['height'], 4),
    } for i, c in enumerate(candidates[k])]})
left = [k for k in order if k not in candidates]
already = [by[k]['title'] for k in left if 'gelatin' in photos[k].get('medium', '').lower()]
none = [by[k]['title'] for k in left if by[k]['title'] not in already]

data = {'works': works, 'none': none, 'already': already}
read = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()
page = read('gelatin-page.html').replace('/*__TL__*/', read('title-layout.js')).replace('/*__DATA__*/{}', json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
open(os.path.join(HERE, 'gelatin.html'), 'w', encoding='utf-8').write(page)
# The same skeleton titles.py gives its local copy.
SKELETON = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
            'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n')
open(os.path.join(HERE, 'gelatin-test.html'), 'w', encoding='utf-8').write(SKELETON + page + '\n</body></html>\n')
print(len(works), 'works,', len(items), 'candidates,', len(none), 'works without one,', len(already), 'already gelatin silver')
print('cuts smaller than their poster:', low or 'none')
