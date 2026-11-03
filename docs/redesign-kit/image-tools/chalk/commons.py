# Search Wikimedia Commons for photographs of blackboards with logic or
# mathematics on them; keep only files marked public domain or CC0. Writes
# candidates.json and thumbnails into the output directory.
# usage: python3 -I commons.py <outdir>
import json, sys, time, urllib.parse, urllib.request, os, re
OUT = sys.argv[1]
os.makedirs(os.path.join(OUT, 'th'), exist_ok=True)
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'AristotleReaderMockup/1.0 (research; johnhboyer.com)'}
def get(params):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 ** k)
    return {}
files = {}
def add(title, why):
    if title.startswith('File:') and re.search(r'\.(jpe?g|tiff?|png)$', title, re.I):
        files.setdefault(title, set()).add(why)
QUERIES = ['blackboard logic', 'chalkboard logic', 'blackboard syllogism', 'blackboard mathematics lecture', 'blackboard geometry class',
           'blackboard formulas professor', 'blackboard equations 1920s', 'blackboard proof mathematician', 'Venn diagram blackboard',
           'classroom blackboard 1899', 'geometry class 1899 Johnston', 'Hampton Institute mathematics class', 'arithmetic class blackboard 1900',
           'Tafel Mathematik Vorlesung', 'Tafel Formeln Professor', 'schoolbord wiskunde', 'college van wiskunde schoolbord', 'tableau noir mathématiques',
           'lavagna matematica', 'Einstein blackboard', 'Hilbert blackboard', 'logic lecture', 'mathematician at blackboard', 'student at blackboard',
           'Lewis Hine blackboard', 'Bain News blackboard', 'Harris Ewing blackboard', 'blackboard lecture hall 1910']
for q in QUERIES:
    d = get({'action': 'query', 'list': 'search', 'srsearch': q, 'srnamespace': 6, 'srlimit': 50})
    for x in d.get('query', {}).get('search', []):
        add(x['title'], 'q:' + q)
# categories whose names mention blackboards
cats = set()
for q in ['blackboards', 'blackboard', 'chalkboards', 'mathematics on blackboards', 'equations on blackboards', 'classrooms 19th century', 'Frances Benjamin Johnston school']:
    d = get({'action': 'query', 'list': 'search', 'srsearch': q, 'srnamespace': 14, 'srlimit': 30})
    for x in d.get('query', {}).get('search', []):
        cats.add(x['title'])
cats = sorted(c for c in cats if re.search(r'blackboard|chalkboard|Wandtafel|schoolbord|tableau|Frances Benjamin Johnston', c, re.I))
json.dump(cats, open(os.path.join(OUT, 'cats.json'), 'w'), indent=1)
for c in cats[:60]:
    d = get({'action': 'query', 'list': 'categorymembers', 'cmtitle': c, 'cmtype': 'file', 'cmlimit': 200})
    for x in d.get('query', {}).get('categorymembers', []):
        add(x['title'], 'cat:' + c)
print(len(files), 'files from', len(QUERIES), 'searches and', len(cats), 'categories', file=sys.stderr)
# licence and a thumbnail for each, 50 at a time
titles = sorted(files)
rows = []
for i in range(0, len(titles), 50):
    d = get({'action': 'query', 'prop': 'imageinfo', 'titles': '|'.join(titles[i:i + 50]), 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 360})
    for pg in d.get('query', {}).get('pages', []):
        ii = (pg.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        val = lambda k: re.sub(r'<[^>]+>', '', (md.get(k) or {}).get('value', '') or '').strip()
        lic = val('LicenseShortName')
        if not re.search(r'public domain|^pd|cc0|no restrictions', lic, re.I):
            continue
        rows.append({'title': pg['title'], 'lic': lic, 'w': ii.get('width'), 'h': ii.get('height'), 'thumb': ii.get('thumburl'), 'url': ii.get('url'),
                     'page': ii.get('descriptionurl'), 'artist': val('Artist')[:120], 'date': val('DateTimeOriginal')[:60], 'desc': val('ImageDescription')[:300],
                     'credit': val('Credit')[:200], 'why': sorted(files[pg['title']])[:3]})
print(len(rows), 'public domain or CC0', file=sys.stderr)
json.dump(rows, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
for n, r in enumerate(rows):
    if not r['thumb']: continue
    fn = os.path.join(OUT, 'th', f'{n:04d}.jpg')
    if os.path.exists(fn): continue
    try:
        with urllib.request.urlopen(urllib.request.Request(r['thumb'], headers=UA), timeout=60) as resp, open(fn, 'wb') as f:
            f.write(resp.read())
    except Exception as e:
        print('thumb failed', n, e, file=sys.stderr)
    time.sleep(0.05)
print('done', file=sys.stderr)
