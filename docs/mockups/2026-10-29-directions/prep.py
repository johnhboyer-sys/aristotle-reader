"""Build data.json for the four-directions mockup: the Greek and English of
Nicomachean Ethics I, every token's parses, lemma counts, LSJ sense outlines and
the corpus registry.

The site's data is fetched (and cached under data/) from the live site, or from
any other data root:

    node docs/mockups/2026-10-29-directions/export-registry.mjs
    python3 docs/mockups/2026-10-29-directions/prep.py [--root URL-or-path]

data/ and data.json hold the site's TLG Greek, so they are gitignored and never
committed; only this script is.
"""
import argparse, json, re, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
D = HERE / 'data'
D.mkdir(exist_ok=True)
ap = argparse.ArgumentParser()
ap.add_argument('--root', default='https://aristotle.johnhboyer.com/data', help='data root: a URL or a build/dist path')
ROOT = ap.parse_args().root.rstrip('/')


def get(rel, cache=None):
    """One data file, from the cache or the data root."""
    p = D / (cache or rel.replace('/', '_'))
    if not p.exists():
        if ROOT.startswith('http'):
            with urllib.request.urlopen(f'{ROOT}/{rel}') as r:
                p.write_bytes(r.read())
        else:
            p.write_bytes((Path(ROOT) / rel).read_bytes())
    return json.loads(p.read_text('utf-8'))


# ── Greek: the site's own text, as the live reader shows it ────────────────
book = get('EN/book-01.json')
segs = book['segments']
analyses = get('EN/analyses.json')


def lineparts(ln):
    """Split a line into [display, key, preLen, wordLen] runs: each token with
    the punctuation and spacing that follow it, as Reader.svelte's lineParts
    does with the token offsets."""
    text, toks = ln['text'], ln['tokens']
    out = []
    lead = text[:toks[0]['o']] if toks else text
    for i, t in enumerate(toks):
        a = t['o']
        b = toks[i + 1]['o'] if i + 1 < len(toks) else len(text)
        pre = lead if i == 0 else ''
        out.append([pre + text[a:b], t['k'], len(pre), len(t['t'])])
    return out


GK = []
for s in segs:
    col = {'col': s['column'], 'starts': s.get('chapterStarts', []), 'lines': []}
    for ln in s['greek']:
        col['lines'].append({'n': ln['n'], 'sub': ln.get('sub'), 'w': lineparts(ln)})
    for cs in col['starts']:
        cs['w'] = cs.get('wordIndex', 0)
    GK.append(col)

# ── English: Rackham (the primary slot), Ross, Ostwald, Peters ─────────────
EN = []
for s in segs:
    e = s['english']
    EN.append({
        'col': s['column'],
        'rackham': {'text': e['text'], 'bekker': e['bekker'],
                    'paras': [m['offset'] for m in e['markers'] if m['kind'] == 'paragraph'],
                    'notes': e.get('notes', [])},
        'ross': s['ross'],
        'ostwald': s['third'],
        'peters': s['overlays'].get('peters', []),
    })
FN = {k: v for k, v in get('EN/footnotes.json').items() if k.startswith('1.')}
titles = get('EN/third-titles.json')['ostwald']
chapters = get('EN/chapters.json')

# ── Parses, LSJ heads, lemma refs ──────────────────────────────────────────
keys = sorted({w[1] for col in GK for ln in col['lines'] for w in ln['w'] if w[1]})
AN = {k: analyses[k] for k in keys if k in analyses}
heads = get('lsj-heads.json')
lemmata = get('lemmata.json')
lsjkeys = sorted({lk for k in AN for a in AN[k] for lk in a['lsj']})
HEADS = {k: heads[k] for k in lsjkeys if k in heads}
LEM = {k: lemmata[k] for k in lsjkeys if k in lemmata}
print('keys', len(keys), 'analysed', len(AN), 'lsj keys', len(lsjkeys), file=sys.stderr)


# ── LSJ sense outlines: a stand-in for Grammata's entry, which an artifact
# cannot load. The site itself shows Grammata's module, unrestyled. ─────────
def shard(k):
    for ch in k:
        if ch == '*':
            continue
        if 'a' <= ch <= 'z':
            return ch
    return '_'


AUTH_HOM = {'Il.', 'Od.', 'h.Ap.', 'h.Cer.', 'h.Merc.', 'h.Ven.'}
SKIP = r'^(c\.|cf\.|v\.|q\.v\.|Sch\.|ib\.|freq\.|pl\.|sg\.|Act\.|Pass\.|Med\.|abs\.)$'


def outline(entry):
    h = entry['html']
    gen = ''
    m = re.search(r'<span class="lsj-gen">(.*?)</span>', h)
    if m and h.find(m.group(0)) < 200:
        gen = re.sub('<[^>]+>', '', m.group(1))
    senses = []
    for part in re.split(r'(?=<div class="lsj-sense")', h):
        if not part.startswith('<div class="lsj-sense"'):
            continue
        lvl = re.search(r'data-level="(\d+)"', part)
        n = re.search(r'<b class="lsj-sense-n">(.*?)</b>', part)
        gl = [g.strip(' ,;:.') for g in re.findall(r'<i>(?!<)([^<]{2,80})</i>', part) if not re.match(SKIP, g.strip())]
        gl = list(dict.fromkeys(x.strip(' ,;:.') for g in gl if g and not g[0].isdigit() for x in g.split(',') if x.strip(' ,;:.')))[:4]
        auth = []
        for a in re.findall(r'<span class="lsj-author">(.*?)</span>', part):
            a = re.sub('<[^>]+>', '', a).strip()
            if a and a not in auth and a not in ('Id.', 'ib.'):
                auth.append(a)
        if any(t in AUTH_HOM for t in re.findall(r'<i class="lsj-title">(.*?)</i>', part)) and 'Hom.' not in auth:
            auth.insert(0, 'Hom.')
        if gl:
            senses.append({'l': int(lvl.group(1)) if lvl else 1, 'n': re.sub('<[^>]+>', '', n.group(1)).strip() if n else '', 'g': ', '.join(gl), 'a': auth[:5]})
    return {'h': entry['head'], 'gen': gen, 's': senses[:10], 'total': len(senses)}


SH = {letter: get(f'lsj/{letter}.json') for letter in sorted({shard(k) for k in lsjkeys})}
LSJ = {k: outline(SH[shard(k)][k]) for k in lsjkeys if k in SH[shard(k)]}
print('lsj outlines', len(LSJ), file=sys.stderr)

# ── Lemma pages, the registry, Bekker spans, chapters ──────────────────────
LEMMA = {slug: get(f'lemmata/{slug}.json') for slug in ('arete', 'eudaimonia', 'agathos', 'techne')}
reg = json.loads((D / 'registry.json').read_text('utf-8'))  # from export-registry.mjs

# Each work's first and last citation per book, from the corpus Bekker index.
spans = {}
for col, ents in get('bekker.json').items():
    m = re.match(r'(\d+)([ab])$', col)
    page, side = int(m.group(1)), m.group(2)
    for w, b, lo, hi in ents:
        s = spans.setdefault(w, {}).setdefault(str(b), [None, None])
        k0, k1 = (page, side, lo), (page, side, hi)
        if s[0] is None or k0 < s[0][0]:
            s[0] = (k0, f'{page}{side}{lo}')
        if s[1] is None or k1 > s[1][0]:
            s[1] = (k1, f'{page}{side}{hi}')
CH = {}
for w in reg['works']:
    w['spans'] = {b: [v[0][1], v[1][1]] for b, v in sorted(spans.get(w['id'], {}).items(), key=lambda kv: int(kv[0]))} or None
    c = get(f"{w['id']}/chapters.json")
    CH[w['id']] = {b: [[x['chapter'], x['bekker']] for x in v] for b, v in c.items()}

top = sorted(lemmata.values(), key=lambda v: -v['count'])[:60]
alpha = sorted(lemmata.values(), key=lambda v: v['slug'])
out = {
    'greek': GK, 'english': EN, 'footnotes': FN, 'titles': titles.get('1', {}), 'allTitles': titles,
    'chapters': chapters, 'analyses': AN, 'heads': HEADS, 'lemmata': LEM, 'lsj': LSJ, 'lemmaPages': LEMMA,
    'registry': reg, 'workChapters': CH,
    'topLemmata': [[v['head'], v['slug'], v['count']] for v in top],
    'alphaAr': [[v['head'], v['slug'], v['count']] for v in alpha if v['slug'].startswith('ar')][:40],
    'lemmaTotal': len(lemmata),
}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
(HERE / 'data.json').write_text(s, 'utf-8')
print('data.json', round(len(s.encode()) / 1024), 'KB', file=sys.stderr)
