#!/usr/bin/env python3
"""Met open access helper.
  met.py search "query" [limit]   -> public-domain objects with images: id, title, artist, date, medium
  met.py obj ID                     -> full record summary
"""
import json, sys, time, urllib.request, urllib.parse, urllib.error
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
B = 'https://collectionapi.metmuseum.org/public/collection/'
def fetch(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 403):
                time.sleep(3 + 3 * i); continue
            raise
    return {}
def obj(i):
    return fetch(f'{B}v1/objects/{i}')
cmd = sys.argv[1]
if cmd == 'search':
    q = sys.argv[2]; lim = int(sys.argv[3]) if len(sys.argv) > 3 else 15
    d = fetch(f'{B}v1.1/search?' + urllib.parse.urlencode({'q': q, 'hasImages': 'true', 'limit': lim, 'offset': 0}))
    ids = d.get('objectIDs') or [x.get('objectID') for x in d.get('results', d.get('data', []))] if isinstance(d, dict) else []
    if not ids:
        print(json.dumps(d)[:800]); sys.exit()
    for i in ids[:lim]:
        o = obj(i)
        if not o: continue
        print(f"{i} | PD={o.get('isPublicDomain')} | {o.get('title','')[:70]} | {o.get('artistDisplayName','')[:30]} | {o.get('objectDate','')} | {o.get('medium','')[:40]}")
elif cmd == 'obj':
    o = obj(sys.argv[2])
    keys = ['objectID', 'isPublicDomain', 'title', 'artistDisplayName', 'objectDate', 'medium', 'dimensions', 'accessionNumber', 'creditLine', 'primaryImage', 'objectURL', 'additionalImages']
    print(json.dumps({k: o.get(k) for k in keys}, ensure_ascii=False, indent=1))
