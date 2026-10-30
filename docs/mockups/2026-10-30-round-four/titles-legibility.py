"""How well each poster's title stands out from its photograph, under each
photo treatment, from titles-legibility.cjs's pictures.

For every pixel inside the letters (found from the title shot alone on
plain ground, less a two-pixel rim, which also absorbs the pixel by which
the three shots can differ), the contrast between the poster as
shown and the poster without its title: the WCAG ratio of their relative
luminances. 1:1 is a letter that has vanished; 3:1 is WCAG's minimum for
large text. A poster counts as hard to read when more than a quarter of its
letters' area is below 2:1. The page's washes are the lightest under which
no poster has more than 5% of its letters' area below 2:1 (the last column).

    python3 docs/mockups/2026-10-30-round-four/titles-legibility.py

Writes title-legibility/summary.json. Needs Pillow and numpy.
"""
import json, os, re
import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'title-legibility')
TREATS = ['now', 'pale', 'gray', 'dark']
HARD = 0.25


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) / 255


def lum(a):
    c = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def letters(m):
    ink = lum(m) < 0.1
    inner = ink.copy()
    for dy, dx in ((2, 0), (-2, 0), (0, 2), (0, -2), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        inner &= np.roll(ink, (dy, dx), axis=(0, 1))
    return inner


rows = []
masks = {}
for f in sorted(os.listdir(os.path.join(HERE, 'mask'))):
    size, setting, po = re.match(r'(desk|phone)-(now|block-big)-(.+)-m\.png$', f).groups()
    masks[(size, setting, po)] = letters(load(os.path.join(HERE, 'mask', f)))
for tr in TREATS:
    for (size, setting, po), inner in masks.items():
        w = load(os.path.join(HERE, tr, f'{size}-{setting}-{po}-w.png'))
        g = load(os.path.join(HERE, tr, f'{size}-{setting}-{po}-g.png'))
        h = min(w.shape[0], g.shape[0], inner.shape[0])
        wd = min(w.shape[1], g.shape[1], inner.shape[1])
        m = inner[:h, :wd]
        lw, lg = lum(w[:h, :wd])[m], lum(g[:h, :wd])[m]
        r = (np.maximum(lw, lg) + 0.05) / (np.minimum(lw, lg) + 0.05)
        rows.append({'tr': tr, 'size': size, 'set': setting, 'po': po, 'n': int(r.size),
                     'below2': float((r < 2).mean()), 'below3': float((r < 3).mean()), 'median': float(np.median(r))})

summary = {}
for tr in TREATS:
    for size in ('desk', 'phone'):
        for setting in ('now', 'block-big'):
            rs = [x for x in rows if (x['tr'], x['size'], x['set']) == (tr, size, setting)]
            summary[f'{tr} {size} {setting}'] = {
                'posters': len(rs),
                'hard': sum(x['below2'] > HARD for x in rs),
                'median_below2': round(float(np.median([x['below2'] for x in rs])), 3),
                'median_below3': round(float(np.median([x['below3'] for x in rs])), 3),
                'median_ratio': round(float(np.median([x['median'] for x in rs])), 2),
                'over5': sum(x['below2'] > 0.05 for x in rs),
            }
json.dump({'summary': summary, 'posters': rows}, open(os.path.join(HERE, 'summary.json'), 'w'), indent=1)
print(f"{'treatment size setting':28} posters  hard  below2:1  below3:1  ratio  over5%")
for k, v in summary.items():
    print(f"{k:28} {v['posters']:7} {v['hard']:5} {v['median_below2']:9.0%} {v['median_below3']:9.0%} {v['median_ratio']:6} {v['over5']:6}")
now = sorted((x for x in rows if x['tr'] == 'now'), key=lambda x: -x['below2'])
print('\nHardest to read now (share of letter area below 2:1):')
for x in now[:16]:
    print(f"  {x['po']:8} {x['size']:5} {x['set']:9} {x['below2']:.0%}")
