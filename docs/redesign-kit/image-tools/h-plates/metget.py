#!/usr/bin/env python3
"""Download Met previews (web-large) or originals. usage: metget.py [--orig] ID [ID ...]
Saves to scratchpad/dl/met-<id>/(web|orig).jpg and meta.json."""
import json, sys, os, time, urllib.request, urllib.parse
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
DL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dl')
args = sys.argv[1:]
orig = '--orig' in args
ids = [a for a in args if a != '--orig']
def get(url, binary=False):
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                d = r.read()
                return d if binary else json.loads(d)
        except Exception as e:
            print('  retry', e, file=sys.stderr); time.sleep(3 + 3 * i)
    raise SystemExit('failed ' + url)
for i in ids:
    o = get(f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{i}')
    d = os.path.join(DL, f'met-{i}'); os.makedirs(d, exist_ok=True)
    keys = ['objectID', 'isPublicDomain', 'title', 'artistDisplayName', 'artistDisplayBio', 'objectDate', 'medium', 'dimensions', 'accessionNumber', 'creditLine', 'primaryImage', 'primaryImageSmall', 'objectURL', 'additionalImages']
    json.dump({k: o.get(k) for k in keys}, open(os.path.join(d, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    url = o.get('primaryImage') if orig else o.get('primaryImageSmall')
    if not url: print(i, 'no image'); continue
    data = get(urllib.parse.quote(url, safe=":/%"), binary=True)
    fn = os.path.join(d, 'orig.jpg' if orig else 'web.jpg')
    open(fn, 'wb').write(data)
    print(f"{i} {len(data)//1024}KB PD={o.get('isPublicDomain')} {o.get('title','')[:60]} -> {fn}")
