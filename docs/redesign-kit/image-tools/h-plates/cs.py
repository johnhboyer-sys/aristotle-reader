#!/usr/bin/env python3
"""Search Wikimedia Commons files. usage: cs.py "query" [limit]"""
import json, sys, urllib.request, urllib.parse, re
UA = 'AristotleReaderDesign/1.0 (design mockup; python urllib)'
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)
q = sys.argv[1]
lim = int(sys.argv[2]) if len(sys.argv) > 2 else 12
params = {'action': 'query', 'generator': 'search', 'gsrsearch': q, 'gsrnamespace': 6, 'gsrlimit': lim,
          'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime', 'format': 'json'}
d = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params))
pages = sorted((d.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
for p in pages:
    ii = (p.get('imageinfo') or [{}])[0]
    md = ii.get('extmetadata', {})
    lic = (md.get('LicenseShortName') or {}).get('value', '')
    date = re.sub('<[^>]+>', '', (md.get('DateTimeOriginal') or {}).get('value', ''))[:40]
    art = re.sub('<[^>]+>', '', (md.get('Artist') or {}).get('value', ''))[:50]
    print(f"{ii.get('width')}x{ii.get('height')} {ii.get('mime','')[6:]:5} | {lic[:18]:18} | {p['title'][5:][:90]} | {art} | {date}")
