#!/usr/bin/env python3
"""Wikimedia helper with backoff.
  wm.py search "query" [limit]     -> list files
  wm.py info "File:Name.jpg"        -> url, size, licence, author, date, description
  wm.py get "File:Name.jpg" out.jpg [width]  -> download (thumb at width, or original)
"""
import json, sys, time, urllib.request, urllib.parse, urllib.error, re
UA = 'AristotleReaderDesign/1.0 (https://aristotle.johnhboyer.com; design mockup) python-urllib'
def fetch(url, binary=False, tries=8):
    for i in range(tries):
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502):
                wait = int(e.headers.get('retry-after') or 5) + 2 + i * 2
                print(f'  [{e.code}, waiting {wait}s]', file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise SystemExit('gave up: ' + url)
API = 'https://commons.wikimedia.org/w/api.php?'
def clean(s): return re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', s or '')).strip()
cmd = sys.argv[1]
if cmd == 'search':
    q = sys.argv[2]; lim = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    p = {'action': 'query', 'generator': 'search', 'gsrsearch': q, 'gsrnamespace': 6, 'gsrlimit': lim,
         'prop': 'imageinfo', 'iiprop': 'size|extmetadata|mime', 'iiextmetadatafilter': 'LicenseShortName|DateTimeOriginal|Artist', 'format': 'json'}
    d = fetch(API + urllib.parse.urlencode(p))
    pages = sorted((d.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
    for pg in pages:
        ii = (pg.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
        g = lambda k: clean((md.get(k) or {}).get('value', ''))
        print(f"{ii.get('width')}x{ii.get('height')} | {g('LicenseShortName')[:16]:16} | {pg['title'][5:]} | {g('Artist')[:40]} | {g('DateTimeOriginal')[:30]}")
elif cmd == 'info':
    t = sys.argv[2]
    p = {'action': 'query', 'titles': t, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'format': 'json'}
    d = fetch(API + urllib.parse.urlencode(p))
    for pg in d['query']['pages'].values():
        ii = (pg.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
        out = {'title': pg.get('title'), 'url': ii.get('url'), 'page': ii.get('descriptionurl'), 'w': ii.get('width'), 'h': ii.get('height')}
        for k in ('LicenseShortName', 'UsageTerms', 'Artist', 'DateTimeOriginal', 'ImageDescription', 'Credit', 'ObjectName'):
            out[k] = clean((md.get(k) or {}).get('value', ''))[:400]
        print(json.dumps(out, ensure_ascii=False, indent=1))
elif cmd == 'get':
    t, out = sys.argv[2], sys.argv[3]; w = sys.argv[4] if len(sys.argv) > 4 else None
    p = {'action': 'query', 'titles': t, 'prop': 'imageinfo', 'iiprop': 'url|size', 'format': 'json'}
    if w: p['iiurlwidth'] = w
    d = fetch(API + urllib.parse.urlencode(p))
    ii = list(d['query']['pages'].values())[0]['imageinfo'][0]
    url = ii.get('thumburl') if w else ii['url']
    data = fetch(url, binary=True)
    open(out, 'wb').write(data)
    print(f'saved {out} {len(data)//1024} KB from {url}')
