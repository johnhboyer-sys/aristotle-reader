#!/usr/bin/env python3
"""Contact sheet. usage: sheet.py out.jpg cell_px label=path [label=path ...]"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps
Image.MAX_IMAGE_PIXELS = None
out, cell = sys.argv[1], int(sys.argv[2])
items = [a.split('=', 1) for a in sys.argv[3:]]
cols = 3 if len(items) > 4 else len(items)
cols = max(1, cols)
rows = (len(items) + cols - 1) // cols
W = cols * cell; H = rows * (cell + 24)
sheet = Image.new('RGB', (W, H), 'white')
dr = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception:
    font = ImageFont.load_default()
for k, (lab, p) in enumerate(items):
    im = Image.open(p); im = ImageOps.exif_transpose(im).convert('RGB')
    im.thumbnail((cell - 8, cell - 8))
    x = (k % cols) * cell; y = (k // cols) * (cell + 24)
    sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
    dr.text((x + 6, y + cell + 3), f'{lab} {Image.open(p).size}', fill='black', font=font)
sheet.save(out, quality=85)
print('wrote', out, sheet.size)
