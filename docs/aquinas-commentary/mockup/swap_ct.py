# Replace lectio 1's Latin (n. 1-15) with Corpus Thomisticum's text, re-wrapping each <q data-t> lemma mark.
import json, re, sys, unicodedata
js_p, streams_p = sys.argv[1], sys.argv[2]
js = open(js_p, encoding='utf-8').read()
paras = {p['pid']: p['text'] for p in json.load(open(streams_p))['paras']}
def norm(w):
    w = unicodedata.normalize('NFD', w.lower()); w = ''.join(c for c in w if not unicodedata.combining(c))
    return re.sub(r'[^a-z]', '', w.replace('j', 'i').replace('v', 'u'))
fields = list(re.finditer(r"la:'((?:[^'\\]|\\.)*)'", js))[:15]
out = []; last = 0
for n, m in enumerate(fields, 1):
    old = m.group(1); new = paras[f'1.1.{n}']
    toks = new.split(' ')
    tn = [norm(t) for t in toks]
    pos = 0; wraps = []
    for q in re.finditer(r'(<q [^>]*>)(.*?)</q>', old):
        want = [norm(w) for w in re.sub(r'<[^>]+>', '', q.group(2)).split() if norm(w)]
        want = [x for w in want for x in (['et', 'cetera'] if w == 'etc' else [w])]   # Corpus writes etc. out
        for i in range(pos, len(tn) - len(want) + 1):
            if tn[i:i+len(want)] == want: wraps.append((i, i + len(want), q.group(1))); pos = i + len(want); break
        else: raise SystemExit(f'n.{n}: lemma not found: {q.group(2)}')
    for i0, i1, tag in reversed(wraps):
        # keep trailing punctuation outside the mark
        tail = re.search(r'[.,;:?!»]+$', toks[i1-1]); t = tail.group(0) if tail else ''
        if t: toks[i1-1] = toks[i1-1][:-len(t)]
        toks[i0] = tag + toks[i0]; toks[i1-1] = toks[i1-1] + '</q>' + t
    text = ' '.join(toks).replace("'", "\\'")
    assert re.sub(r'<[^>]+>', '', text).replace("\\'", "'") == new, n
    assert text.count('<q ') == old.count('<q '), (n, text.count('<q '), old.count('<q '))
    out.append(js[last:m.start(1)]); out.append(text); last = m.end(1)
out.append(js[last:])
open(js_p, 'w', encoding='utf-8').write(''.join(out)); print('lectio 1: 15 paragraphs now Corpus Thomisticum, lemma marks kept')
