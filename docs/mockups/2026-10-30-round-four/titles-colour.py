"""What a solid title in another colour, or the same red at full strength,
would do over the photographs as they are, with no wash: John's question (30
October) whether varying the title's colour and opacity could make it legible.

Reads the pictures titles-legibility.cjs shot (the letter masks, and each
poster without its title under As now) and takes the same measure as
titles-legibility.py. It needs no new pictures: a letter of colour C at
opacity a over a photograph pixel G shows a*C + (1-a)*G, the model the washes
were tuned with. The first row, the page's red at 82%, checks that model
against the As now pictures, which were shot with the red in place.

    python3 docs/mockups/2026-10-30-round-four/titles-colour.py

Needs Pillow and numpy, and titles-legibility.cjs run first.
"""
import json, os, re
import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'title-legibility')
HARD = 0.25
TITLES = [
    ('red at 82% (the page now)', '#e2382e', .82),
    ('red at 100%', '#e2382e', 1),
    ('dark red at 100%', '#8b1a10', 1),
    ('black at 100%', '#141414', 1),
    ('pale red at 100%', '#ffb3a8', 1),
    ('cream at 100%', '#f4efe6', 1),
]
PAIRS = [
    ('red or cream, per photograph', 'red at 100%', 'cream at 100%'),
    ('dark red or pale red, per photograph', 'dark red at 100%', 'pale red at 100%'),
    ('dark red or cream, per photograph', 'dark red at 100%', 'cream at 100%'),
]
KEYS = [(size, setting) for size in ('desk', 'phone') for setting in ('now', 'block-big')]


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


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


below2 = {}  # (title, size, setting, po) -> share of letter area below 2:1
for f in sorted(os.listdir(os.path.join(HERE, 'mask'))):
    size, setting, po = re.match(r'(desk|phone)-(now|block-big)-(.+)-m\.png$', f).groups()
    inner = letters(load(os.path.join(HERE, 'mask', f)))
    g = load(os.path.join(HERE, 'now', f'{size}-{setting}-{po}-g.png'))
    h, w = min(g.shape[0], inner.shape[0]), min(g.shape[1], inner.shape[1])
    m = inner[:h, :w]
    ground = g[:h, :w][m]
    lg = lum(ground)
    for name, colour, a in TITLES:
        lw = lum(a * rgb(colour) + (1 - a) * ground)
        r = (np.maximum(lw, lg) + 0.05) / (np.minimum(lw, lg) + 0.05)
        below2[(name, size, setting, po)] = float((r < 2).mean())
posters = sorted({k[3] for k in below2})
for name, x, y in PAIRS:
    for size, setting in KEYS:
        for po in posters:
            below2[(name, size, setting, po)] = min(below2[(x, size, setting, po)], below2[(y, size, setting, po)])

measured = {(x['size'], x['set'], x['po']): x['below2'] for x in json.load(open(os.path.join(HERE, 'summary.json')))['posters'] if x['tr'] == 'now'}
gap = max(abs(below2[(TITLES[0][0], *k)] - v) for k, v in measured.items())
print(f'Model check: the page now, computed against shot, differs by at most {gap:.1%} of a poster\'s letter area.\n')
print('Posters hard to read (over a quarter of the letters below 2:1), and in brackets those with over 5% below 2:1, of 42:\n')
print(f"{'title':40}" + ''.join(f'{s + " " + t:>16}' for s, t in KEYS))
for name in [t[0] for t in TITLES] + [p[0] for p in PAIRS]:
    cells = []
    for size, setting in KEYS:
        v = [below2[(name, size, setting, po)] for po in posters]
        cells.append(f'{sum(x > HARD for x in v):>3} ({sum(x > 0.05 for x in v):>2})')
    print(f'{name:40}' + ''.join(f'{c:>16}' for c in cells))
best = PAIRS[-1][0]
print(f'\nStill hard with {best}:')
for size, setting in KEYS:
    hard = [f'{po} {below2[(best, size, setting, po)]:.0%}' for po in posters if below2[(best, size, setting, po)] > HARD]
    print(f'  {size} {setting}: ' + (', '.join(hard) or 'none'))
