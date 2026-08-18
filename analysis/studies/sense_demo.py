"""Demonstration: what statistical and semantic analysis can say about αἰτία / αἴτιον.

Run:  python3 sense_demo.py
"""
import re
import sys, unicodedata
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[1]))
from greekstyle.works import WORKS, load_work
from collections import Counter, defaultdict

ACCENTS = '́͂̀'

def bare(s):
    d = unicodedata.normalize('NFD', s)
    return unicodedata.normalize('NFC', ''.join(c for c in d if not unicodedata.combining(c))).lower()

def accent_index(s):
    """Which base letter carries the accent (0-based). Greek accentuation is
    what separates the two words here, and the normalised form throws it away:
      αἴτιον  accent on letter 1  -> 2nd declension (the adjective)
      αἰτία   accent on letter 3  -> 1st declension (the feminine noun)
      αἰτίων  accent on letter 3  -> 2nd decl. genitive plural
      αἰτιῶν  circumflex, letter 4 -> 1st decl. genitive plural
    """
    d = unicodedata.normalize('NFD', s.lower())
    base = -1
    for c in d:
        if unicodedata.combining(c):
            if c in ACCENTS:
                return base
        else:
            base += 1
    return None


# 2nd-declension endings (αἴτιον/αἴτιος) vs 1st-declension (αἰτία).
ADJ_END = ('ον', 'οσ', 'οι', 'ουσ', 'ου', 'ω', 'οισ', 'οιν')
FEM_END = ('αν', 'ασ', 'αι', 'αισ', 'αιν')

ADJ = 'αἴτιον / αἴτιος'
FEM = 'αἰτία'

def classify(surface):
    b = bare(surface).replace('ς', 'σ')
    # Verb first: αἰτιᾶται bares to 'αιτιαται' and would otherwise be swallowed
    # by the αἰτιατ- test below.
    if b.startswith(('αιτιω', 'αιτια')) and b.endswith(
            ('νται', 'ται', 'μεθα', 'σθαι', 'μενοσ', 'μενοι', 'το', 'ντο', 'σεται', 'σασθαι')):
        return 'verb αἰτιάομαι (accuse)'
    if re.match(r'^αιτιατ[οωε]', b):
        return 'αἰτιατόν (the effect)'
    if b.startswith('αιτιωτερ') or b.startswith('αιτιωδ'):
        return 'other'
    a = accent_index(surface)
    if b == 'αιτιων':                      # the one genitive plural both share
        return FEM if a == 4 else ADJ      # αἰτιῶν (1st) vs αἰτίων (2nd)
    if b.endswith(FEM_END):
        return FEM
    if b.endswith(ADJ_END):
        return ADJ
    if b.endswith('α'):                    # αἴτια (neut. pl.) vs αἰτία (fem. sg.)
        return ADJ if a == 1 else FEM
    return 'other' 


def occurrences():
    """Every αἰτι- token with its class, work, Bekker column and context window."""
    out = []
    for w in WORKS:
        toks = load_work(w)
        norms = [t.norm for t in toks]
        for i, t in enumerate(toks):
            if not t.norm.startswith('αιτι'):
                continue
            out.append({
                'work': w.wid, 'cls': classify(t.surface), 'surface': t.surface,
                'col': t.column, 'book': t.get('book'), 'i': i,
                'ctx': norms[max(0, i - 12):i] + norms[i + 1:i + 13],
                'ctx_surface': ' '.join(x.surface for x in toks[max(0, i - 9):i + 10]),
            })
    return out


if __name__ == '__main__':
    occ = occurrences()
    print(f'{len(occ)} occurrences of the αἰτι- stem\n')
    tot = Counter(o['cls'] for o in occ)
    for c, n in tot.most_common():
        print(f'  {c:<26}{n:>5}')

    sizes = {w.wid: len(load_work(w)) for w in WORKS}
    by = defaultdict(Counter)
    for o in occ:
        by[o['cls']][o['work']] += 1
    print(f"\n{'work':<8}{'αἴτιον/ος':>10}{'αἰτία':>8}{'% fem':>8}{'per 10k':>9}")
    for w in WORKS:
        a, f = by[ADJ][w.wid], by[FEM][w.wid]
        if a + f < 12:
            continue
        print(f'{w.wid:<8}{a:>10}{f:>8}{100*f/(a+f):>7.0f}%{10000*(a+f)/sizes[w.wid]:>9.1f}')


# ---------------------------------------------------------------- collocation
import math

# The stoplist IS the stylometry feature set. The words that best identify an
# author -- particles, connectives, the article, pronouns -- are precisely the
# words that carry no topic, so they are signal for Study 2 and noise here.
from greekstyle.features import FUNCTION_WORDS
STOP = set(FUNCTION_WORDS) | set('''εστι εστιν ειναι εχει εχειν ον οντοσ οισ
ων οσα οιον ητοι λεγεται λεγομεν ειπειν εσται ειη γινεται γιγνεται δει
μαλλον μαλιστα ωσπερ ουτε ουδε διο ωστε μονον οταν συμβαινει'''.split())


def stem(w):
    """Crude stemmer: Greek inflection lives in the last 1-3 letters, and
    leaving it in splits ζῷον / ζῴων / ζῴοις into three unrelated features."""
    for suf in ('ματοσ','ματα','ματι','εωσ','εων','ουσ','οισ','αισ','ησ','ασ',
                'ων','οι','αι','ου','ω','ο','η','α','ε','ι','ν','σ'):
        if len(w) - len(suf) >= 4 and w.endswith(suf):
            return w[:-len(suf)]
    return w


def loglike(a, b, c, d):
    """Dunning log-likelihood: a = joint count, b = word total, c = window
    total, d = corpus total. Standard collocation statistic; unlike raw counts
    it does not simply rank the commonest words first."""
    e1 = c * (a + b) / (c + d)
    e2 = d * (a + b) / (c + d)
    ll = 0.0
    if a > 0:
        ll += a * math.log(a / e1)
    if b > 0:
        ll += b * math.log(b / e2)
    return 2 * ll * (1 if a / max(c, 1) > b / max(d, 1) else -1)


def collocates(occ, cls, corpus_counts, corpus_total, top=16):
    win = Counter()
    for o in occ:
        if o['cls'] != cls:
            continue
        for wd in o['ctx']:
            if wd not in STOP and len(wd) > 2:
                win[wd] += 1
    wtot = sum(win.values())
    scored = []
    for wd, n in win.items():
        if n < 4:
            continue
        rest = corpus_counts[wd] - n
        scored.append((loglike(n, rest, wtot, corpus_total - wtot), wd, n))
    scored.sort(reverse=True)
    return scored[:top]


def run_collocation(occ):
    corpus = Counter()
    for w in WORKS:
        corpus.update(t.norm for t in load_work(w))
    total = sum(corpus.values())
    print('\n' + '=' * 74)
    print('COLLOCATES — words that cluster around each form more than chance')
    print('=' * 74)
    for cls in (ADJ, FEM):
        print(f'\n  {cls}')
        for ll, wd, n in collocates(occ, cls, corpus, total):
            print(f'    {wd:<16}{n:>5}   LL {ll:7.1f}')


# ------------------------------------------------- word-sense induction (WSI)
def sense_clusters(occ, k=6, seed=0, dims=60):
    """Cluster occurrences by the company they keep, then read the clusters.

    This is the classic distributional method: each occurrence becomes a vector
    of its context words, weighted so that rare-but-telling words count for more
    than common ones; the vectors are compressed with an SVD and grouped by
    k-means. It is the lightweight ancestor of neural embeddings, and it has one
    real advantage for this purpose -- every cluster can be explained by naming
    the words that define it, so a reader can check the machine's work.
    """
    import numpy as np

    docs = [[stem(w) for w in o['ctx'][6:-6] if w not in STOP and len(w) > 3]
            for o in occ]
    df = Counter()
    for d in docs:
        df.update(set(d))
    vocab = [w for w, n in df.items() if n >= 5]
    idx = {w: i for i, w in enumerate(vocab)}
    N = len(docs)
    M = np.zeros((N, len(vocab)))
    for i, d in enumerate(docs):
        for w in d:
            j = idx.get(w)
            if j is not None:
                M[i, j] += 1
    # tf-idf, then L2-normalise so long and short contexts compare fairly
    idf = np.log(N / (1 + np.array([df[w] for w in vocab])))
    M = M * idf
    norms = np.linalg.norm(M, axis=1, keepdims=True)
    M = M / np.where(norms == 0, 1, norms)

    u, s, vt = np.linalg.svd(M - M.mean(0), full_matrices=False)
    X = u[:, :dims] * s[:dims]
    X = X / np.where(np.linalg.norm(X, axis=1, keepdims=True) == 0, 1,
                     np.linalg.norm(X, axis=1, keepdims=True))

    rng = np.random.default_rng(seed)
    C = X[rng.choice(N, k, replace=False)]
    for _ in range(60):
        lab = np.argmax(X @ C.T, axis=1)
        for j in range(k):
            m = lab == j
            if m.sum():
                v = X[m].mean(0)
                C[j] = v / (np.linalg.norm(v) or 1)
    return lab, vocab, M


def run_senses(occ, k=6):
    import numpy as np
    lab, vocab, M = sense_clusters(occ, k=k)
    print('\n' + '=' * 74)
    print(f'SENSE CLUSTERS — {len(occ)} occurrences grouped by context alone')
    print('(the labels are mine; the groupings are the machine\'s)')
    print('=' * 74)
    order = sorted(range(k), key=lambda j: -(lab == j).sum())
    for j in order:
        m = lab == j
        mean = M[m].mean(0)
        top = [vocab[i] for i in np.argsort(-mean)[:9]]
        forms = Counter(o['cls'] for o, mm in zip(occ, m) if mm)
        works = Counter(o['work'] for o, mm in zip(occ, m) if mm)
        print(f'\n  CLUSTER {j}  ({m.sum()} occurrences)')
        print(f'    defining words : {" · ".join(top)}')
        print(f'    form split     : ' + ', '.join(f'{a} {b}' for a, b in forms.most_common(3)))
        print(f'    top works      : ' + ', '.join(f'{a} {b}' for a, b in works.most_common(5)))
        # examples nearest the cluster centre, not merely the first found
        import numpy as _np
        rows = _np.where(m)[0]
        cen = M[m].mean(0)
        best = rows[_np.argsort(-(M[rows] @ cen))][:2]
        for o in [occ[i] for i in best]:
            print(f"    e.g. [{o['work']} {o['col'] or '-'}] {o['ctx_surface'][:118]}")
