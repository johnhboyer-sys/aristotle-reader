# Contact sheets of the crops still in doubt, labelled with item number and the two readings, for a reading by eye.
import json, sys
from PIL import Image, ImageDraw, ImageFont
D = sys.argv[1]; P = f'{D}/pdiff'
S = json.load(open(f'{P}/streams.json')); ct = S['ct']; pm = S['pm'][400:133754]; KEEP = json.load(open(f'{P}/keep.json')); pm = [pm[i] for i in KEEP]
items = json.load(open(f'{P}/items.json'))['items']; out = json.load(open(f'{P}/second.json'))
want = [int(i) for i, o in out.items() if not o.get('ctrl') and o['v'] in ('Parma', 'tie') and items[int(i)]['c'] in ('word', 'ocr?', 'pm+', 'ct+')]
want.sort()
font = ImageFont.load_default(size=22)
rows = []
for i in want:
    it = items[i]; a0, a1 = it['a']; b0, b1 = it['b']
    lab = f"#{i}  M: {' '.join(x[1] for x in ct[a0:a1]) or '—'}   P: {' '.join(x[1] for x in pm[b0:b1]) or '—'}"
    ims = [Image.open(c[0]) for c in out[str(i)]['crops']]
    h = 56; ims = [im.resize((max(1, int(im.width * h / im.height)), h)) for im in ims]
    w = sum(im.width for im in ims) + 12 * len(ims)
    row = Image.new('L', (max(560, w + 560), h + 8), 255); d = ImageDraw.Draw(row)
    d.text((6, 16), lab[:46], fill=0, font=font); x = 560
    for im in ims: row.paste(im, (x, 4)); x += im.width + 12
    rows.append(row)
per = 18; n = 0
for s in range(0, len(rows), per):
    grp = rows[s:s+per]; W = min(2000, max(r.width for r in grp)); H = sum(r.height + 6 for r in grp)
    sheet = Image.new('L', (W, H), 235); y = 0
    for r in grp: sheet.paste(r.crop((0, 0, min(W, r.width), r.height)), (0, y)); y += r.height + 6
    sheet.save(f'{P}/sheet_{n:02d}.png'); n += 1
print('items', len(want), 'sheets', n)
