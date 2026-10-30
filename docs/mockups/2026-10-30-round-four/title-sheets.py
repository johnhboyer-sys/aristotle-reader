"""Lay out title-options.cjs's pictures as four sheets: whole words and
broken words, each on phone and on desktop. Writes them to title-options/.

    python3 docs/mockups/2026-10-30-round-four/title-sheets.py

Needs Pillow.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'title-options')
LABELS = {
    'now': 'Now',
    'justified': '1  Justified: one size, bigger; word spaces stretched to the width',
    'stacked': '2  Stacked: each line at its own size, filling the width',
    'stacked-spread': '3  Stacked and spread from top to bottom',
    'block': '1  Block: words break; every line meets both edges',
    'block-big': '2  Bigger block, a little more letter spacing',
    'block-spread': '3  Option 2, lines spread from top to bottom',
}
SETS = {
    'whole': ['now', 'justified', 'stacked', 'stacked-spread'],
    'broken': ['now', 'block', 'block-big', 'block-spread'],
}


def sheet(kind, names, colw, opts, out, gap=24):
    font = ImageFont.load_default(size=30)
    rows = [[Image.open(os.path.join(HERE, f'{kind}-{n}-{o}.png')).convert('RGB') for n in names] for o in opts]
    rows = [[im.resize((colw, round(im.height * colw / im.width)), Image.LANCZOS) for im in row] for row in rows]
    rowh = max(im.height for row in rows for im in row)
    s = Image.new('RGB', (80 + len(names) * (colw + gap) - gap, 40 + len(opts) * (rowh + 60)), 'white')
    d = ImageDraw.Draw(s)
    y = 30
    for o, row in zip(opts, rows):
        d.text((40, y), LABELS[o], fill='black', font=font)
        y += 44
        x = 40
        for im in row:
            s.paste(im, (x, y))
            x += colw + gap
        y += rowh + 16
    s.save(os.path.join(HERE, out), quality=88)
    print(out, s.size)


for name, opts in SETS.items():
    sheet('phone', ['home', 'en', 'pol', 'juv'], 300, opts, f'{name}-phone.jpg')
    sheet('desktop', ['home', 'en'], 640, opts, f'{name}-desktop.jpg')
