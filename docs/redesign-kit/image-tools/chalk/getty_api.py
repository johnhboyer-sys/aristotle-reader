# Query the Getty collection site's search API for Open Content (CC0)
# photographs; save candidates.json and thumbnails.
# usage: python3 -I getty_api.py <outdir>
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
    print('failed', url[:100], err, file=sys.stderr); return {}
Q = ['blackboard', 'chalkboard', 'chalk board', 'classroom', 'class room', 'schoolroom', 'school room', 'lecture', 'teacher', 'professor',
     'mathematics', 'mathematician', 'geometry', 'arithmetic', 'algebra', 'lesson', 'students', 'pupils', 'school', 'college', 'university',
     'diagram', 'equation', 'scholar', 'philosopher', 'logic', 'slate', 'academy', 'seminary', 'teaching', 'instruction', 'examination',
     'Johnston school', 'Washington school', 'Hampton', 'Tuskegee', 'Carlisle']
rows, seen = [], set()
for q in Q:
    for start in (0, 48):
        d = get('https://www.getty.edu/art/collection/api/search?' + urllib.parse.urlencode({'from': start, 'size': 48, 'q': q, 'open_content': 'true'}))
        for it in d.get('data', []):
            if it['id'] in seen: continue
            m = it.get('manifest') or {}
            if 'publicdomain/zero' not in (m.get('license') or ''): continue
            seen.add(it['id'])
            mats = it.get('materials_parsed') or it.get('medium') or ''
            rows.append({'id': it['id'], 'title': it.get('primary_name', '')[:160], 'artist': ', '.join(p.get('primary_name', '') for p in it.get('producers', []))[:80],
                         'date': it.get('date_created', ''), 'acc': it.get('accession_number', ''), 'thumb': m.get('thumb', ''), 'manifest': m.get('url', ''),
                         'medium': json.dumps(mats, ensure_ascii=False)[:100], 'q': q})
        if d.get('total', 0) <= 48: break
        time.sleep(0.3)
    time.sleep(0.3)
print(len(rows), 'CC0 objects', file=sys.stderr)
json.dump(rows, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1, ensure_ascii=False)
for n, r in enumerate(rows):
    fn = os.path.join(OUT, 'th', f'{n:04d}.jpg')
    if not r['thumb'] or os.path.exists(fn): continue
    u = re.sub(r'/full/[^/]+/', '/full/!400,400/', r['thumb'])
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as resp, open(fn, 'wb') as f:
            f.write(resp.read())
    except Exception as e:
        print('thumb failed', n, e, u[:120], file=sys.stderr)
print('done', file=sys.stderr)
