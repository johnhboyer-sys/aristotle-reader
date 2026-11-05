# Map each Parma token (De anima slice) to its hOCR word boxes: page k, [x0,y0,x1,y1] per word, line id.
import json, re, sys, html, unicodedata
D = sys.argv[1]
S = json.load(open(f'{D}/pdiff/streams.json')); pmall = S['pm']
def norm(w):
    w = unicodedata.normalize('NFD', w.lower()); w = ''.join(c for c in w if not unicodedata.combining(c))
    return re.sub(r'[^a-z]', '', w.replace('æ', 'ae').replace('œ', 'oe').replace('j', 'i').replace('v', 'u'))
s = open(f'{D}/pdiff/p20_hocr.html', encoding='utf-8').read()
pages = {}
for m in re.finditer(r'<div class="ocr_page" id="page_(\d+)"', s): pages[int(m[1])] = m.start()
starts = sorted(pages.items())
need = sorted({x[2] for x in pmall[400:133754]})
out = {}; bad = 0; tot = 0
for i, (k, a) in enumerate(starts):
    if k not in need: continue
    z = starts[i+1][1] if i + 1 < len(starts) else len(s)
    pg = s[a:z]; words = []
    for lm in re.finditer(r'<span class="ocr_line"[^>]*?title="[^"]*?x_size ([\d.]+)[^"]*"[^>]*?id="([^"]+)"(.*?)(?=<span class="ocr_line"|\Z)', pg, re.S):
        for wm in re.finditer(r'<span class="ocrx_word" id="[^"]+" title="bbox (\d+) (\d+) (\d+) (\d+)[^"]*"[^>]*>(.*?)</span>', lm[3], re.S):
            words.append((html.unescape(re.sub(r'<[^>]+>', '', wm[5])).strip(), [int(wm[1]), int(wm[2]), int(wm[3]), int(wm[4])], lm[2], round(float(lm[1]))))
    merged = []; j = 0
    while j < len(words):
        raw, boxes, xs = words[j][0], [(words[j][1], words[j][2])], words[j][3]
        while re.search(r'\w[-¬]$', raw) and j + 1 < len(words) and re.match(r'\w', words[j+1][0]):
            j += 1; raw = raw[:-1] + words[j][0]; boxes.append((words[j][1], words[j][2]))
        for part in raw.split():   # a box may hold two words
            if norm(part): merged.append((part, boxes, xs))
        j += 1
    out[k] = merged
# zip with pm tokens page by page
res = []
from itertools import groupby
idx = 400
for k, grp in groupby(range(400, 133754), key=lambda t: pmall[t][2]):
    grp = list(grp); mk = out.get(k, [])
    for n, t in enumerate(grp):
        tot += 1
        if n < len(mk) and norm(mk[n][0]) == pmall[t][0]: res.append([k, mk[n][1], mk[n][2]])
        else: res.append([k, None, None]); bad += 1
print('tokens', tot, 'unmapped', bad)
json.dump(res, open(f'{D}/pdiff/boxes.json', 'w'))
import collections
print('type sizes', sorted(collections.Counter(r[2] for r in res).items(), key=lambda x: -x[1])[:12])
