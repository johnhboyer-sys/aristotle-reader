"""Keep alignment-results/<vid>/maps/<WORK>/book-NN.json equal to the remapped
gloss map: on main every gloss map is exactly the union of its per-book maps
(tools/make_index.py builds it that way), so write each book's chapters back
from the remapped gloss map, in the file's own JSON layout, and re-check the
union. usage (repo root): python3 -I sync_book_maps.py"""
import glob, json
from pathlib import Path

def layout(raw, d):
    for ind in (None, 1, 2):
        for ea in (True, False):
            s = json.dumps(d, indent=ind, ensure_ascii=ea)
            if s == raw: return ind, ea, ''
            if s + '\n' == raw: return ind, ea, '\n'
    raise SystemExit('unknown layout')

n_files = 0
for gm in sorted(glob.glob('alignment-results/*/*_gloss_map.json')):
    p = Path(gm); work = p.name.split('_')[0]
    books = sorted((p.parent / 'maps' / work).glob('book-*.json'))
    if not books: continue
    g = json.loads(p.read_text(encoding='utf-8'))
    comb = {}
    for b in books:
        raw = b.read_text(encoding='utf-8'); m = json.loads(raw)
        ind, ea, nl = layout(raw, m)
        assert set(m) <= set(g), (b, set(m) - set(g))
        new = {k: g[k] for k in m}
        comb.update(new)
        out = json.dumps(new, indent=ind, ensure_ascii=ea) + nl
        if out != raw:
            b.write_text(out, encoding='utf-8'); n_files += 1
    assert comb == g, gm
print(n_files, 'per-book map files rewritten; every gloss map is again the union of its per-book maps')
