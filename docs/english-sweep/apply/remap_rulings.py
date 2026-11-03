"""Remap alignment-results/{hardie,fyfe}/rulings/*.json (phrase + near offset)
onto the corrected prose and check each with align.rulings.locate, which must
find exactly one copy at the mapped place. usage: python3 -I remap_rulings.py <old.json> <new.json>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.path.insert(0, 'pipeline')
from wordmap import Map
from aristotle_pipeline.align import rulings as R
old = json.load(open(sys.argv[1], encoding='utf-8')); new = json.load(open(sys.argv[2], encoding='utf-8'))
for f, key in [('alignment-results/hardie/rulings/Phys.json', 'phys-hardie|part|False'), ('alignment-results/fyfe/rulings/Poet.json', 'poet-fyfe|part|False')]:
    p = Path(f); raw = p.read_text(encoding='utf-8'); d = json.loads(raw)
    assert json.dumps(d, indent=1, ensure_ascii=False) == raw.rstrip('\n'), f
    for ch, rs in d.items():
        o, n = old[key][ch], new[key][ch]
        for cit, r in rs.items():
            assert R.locate(o, r['phrase']) == r['near'], (f, ch, cit, 'old locate')
            if o == n: continue
            mp = Map(o, n); near = mp.f(r['near'])
            ph = r['phrase']
            if mp.touches(r['near'], r['near'] + len(ph)):
                ph = ' '.join(n[near:].split()[:len(r['phrase'].split())])
                print('  phrase re-read:', f.split('/')[1], ch, cit, repr(r['phrase']), '->', repr(ph))
            r['phrase'], r['near'] = ph, near
            assert R.locate(n, ph) == near, (f, ch, cit, 'new locate')
    out = json.dumps(d, indent=1, ensure_ascii=False) + ('\n' if raw.endswith('\n') else '')
    if out != raw: p.write_text(out, encoding='utf-8'); print('rewrote', f)
    print(f, 'ok:', sum(len(v) for v in d.values()), 'rulings locate on the corrected text')
