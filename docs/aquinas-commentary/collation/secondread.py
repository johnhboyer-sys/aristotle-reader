# Second read: crop each doubtful spot from the Parma scan, OCR it again with tesseract,
# and ask which reading the print supports: Corpus Thomisticum's or Parma-OCR's.
import json, re, sys, os, subprocess, random, time, unicodedata, urllib.request, collections
from PIL import Image
D = sys.argv[1]; P = f'{D}/pdiff'
S = json.load(open(f'{P}/streams.json')); ct = S['ct']; paras = S['paras']; pm = S['pm'][400:133754]; KEEP = json.load(open(f'{P}/keep.json')) if 'P' in dir() else json.load(open('keep.json')); pm = [pm[i] for i in KEEP]
I = json.load(open(f'{P}/items.json')); items = I['items']
BX = json.load(open(f'{P}/boxes.json')); BX = [BX[i] for i in KEEP]
def norm(w):
    w = unicodedata.normalize('NFD', w.lower()); w = ''.join(c for c in w if not unicodedata.combining(c))
    return re.sub(r'[^a-z]', '', w.replace('æ', 'ae').replace('œ', 'oe').replace('j', 'i').replace('v', 'u'))
def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (ca != cb)))
        prev = cur
    return prev[-1]
os.makedirs(f'{D}/pdiff/img', exist_ok=True); os.makedirs(f'{D}/pdiff/crops', exist_ok=True)
imcache = {}
def page(k):
    f = f'{P}/img/n{k-1}.jpg'
    if not os.path.exists(f):
        urllib.request.urlretrieve(f'https://archive.org/download/sanctithomaeaqui20thom/page/n{k-1}.jpg', f); time.sleep(0.5)
    if k not in imcache:
        if len(imcache) > 6: imcache.clear()
        imcache[k] = Image.open(f).convert('L')
    return imcache[k]
def read(j0, j1, tag):
    groups = collections.OrderedDict()
    for j in range(max(0, j0), min(len(pm), j1)):
        k, boxes = BX[j][0], BX[j][1]
        if not boxes: return None, None
        for bb, line in boxes: groups.setdefault((k, line), []).append(bb)
    txt = []; crops = []
    for (k, line), bbs in groups.items():
        x0 = min(b[0] for b in bbs) - 8; y0 = min(b[1] for b in bbs) - 6; x1 = max(b[2] for b in bbs) + 8; y1 = max(b[3] for b in bbs) + 6
        im = page(k).crop((x0, y0, x1, y1)); fn = f'{P}/crops/{tag}_{len(crops)}.png'; im.save(fn); crops.append([fn, k])
        r = subprocess.run(['tesseract', fn, '-', '-l', 'eng', '--psm', '7'], capture_output=True, text=True).stdout
        txt.append(r.strip())
    return ' '.join(txt), crops
CAND = {'word', 'ocr?', 'pm+', 'ct+', 'spell', 'abbrev', 'spacing'}
if len(sys.argv) > 2: CAND = set(sys.argv[2].split(','))
random.seed(7)
ctrl = set(random.sample([i for i, it in enumerate(items) if it['c'] == 'ocr'], 80))
if len(sys.argv) > 2: ctrl = set()
todo = [i for i, it in enumerate(items) if it['c'] in CAND] + sorted(ctrl)
print('to read', len(todo), flush=True)
out = {}
for n, i in enumerate(todo):
    it = items[i]; a0, a1 = it['a']; b0, b1 = it['b']
    T, crops = read(b0 - 2, b1 + 2 if b1 > b0 else b0 + 2, f'i{i}')
    if T is None: out[i] = {'v': 'nobox'}; continue
    L = [x[0] for x in ct[max(0, a0-2):a0]]; R = [x[0] for x in ct[a1:a1+2]]
    Hct = ''.join(L + [x[0] for x in ct[a0:a1]] + R); Hpm = ''.join(L + [x[0] for x in pm[b0:b1]] + R)
    t = norm(T); dc, dp = lev(t, Hct), lev(t, Hpm)
    v = 'CT' if dc < dp else 'Parma' if dp < dc else 'tie'
    out[i] = {'v': v, 'T': T, 'dc': dc, 'dp': dp, 'q': round(min(dc, dp) / max(1, len(Hct)), 2), 'crops': crops, 'ctrl': i in ctrl}
    if n % 100 == 0: print(n, flush=True)
json.dump(out, open(f'{P}/' + (sys.argv[3] if len(sys.argv) > 3 else 'second.json'), 'w'))
tab = collections.Counter((items[i]['c'], o['v']) for i, o in out.items())
for c in ['ocr', 'word', 'ocr?', 'pm+', 'ct+', 'spell', 'abbrev', 'spacing']:
    print(c, {v: tab[(c, v)] for v in ['CT', 'Parma', 'tie', 'nobox']})
