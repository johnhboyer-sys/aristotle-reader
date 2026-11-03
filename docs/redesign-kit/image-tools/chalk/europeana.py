# Search Europeana for photographs of blackboards with mathematics or logic;
# keep only CC0 and Public Domain Mark items. Writes candidates.json and
# thumbnails into the output directory.
# usage: python3 -I europeana.py <outdir>
import json, sys, time, urllib.parse, urllib.request, os, re
OUT = sys.argv[1]
os.makedirs(os.path.join(OUT, 'th'), exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (research for a reading site mockup)'}
def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            err = e; time.sleep(2 ** k)
    print('failed', url[:120], err, file=sys.stderr); return {}
Q = ['blackboard mathematics', 'blackboard lecture', 'blackboard formula', 'blackboard geometry', 'blackboard professor', 'blackboard logic',
     'schoolbord wiskunde', 'schoolbord college', 'hoogleraar schoolbord', 'wiskundige schoolbord', 'schoolbord formules',
     'Wandtafel Mathematik', 'Tafel Vorlesung', 'Tafel Formel', 'Mathematikunterricht', 'Logik', 'Hörsaal Tafel',
     'tableau noir mathématiques', 'tableau noir cours', 'lavagna matematica', 'pizarra matemáticas', 'tavle matematik', 'svarta tavlan matematik',
     'klaslokaal schoolbord', 'rekenles', 'meetkunde les', 'geometry lesson', 'arithmetic lesson', 'classroom blackboard']
rows, seen = [], set()
for q in Q:
    url = 'https://api.europeana.eu/record/v2/search.json?' + urllib.parse.urlencode({'wskey': 'api2demo', 'query': q, 'reusability': 'open', 'media': 'true', 'qf': 'TYPE:IMAGE', 'rows': 100, 'profile': 'standard'})
    d = get(url)
    for it in d.get('items', []):
        rights = ' '.join(it.get('rights', []))
        if not re.search(r'publicdomain/(zero|mark)', rights): continue
        if it['id'] in seen: continue
        seen.add(it['id'])
        rows.append({'id': it['id'], 'title': (it.get('title') or [''])[0][:160], 'provider': (it.get('dataProvider') or [''])[0], 'year': (it.get('year') or [''])[0],
                     'rights': rights, 'thumb': (it.get('edmPreview') or [''])[0], 'page': it.get('guid', ''), 'link': (it.get('edmIsShownAt') or [''])[0], 'q': q})
    time.sleep(0.3)
print(len(rows), 'CC0 or PDM items', file=sys.stderr)
json.dump(rows, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
for n, r in enumerate(rows):
    fn = os.path.join(OUT, 'th', f'{n:04d}.jpg')
    if not r['thumb'] or os.path.exists(fn): continue
    try:
        with urllib.request.urlopen(urllib.request.Request(r['thumb'], headers=UA), timeout=60) as resp, open(fn, 'wb') as f:
            f.write(resp.read())
    except Exception as e:
        print('thumb failed', n, e, file=sys.stderr)
print('done', file=sys.stderr)
