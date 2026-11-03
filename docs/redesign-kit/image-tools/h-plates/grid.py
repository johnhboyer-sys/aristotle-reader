#!/usr/bin/env python3
"""Grid overlay for choosing crops. usage: grid.py src out.jpg [maxpx]"""
import sys
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
im = Image.open(src).convert('RGB'); W0, H0 = im.size
im.thumbnail((mx, mx)); w, h = im.size
d = ImageDraw.Draw(im)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
for i in range(1, 10):
    x = w * i / 10; y = h * i / 10
    d.line([(x, 0), (x, h)], fill=(255, 0, 0), width=1)
    d.line([(0, y), (w, y)], fill=(0, 90, 255), width=1)
    d.text((x + 2, 2), f'.{i}', fill=(255, 0, 0), font=f)
    d.text((2, y + 1), f'.{i}', fill=(0, 90, 255), font=f)
im.save(out, quality=85); print(out, (W0, H0), '->', im.size)
