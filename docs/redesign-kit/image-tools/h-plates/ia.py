#!/usr/bin/env python3
"""archive.org helper.
  ia.py inside ID query        -> page indexes (leaf numbers) where OCR text matches
  ia.py page ID N out.jpg [w]  -> download page leaf N (0-based 'n' index) at width w (default full)
  ia.py meta ID                -> licence, title, date, page count
"""
import json, sys, time, urllib.request, urllib.parse
UA = 'AristotleReaderDesign/1.0 (https://aristotle.johnhboyer.com)'
def get(url, binary=False):
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                d = r.read()
                return d if binary else json.loads(d)
        except Exception as e:
            print('  retry', str(e)[:80], file=sys.stderr); time.sleep(3 + 4 * i)
    raise SystemExit('failed ' + url)
cmd, ident = sys.argv[1], sys.argv[2]
if cmd == 'meta':
    m = get(f'https://archive.org/metadata/{ident}')
    md = m.get('metadata', {})
    print(json.dumps({k: md.get(k) for k in ('title', 'creator', 'date', 'licenseurl', 'rights', 'contributor', 'imagecount', 'possible-copyright-status')}, ensure_ascii=False, indent=1))
    print('server', m.get('server'), 'dir', m.get('dir'))
elif cmd == 'inside':
    q = sys.argv[3]
    m = get(f'https://archive.org/metadata/{ident}')
    server, d = m['server'], m['dir']
    # find the djvu/chOCR doc name
    url = f'https://{server}/fulltext/inside.php?' + urllib.parse.urlencode({'item_id': ident, 'doc': ident, 'path': d, 'q': q})
    r = get(url)
    for h in r.get('matches', [])[:40]:
        pars = h.get('par', [])
        pg = pars[0].get('page') if pars else None
        print('page', pg, '|', h.get('text', '')[:100].replace('\n', ' '))
elif cmd == 'page':
    n = int(sys.argv[3]); out = sys.argv[4]; w = sys.argv[5] if len(sys.argv) > 5 else None
    url = f'https://archive.org/download/{ident}/page/n{n}' + (f'_w{w}' if w else '') + '.jpg'
    data = get(url, binary=True)
    open(out, 'wb').write(data)
    print('saved', out, len(data) // 1024, 'KB')
