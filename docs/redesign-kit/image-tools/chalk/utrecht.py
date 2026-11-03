# Full-size image and description of Utrecht Archives items found through
# Europeana. usage: python3 -I utrecht.py <candidates.json> <outdir> <n> [<n> ...]
import json, sys, re, os, urllib.request
cand, out, ns = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]]
rows = json.load(open(cand)); os.makedirs(out, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0'}
def fetch(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120) as r: return r.read()
for n in ns:
    r = rows[n]
    rec = json.loads(fetch('https://api.europeana.eu/record/v2' + r['id'] + '.json?wskey=api2demo'))['object']
    shownAt = rec['aggregations'][0].get('edmIsShownAt'); rights = rec['aggregations'][0].get('edmRights')
    desc = ''
    for p in rec.get('proxies', []):
        if 'dcDescription' in p: desc = list(p['dcDescription'].values())[0][0]
    page = fetch(shownAt).decode('utf-8', 'replace')
    m = re.search(r'images\.memorix\.nl/utr/thumb/\d+x\d+/([0-9a-f-]{36})\.jpg', page)
    meta = {'n': n, 'title': r['title'], 'desc': desc, 'page': shownAt, 'rights': rights, 'uuid': m.group(1) if m else None}
    if m:
        data = fetch(f'https://images.memorix.nl/utr/iiif/{m.group(1)}/full/max/0/default.jpg')
        open(os.path.join(out, f'utr-{n}.jpg'), 'wb').write(data)
        meta['bytes'] = len(data)
    print(json.dumps(meta, ensure_ascii=False))
