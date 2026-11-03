# A numbered contact sheet of thumbnails: <dir>/th/NNNN.jpg, labels from
# candidates.json. usage: python3 -I sheet.py <dir> <out.png> [start] [count]
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
count = int(sys.argv[4]) if len(sys.argv) > 4 else 40
rows = json.load(open(os.path.join(d, 'candidates.json')))
cell, cols = 240, 6
items = [n for n in range(len(rows)) if os.path.exists(os.path.join(d, 'th', f'{n:04d}.jpg'))][start:start + count]
H = ((len(items) + cols - 1) // cols) * (cell + 34)
sheet = Image.new('RGB', (cols * cell, max(H, 10)), 'white')
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
except Exception: font = ImageFont.load_default()
for i, n in enumerate(items):
    x, y = (i % cols) * cell, (i // cols) * (cell + 34)
    try:
        im = Image.open(os.path.join(d, 'th', f'{n:04d}.jpg')).convert('RGB'); im.thumbnail((cell - 8, cell - 8))
        sheet.paste(im, (x + 4, y + 4))
    except Exception: pass
    r = rows[n]
    label = f"{n}  " + (r.get('title') or '')[:38].replace('File:', '')
    sub = (r.get('date') or r.get('year') or '')[:14] + ' ' + (r.get('provider') or r.get('artist') or '')[:24]
    dr.text((x + 4, y + cell - 2), label, fill='black', font=font)
    dr.text((x + 4, y + cell + 12), sub, fill='#555', font=font)
sheet.save(out); print(out, len(items))
