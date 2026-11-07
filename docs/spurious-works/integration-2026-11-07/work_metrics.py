"""Token, unmatched and search-index counts for one built work dir."""
import json, sys, glob, os
from collections import Counter
def metrics(d):
    an = json.load(open(f'{d}/analyses.json'))
    toks = []
    for f in sorted(glob.glob(f'{d}/book-*.json')):
        for s in json.load(open(f))['segments']:
            for gl in s.get('greek') or []:
                for t in gl.get('tokens') or []:
                    toks.append((s['column'], gl['n'], t['t'], t.get('k')))
    unmatched = [t for t in toks if not an.get(t[3])]
    out = {'tokens': len(toks), 'tokens_unmatched': len(unmatched),
           'distinct_unmatched_keys': len({t[3] for t in unmatched})}
    for name in ('greek_form', 'greek_lemma', 'english'):
        p = f'{d}/search/{name}.json'
        if os.path.exists(p):
            idx = json.load(open(p))
            out[f'{name}_keys'] = len(idx)
            out[f'{name}_postings'] = sum(len(v) if isinstance(v, list) else 1 for v in idx.values())
    return out, toks
a, ta = metrics(sys.argv[1]); b, tb = metrics(sys.argv[2])
for k in a: print(f'{k:24} {a[k]:>8} {b.get(k):>8} {b.get(k)-a[k]:>+6}')
ca, cb = Counter(t[2] for t in ta), Counter(t[2] for t in tb)
print('surfaces lost:', dict(ca - cb)); print('surfaces gained:', dict(cb - ca))
