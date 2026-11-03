"""Find likely OCR errors in the site's public English translations.

usage (from the repo root): python3 <this> <out.json>

Each translation is read with the pipeline's own parser (stage1_archive), so
the text is what the site shows. The vocabulary is the corpus itself: every
public translation together, about two million words. A rare token that a
common pattern explains (two common words run together, a word split in two,
one OCR letter swap) is a candidate; so are stray characters, Greek letters
inside English, digits inside words, doubled words and missing spaces.
Candidates still need a person (or an agent with the print scan) to decide.
"""
import collections, glob, json, os, re, sys, yaml
from pathlib import Path
sys.path.insert(0, 'pipeline')
from aristotle_pipeline import stage1_archive

GATED = {'ee-rackham', 'cat-ackrill', 'int-ackrill'}
def english_slots(m):
    """Every translation config under a manifest's english block, overlays included."""
    out = []
    def walk(o, where):
        if isinstance(o, dict):
            if o.get('dir'): out.append((where, o)); return
            for k, v in o.items(): walk(v, f"{where}/{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, f"{where}[{i}]")
    walk(m.get('english') or {}, 'english')
    return out

out_path = sys.argv[1]

# ── the texts ──
slots = {}
for f in sorted(glob.glob('manifests/*.yaml')):
    m = yaml.safe_load(open(f, encoding='utf-8'))
    if not isinstance(m, dict): continue
    wid = (m.get('work') or {}).get('id') or os.path.basename(f)[:-5].replace('-public', '')
    for slot, e in english_slots(m):
        if e['dir'] in GATED: continue
        if e['dir'] == 'ostwald': continue
        slots.setdefault(e['dir'], {'work': wid, 'name': e.get('name'), 'cfg': e})
texts = {}   # dir -> list of (book, chapter, text)
for d, s in sorted(slots.items()):
    cfg = s['cfg']
    prose = stage1_archive.parse_translation(Path('sources') / d, cfg.get('books', 1), cfg.get('chapter_marker') or cfg.get('marker') or 'number',
                                             strip_quote_repeats=cfg.get('strip_quote_repeats', False))
    texts[d] = [(k[0], k[1], re.sub(r'\s+', ' ', re.sub(r'\[\[s\d+\]\]|\[\^\d+\]', ' ', v))) for k, v in sorted(prose.items())]
# Ostwald: Markdown with inline Bekker labels and every-fifth-line numbers.
ost = open('sources/ostwald/ostwald-ethics.md', encoding='utf-8').read()
book = 0; chap = 0; buf = []; ochunks = []
for line in ost.split('\n'):
    mb = re.match(r'#\s+BOOK\s+([IVX]+)', line); mc = re.match(r'##\s+(\d+)\.', line)
    if mb or mc:
        if buf: ochunks.append((book, chap, ' '.join(buf))); buf = []
        if mb: book += 1; chap = 0
        if mc: chap = int(mc.group(1))
        continue
    buf.append(line)
if buf: ochunks.append((book, chap, ' '.join(buf)))
clean = lambda t: re.sub(r'\s+', ' ', re.sub(r'&nbsp;|\[\^\d+\]|\b1\d{3}[ab]\b|(?<=\s)\d{1,2}(?=\s)', ' ', t))
texts['ostwald'] = [(b, c, clean(t)) for b, c, t in ochunks]
slots['ostwald'] = {'work': 'EN', 'name': 'Martin Ostwald (Bobbs-Merrill, 1962)'}

# ── vocabulary ──
WORD = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")
cnt = collections.Counter(); bigram = collections.Counter(); hyph = collections.Counter()
for d, chs in texts.items():
    for b, c, t in chs:
        toks = [w.lower() for w in WORD.findall(t)]
        cnt.update(toks); bigram.update(zip(toks, toks[1:]))
        hyph.update(x.lower() for x in re.findall(r"[A-Za-z]+-[A-Za-z]+", t))
tcnt = {}; tbig = {}; thyph = {}
for d, chs in texts.items():
    c1 = collections.Counter(); b1 = collections.Counter(); h1 = collections.Counter()
    for b, c, t in chs:
        toks = [w.lower() for w in WORD.findall(t)]; c1.update(toks); b1.update(zip(toks, toks[1:]))
        h1.update(x.lower() for x in re.findall(r"[A-Za-z]+-[A-Za-z]+", t))
    tcnt[d], tbig[d], thyph[d] = c1, b1, h1
STRONG = set('the of and that this which is are was were from than these those their its has have had been will would should must not'.split())
FUNC = set('the of and to in is it be as that a an by for with not or on at this his its he are was which from but all they we have has one so no if their there these those such what when than then other more also may can into upon any each who whom our her she him them some same been were will would should must between'.split())
common = lambda w, n=25: cnt[w] >= n or w in ('a', 'i')

cands = []
def add(d, b, c, t, s, e, cat, sug, why=''):
    a0 = max(0, s - 80); a1 = min(len(t), e + 80)
    cands.append({'dir': d, 'work': slots[d]['work'], 'translator': slots[d]['name'], 'book': b, 'chapter': c, 'cat': cat,
                  'found': t[s:e], 'suggest': sug, 'why': why, 'context': ('…' if a0 else '') + t[a0:a1] + ('…' if a1 < len(t) else '')})

SUBS = [('rn', 'm'), ('m', 'rn'), ('cl', 'd'), ('d', 'cl'), ('li', 'h'), ('h', 'li'), ('ii', 'u'), ('u', 'ii'), ('vv', 'w'), ('tb', 'th'), ('b', 'h'), ('h', 'b'),
        ('c', 'e'), ('e', 'c'), ('l', 'i'), ('i', 'l'), ('f', 't'), ('t', 'f'), ('n', 'u'), ('u', 'n'), ('o', 'a'), ('a', 'o'), ('ri', 'n'), ('n', 'ri'), ('s', 'a'), ('j', 'i'), ('y', 'v'), ('v', 'y')]
for d, chs in texts.items():
    for b, c, t in chs:
        for m in WORD.finditer(t):
            w = m.group(0); lw = w.lower()
            if cnt[lw] > 2 or not lw.isalpha(): continue
            # 1. two words run together
            if len(lw) >= 5:
                best = None
                for k in range(1, len(lw)):
                    x, y = lw[:k], lw[k:]
                    if (len(x) >= 2 or x in ('a',)) and len(y) >= 2 and common(x) and common(y):
                        sc = (5 if (x in STRONG or y in STRONG) else 0) + (4 if thyph[d][f'{x}-{y}'] else 0) + (3 if tbig[d][(x, y)] >= 2 else 0)
                        if sc and (best is None or sc > best[0]): best = (sc, x, y)
                if best:
                    _, x, y = best
                    sug = f'{w[:len(x)]}-{w[len(x):]}' if f'{x}-{y}' in hyph and hyph[f'{x}-{y}'] >= bigram[(x, y)] else f'{w[:len(x)]} {w[len(x):]}'
                    add(d, b, c, t, m.start(), m.end(), 'run-together', sug, f'"{x} {y}" occurs {bigram[(x, y)]}x, "{x}-{y}" {hyph[f"{x}-{y}"]}x')
                    continue
            # 3. one OCR letter swap
            if len(lw) >= 3 and cnt[lw] <= 1:
                for a, z in SUBS:
                    i = lw.find(a)
                    while i != -1:
                        v = lw[:i] + z + lw[i + len(a):]
                        if cnt[v] >= 20:
                            add(d, b, c, t, m.start(), m.end(), 'letter-swap', v if w.islower() else v.capitalize(), f'"{v}" occurs {cnt[v]}x')
                            break
                        i = lw.find(a, i + 1)
                    else:
                        continue
                    break
        # 2. a word split in two (space, or hyphen left from a line break)
        for m in re.finditer(r"\b([A-Za-z]{2,})(-?\s|-)([a-z]{2,})\b", t):
            x, sep, y = m.group(1), m.group(2), m.group(3); j = (x + y).lower()
            if cnt[j] >= 5 and (cnt[x.lower()] <= 2 or cnt[y.lower()] <= 2) and not (sep == '-' and hyph[f'{x.lower()}-{y.lower()}'] >= 3):
                add(d, b, c, t, m.start(), m.end(), 'split-word', x + y, f'"{j}" occurs {cnt[j]}x')
        # 4. Greek letters inside English
        for m in re.finditer(r"(?<=[A-Za-z,.;:] )[α-ωἀ-῿]{1,3}(?= [A-Za-z])|[a-z][α-ωἀ-῿]|[α-ωἀ-῿][a-z]", t):
            add(d, b, c, t, m.start(), m.end(), 'greek-in-english', '', 'Greek letters in an English phrase')
        # 5. digits inside words; 6. stray characters
        for m in re.finditer(r"\b([A-Za-z]{3,})(\d{1,3})\b|\b(\d{1,2})([a-z]{3,})\b", t):
            word = (m.group(1) or m.group(4) or '').lower()
            if cnt[word] < 20: continue
            add(d, b, c, t, m.start(), m.end(), 'digit-in-word', '', '')
        for m in re.finditer((r"[¬„¦~�ﬁﬂ€]|Ã.|â€|(?<!\[)\^" + ("" if d == "rhet-roberts" else r"|\|")), t):
            add(d, b, c, t, m.start(), m.end(), 'stray-character', '', '')
        # 7. doubled words; 8. missing space after punctuation
        for m in re.finditer(r"\b([A-Za-z]+) \1\b", t, re.I):
            a1, a2 = m.group(0).split(' ', 1)
            if a1 != a2 or m.group(1).lower() in ('that', 'had', 'is', 'was'): continue
            add(d, b, c, t, m.start(), m.end(), 'doubled-word', m.group(1), '')
        for m in re.finditer(r"\b[a-z]{2,}[,;:][A-Za-z]{2,}\b|\b[a-z]{3,}\.[A-Z][a-z]+\b", t):
            if re.search(r"\b(viz|cf|sc|etc|ibid|op|loc|vol|ch|chap|bk|lit|ed|trans|cit)\.", m.group(0), re.I): continue
            add(d, b, c, t, m.start(), m.end(), 'missing-space', re.sub(r"([,;:.])", r"\1 ", m.group(0), count=1), '')

json.dump(cands, open(out_path, 'w'), indent=1, ensure_ascii=False)
by = collections.Counter(c['cat'] for c in cands); byd = collections.Counter(c['dir'] for c in cands)
print(len(texts), 'texts;', sum(cnt.values()), 'words;', len(cnt), 'distinct')
print(len(cands), 'candidates:', dict(by))
print('most:', byd.most_common(12))
