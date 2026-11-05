# Classify every difference between Corpus Thomisticum and Parma's OCR.
import json, re, html, sys, glob, collections, unicodedata
D = sys.argv[1]
S = json.load(open(f'{D}/pdiff/streams.json')); ct = S['ct']; paras = S['paras']
OFF = 400; pm = S['pm'][OFF:133754]; KEEP = json.load(open(f'{P}/keep.json')) if 'P' in dir() else json.load(open('keep.json')); pm = [pm[i] for i in KEEP]
H = json.load(open(f'{D}/pdiff/hunks.json'))
def norm(w):
    w = unicodedata.normalize('NFD', w.lower()); w = ''.join(c for c in w if not unicodedata.combining(c))
    return re.sub(r'[^a-z]', '', w.replace('æ', 'ae').replace('œ', 'oe').replace('j', 'i').replace('v', 'u'))
# vocabulary: every form in Corpus Thomisticum's De anima plus nineteen pages of his other Aristotle commentaries
V0 = collections.Counter(x[0] for x in ct)
W = collections.Counter()
for f in glob.glob(f'{D}/ct/vocab/*.html'):
    s = open(f, encoding='latin1').read(); s = re.sub(r'(?is)<(script|style).*?</\1>', '', s)
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    for body in re.split(r'\[\d+\] [^\n]*? n\. \d+', s)[1:]:     # paragraph bodies only, no page furniture
        for w in body.split():
            n = norm(w)
            if n: W[n] += 1
SHORT = set('a e o ab ad an at de di do ea ei eo es et ex id ii in is me mi ne ni ob os se si te tu ut ut'.split())
V = {w for w in set(V0) | {w for w, c in W.items() if c >= 2} if len(w) > 2 or w in SHORT}
print('vocabulary', len(V))
def skel(w):   # spelling skeleton: differences here are orthography, not readings
    w = w.replace('ae', 'e').replace('oe', 'e').replace('y', 'i').replace('ph', 'f').replace('h', '').replace('mpn', 'mn').replace('cq', 'dq').replace('mq', 'nq')
    w = re.sub(r'ti(?=[aeiou])', 'ci', w); return re.sub(r'(.)\1', r'\1', w)
def lev(a, b):
    if a == b: return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (ca != cb)))
        prev = cur
    return prev[-1]
CONF = {frozenset(p) for p in ['ce', 'eo', 'co', 'nu', 'lt', 'il', 'it', 'fs', 'bh', 'au', 'ao', 'rt', 'ea', 'ri', 'tc', 'mn']}
def ocrish(a, b):   # one OCR-typical edit between two real words
    if len(a) == len(b):
        d = [(x, y) for x, y in zip(a, b) if x != y]
        return len(d) == 1 and frozenset(d[0]) in CONF
    if abs(len(a) - len(b)) == 1:
        s, l = (a, b) if len(a) < len(b) else (b, a)
        for i in range(len(l)):
            if l[:i] + l[i+1:] == s: return l[i] in 'iltrf'
    for x, y in (('m', 'rn'), ('m', 'in'), ('m', 'ni'), ('h', 'li'), ('d', 'cl'), ('u', 'ii'), ('n', 'ri')):
        if a.replace(x, y, 1) == b or b.replace(x, y, 1) == a: return True
    return False
def cost(c, p): return lev(c, p) / max(len(c), len(p))
GAP = 0.45
def nw(A, B):  # A, B lists of norms; moves: pair, gapA, gapB, 2:1, 1:2
    n, m = len(A), len(B); INF = 1e9
    T = [[INF] * (m + 1) for _ in range(n + 1)]; P = [[None] * (m + 1) for _ in range(n + 1)]; T[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            t = T[i][j]
            if t >= INF: continue
            def rel(ii, jj, c, mv):
                if ii <= n and jj <= m and t + c < T[ii][jj]: T[ii][jj] = t + c; P[ii][jj] = (i, j, mv)
            if i < n and j < m: rel(i+1, j+1, cost(A[i], B[j]), 'p')
            if i < n: rel(i+1, j, GAP, 'a')
            if j < m: rel(i, j+1, GAP, 'b')
            # a merge only where the scanner split or fused one word: the joined form must nearly equal the other side
            if i + 1 < n and j < m and cost(A[i] + A[i+1], B[j]) <= 0.25: rel(i+2, j+1, cost(A[i] + A[i+1], B[j]) * 0.8 + 0.05, 'aa')
            if i + 1 < n and j < m and A[i] == 'et' and A[i+1] == 'cetera' and re.fullmatch(r'[ec][tlicf1]{1,2}[co]?|etc', B[j]): rel(i+2, j+1, 0.05, 'aa')   # et cetera / etc.
            if i < n and j + 1 < m and cost(A[i], B[j] + B[j+1]) <= 0.25: rel(i+1, j+2, cost(A[i], B[j] + B[j+1]) * 0.8 + 0.05, 'bb')
    out = []; i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, mv = P[i][j]; out.append((pi, i, pj, j, mv)); i, j = pi, pj
    return out[::-1]
footer = set()
for k in range(len(pm)):   # "S. Th. Opera omnia. V. 20." page footers, however garbled
    if pm[k][0] == 'opera' and any(pm[x][0].startswith('om') for x in range(k+1, min(k+3, len(pm)))):
        footer.update(range(max(0, k-2), min(len(pm), k+4)))
def gap_b(j):   # a Parma word with no counterpart
    raw, n = pm[j][1], pm[j][0]
    if j in footer: return 'furniture'
    if len(re.sub(r'[^A-Za-z]', '', raw)) > 1 and re.sub(r'[^A-Za-z]', '', raw).isupper(): return 'furniture'
    if pm[j][3] == 0: return 'furniture'
    return 'pm+' if n in V else 'junk'
items = []
def add(cls, a0, a1, b0, b1): items.append({'c': cls, 'a': [a0, a1], 'b': [b0, b1]})
blocks = []
for a0, a1, b0, b1 in H:
    A = [x[0] for x in ct[a0:a1]]; B = [x[0] for x in pm[b0:b1]]
    if len(B) > 50 and len(A) <= 5:   # Parma's heading and Aristotle text between lectiones; align any stray CT words at its edges
        k = len(A) + 6; edgeB = list(range(b0, b0 + k)) + list(range(b1 - k, b1))
        blocks.append({'a': a0, 'b': [b0, b1], 'n': len(B)})
        sub = nw(A, [pm[j][0] for j in edgeB]); 
        for i0, i1, j0, j1, mv in sub:
            if mv == 'b': continue
            js = [edgeB[j] for j in range(j0, j1)]
            if mv == 'a': add('ct+', a0+i0, a0+i1, b0, b0)
            else: add('pair', a0+i0, a0+i1, js[0], js[-1]+1)
        continue
    if ''.join(A) == ''.join(B): add('spacing', a0, a1, b0, b1); continue
    if A == ['et', 'cetera'] and B == ['etc']: add('abbrev', a0, a1, b0, b1); continue
    for i0, i1, j0, j1, mv in nw(A, B):
        if mv == 'a': add('ct+', a0+i0, a0+i1, b0+j0, b0+j0)
        elif mv == 'b': items.append({'c': gap_b(b0+j0), 'a': [a0+i0, a0+i0], 'b': [b0+j0, b0+j1]})
        else: add('pair', a0+i0, a0+i1, b0+j0, b0+j1)
for it in items:   # classify pairs
    if it['c'] != 'pair': continue
    c = ''.join(x[0] for x in ct[it['a'][0]:it['a'][1]]); p = ''.join(x[0] for x in pm[it['b'][0]:it['b'][1]])
    if c == p: it['c'] = 'spacing'
    elif (it['a'][1] - it['a'][0] == 2 and c == 'etcetera' and re.fullmatch(r'[ec][tlicf1]{1,2}[co]?|etc', p)): it['c'] = 'abbrev'
    elif skel(c) == skel(p): it['c'] = 'spell'
    elif re.search(r'[A-Za-z][^A-Za-z\s]+[A-Za-z]', ' '.join(x[1] for x in pm[it['b'][0]:it['b'][1]])): it['c'] = 'ocr'   # a mark inside a word is the scanner's
    elif p not in V: it['c'] = 'ocr' if cost(c, p) <= 0.5 else 'ocr-far'
    elif ocrish(c, p): it['c'] = 'ocr?'
    else: it['c'] = 'word'
for it in items:   # a CT word Parma lacks: is it fused into a neighbouring Parma token?
    pass
cnt = collections.Counter(it['c'] for it in items)
print('items', len(items), dict(cnt.most_common()))
print('Parma blocks between lectiones', len(blocks), 'tokens', sum(b['n'] for b in blocks))
json.dump({'items': items, 'blocks': blocks}, open(f'{D}/pdiff/items.json', 'w'))
def show(cls, k=25):
    xs = [it for it in items if it['c'] == cls]
    print(f'\n== {cls} ({len(xs)}) sample')
    for it in xs[:: max(1, len(xs)//k)][:k]:
        a0, a1 = it['a']; b0, b1 = it['b']
        print(f"  {paras[ct[min(a0, len(ct)-1)][2]]['pid']:>9}  CT «{' '.join(x[1] for x in ct[a0:a1])}»  Parma «{' '.join(x[1] for x in pm[b0:b1])}»   | {' '.join(x[1] for x in ct[max(0,a0-4):a0])} [] {' '.join(x[1] for x in ct[a1:a1+4])}")
for c in ['word', 'pm+', 'ct+', 'ocr?']: show(c)
