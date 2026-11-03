"""Remap every gloss map's anchor offsets from the old chapter prose (before the
English corrections) onto the new prose, the way
pipeline/tools/migrate_meta_gloss_offsets.py did for the quote strip, but for
arbitrary edits: an offset in unchanged text moves with it; one inside a
changed run goes to that run's start in the new text. `ross_len` keeps whatever
drift it had (most maps are one short: the parser's trailing newline came after
them), so it moves by exactly the chapter's change in length.

The cut pages (De Caelo I.12, Politics II.12 and V.11) had no English past the
cut, so the aligner piled every later line onto one offset just before it;
with the text restored those anchors point at the wrong place. In each pile the
first (lowest) citation is real and is kept; the rest are dropped, and the
build interpolates those lines across the restored text.

usage (repo root): python3 -I remap_gloss.py <old.json> <new.json> <report.json>"""
import difflib, glob, json, re, sys
from pathlib import Path
import yaml

old = json.load(open(sys.argv[1], encoding='utf-8'))
new = json.load(open(sys.argv[2], encoding='utf-8'))
slot_key = {k.split('|')[0]: k for k in old}

maps = {}
for mf in sorted(glob.glob('manifests/*.yaml')):
    m = yaml.safe_load(open(mf, encoding='utf-8'))
    w = m['work']['id']
    for slot, cfg in (m.get('english') or {}).items():
        for c in (cfg if isinstance(cfg, list) else [cfg]):
            if isinstance(c, dict) and c.get('id') and c.get('dir'):
                p = Path('alignment-results') / c['id'] / f"{w}_{c['id']}_gloss_map.json"
                if p.exists():
                    maps.setdefault(str(p), set()).add(c['dir'])

PILES = {('alignment-results/stocks/Cael_stocks_gloss_map.json', '1:12'),
         ('alignment-results/jowett/Pol_jowett_gloss_map.json', '2:12'),
         ('alignment-results/jowett/Pol_jowett_gloss_map.json', '5:11')}


def cit_key(c):
    m = re.match(r'(\d+)([ab])(\d+)$', c)
    return (int(m.group(1)), m.group(2), int(m.group(3)))


def _spans(s):
    """Word tokens (a word and the whitespace after it), plus any leading
    whitespace, as (start, end) spans covering the whole string."""
    sp = []
    m0 = re.match(r'\s+', s)
    if m0:
        sp.append((0, m0.end()))
    sp += [(m.start(), m.end()) for m in re.finditer(r'\S+\s*', s)]
    return sp


def mapper(o, n):
    """Offset maps from o to n through a word-level diff (a character diff is
    too slow on 30,000-character chapters). Equal tokens are identical strings,
    so an offset inside one keeps its place within the word."""
    import bisect
    os_, ns_ = _spans(o), _spans(n)
    ot, nt = [o[a:b] for a, b in os_], [n[a:b] for a, b in ns_]
    ops = difflib.SequenceMatcher(None, ot, nt, autojunk=False).get_opcodes()
    starts = [a for a, _ in os_]
    tok = lambda off: bisect.bisect_right(starts, off) - 1
    def op_of(i):
        for op in ops:
            if op[1] <= i < op[2]:
                return op
    def f(off):
        if off >= len(o):
            return len(n)
        i = tok(off)
        tag, i1, i2, j1, j2 = op_of(i)
        if tag == 'equal':
            j = j1 + (i - i1)
            return ns_[j][0] + (off - os_[i][0])
        return ns_[j1][0] if j1 < len(ns_) else len(n)
    def inside(off):
        return off < len(o) and op_of(tok(off))[0] != 'equal'
    def touches(lo, hi):
        hi = min(hi, len(o))
        if lo >= hi:
            return False
        a, b = tok(lo), tok(hi - 1)
        return any(tag != 'equal' and ((i1 <= b and i2 > a) or (i1 == i2 and a < i1 <= b))
                   for tag, i1, i2, j1, j2 in ops)
    return f, inside, touches


report = {'maps': {}, 'dropped': [], 'moved_into_changes': []}
for p, dirs in sorted(maps.items()):
    assert len(dirs) == 1, (p, dirs)
    d = dirs.pop()
    if d not in slot_key:   # a gated translation, not in this checkout: untouched
        continue
    key = slot_key[d]
    raw = open(p, encoding='utf-8').read()
    gm = json.loads(raw)
    assert json.dumps(gm, indent=1, ensure_ascii=True) == raw, p
    changed = 0
    for ch, entry in gm.items():
        o, n = old[key][ch], new[key][ch]
        if (p, ch) in PILES:
            offs = {}
            for a in entry['anchors']:
                offs.setdefault(a['offset'], []).append(a)
            pile_off = max(x for x, v in offs.items() if len(v) > 2)
            pile = sorted(offs[pile_off], key=lambda a: cit_key(a['citation']))
            drop = {id(a) for a in pile[1:]}
            report['dropped'] += [f"{p.split('/')[-1]} {ch} {a['citation']}" for a in pile[1:]]
            entry['anchors'] = [a for a in entry['anchors'] if id(a) not in drop]
        if o == n:
            continue
        changed += 1
        f, inside, touches = mapper(o, n)
        for a in entry['anchors']:
            was = a['offset']
            a['offset'] = f(was)
            if inside(was):
                report['moved_into_changes'].append(f"{p.split('/')[-1]} {ch} {a['citation']} {was}->{a['offset']}")
            elif not touches(was, was + 12) and o[was:was + 12] != n[a['offset']:a['offset'] + 12]:
                raise SystemExit(f'bad map {p} {ch} {a["citation"]}: {o[was:was+12]!r} vs {n[a["offset"]:a["offset"]+12]!r}')
        entry['ross_len'] += len(n) - len(o)
    out = json.dumps(gm, indent=1, ensure_ascii=True)
    if out != raw:
        open(p, 'w', encoding='utf-8').write(out)
    report['maps'][p] = changed
json.dump(report, open(sys.argv[3], 'w', encoding='utf-8'), indent=1)
print(len(maps), 'maps;', sum(report['maps'].values()), 'chapters remapped;', len(report['dropped']), 'piled anchors dropped;', len(report['moved_into_changes']), 'anchors sat inside a changed run')
