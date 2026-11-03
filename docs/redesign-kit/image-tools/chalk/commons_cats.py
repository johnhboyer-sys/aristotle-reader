# Files in given Commons categories (and their subcategories, one level),
# kept when public domain or CC0, with thumbnails at a standard width.
# usage: python3 -I commons_cats.py <outdir> <Category:...> [...]
import json, sys, time, urllib.parse, urllib.request, os, re
OUT, CATS = sys.argv[1], sys.argv[2:]
os.makedirs(os.path.join(OUT, 'th'), exist_ok=True)
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'AristotleReaderMockup/1.0 (https://aristotle.johnhboyer.com; research)'}
def get(p):
    p = {**p, 'format': 'json', 'formatversion': '2'}
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + '?' + urllib.parse.urlencode(p), headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(6 * (k + 1))
    return {}
def members(c, kind):
    res, cont = [], {}
    while True:
        d = get({'action': 'query', 'list': 'categorymembers', 'cmtitle': c, 'cmtype': kind, 'cmlimit': 500, **cont})
        res += [x['title'] for x in d.get('query', {}).get('categorymembers', [])]
        if 'continue' not in d or len(res) > 1500: return res
        cont = d['continue']; time.sleep(1)
files = {}
for c in CATS:
    for f in members(c, 'file'): files.setdefault(f, c)
    time.sleep(1)
    for sc in members(c, 'subcat')[:40]:
        for f in members(sc, 'file'): files.setdefault(f, sc)
        time.sleep(1)
titles = [t for t in sorted(files) if re.search(r'\.(jpe?g|tiff?|png)$', t, re.I)]
print(len(titles), 'image files', file=sys.stderr)
prev = json.load(open(os.path.join(OUT, 'candidates.json'))) if os.path.exists(os.path.join(OUT, 'candidates.json')) else []
known = {r['title'] for r in prev}
rows = list(prev)
for i in range(0, len(titles), 50):
    batch = [t for t in titles[i:i + 50] if t not in known]
    if not batch: continue
    d = get({'action': 'query', 'prop': 'imageinfo', 'titles': '|'.join(batch), 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 330})
    for pg in d.get('query', {}).get('pages', []):
        ii = (pg.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
        val = lambda k: re.sub(r'<[^>]+>', '', (md.get(k) or {}).get('value', '') or '').strip()
        lic = val('LicenseShortName')
        if not re.search(r'public domain|^pd|cc0|no restrictions', lic, re.I): continue
        rows.append({'title': pg['title'], 'lic': lic, 'w': ii.get('width'), 'h': ii.get('height'), 'thumb': ii.get('thumburl'), 'url': ii.get('url'),
                     'page': ii.get('descriptionurl'), 'artist': val('Artist')[:120], 'date': val('DateTimeOriginal')[:60], 'desc': val('ImageDescription')[:300],
                     'credit': val('Credit')[:200], 'why': [files[pg['title']]]})
    time.sleep(1)
json.dump(rows, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
print(len(rows), 'public domain or CC0 in all', file=sys.stderr)
for n, r in enumerate(rows):
    fn = os.path.join(OUT, 'th', f'{n:04d}.jpg')
    if not r.get('thumb') or os.path.exists(fn): continue
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(r['thumb'], headers=UA), timeout=60) as resp, open(fn, 'wb') as f:
                f.write(resp.read())
            break
        except Exception as e:
            time.sleep(8 * (k + 1))
    time.sleep(1.2)
print('done', file=sys.stderr)
