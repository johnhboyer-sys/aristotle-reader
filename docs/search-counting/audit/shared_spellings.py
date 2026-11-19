"""Shared-spelling audit for a built corpus's data/ directory.

A lemma search folds the typed word (accents, breathings, case dropped) and searches
every index key in lemma-map[fold]. A fold mapped to several keys pulls in all their
tokens: how τί μήν took in μείς and μής, and how αὐτή takes in every οὗτος.

Part 1, extra hits. For a fold with 2+ keys, from the per-work postings
(<Work>/search/greek_lemma.json, the positions the search itself unions):
    extra = |union of the keys' positions| - |largest single key's positions|
the fewest hits a search on that fold adds, whichever key was meant. Exact, not
estimated: a token filed under two keys is counted once.

Part 2, would accents separate them? Each work's analyses.json gives an accented form's
lemmas; the picker maps each lemma to its index key. For a shared fold, with U = the
keys of all its accented forms and L(a) = the keys of form a:
    separable   every L(a) has one key: matching the accented form decides
    narrowable  every L(a) is smaller than U, some keep 2+: accents help
    stuck       some accented form carries all of U: only per-token tagging decides
Shared folds with no accented form in analyses.json are counted apart
('no analyses'). Lemmas the index has already merged into one key (ὄρος and ὅρος are both "oros") are
reported apart: no lookup can split them, only finer postings.

Usage: python3 -I shared_spellings.py <label> <data dir> [top N]
"""
import json, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path

label, data = sys.argv[1], Path(sys.argv[2])
top = int(sys.argv[3]) if len(sys.argv) > 3 else 20


def load_shards(name):
    out = {}
    for f in sorted((data / name).glob('*.json')):
        out.update(json.loads(f.read_text()))
    return out


lmap = load_shards('lemma-map')
# The plays' map holds [key, beta] pairs; the other readers' hold bare keys.
lmap = {f: list(dict.fromkeys(k[0] if isinstance(k, list) else k for k in ks)) for f, ks in lmap.items()}
picker = load_shards('lemma-picker')
post = defaultdict(set)
works = sorted(data.glob('*/search/greek_lemma.json'))
for wf in works:
    work = wf.parent.parent.name
    for key, positions in json.loads(wf.read_text()).items():
        post[key].update((work, *p) for p in positions)
analyses = sorted(data.glob('*/analyses.json'))
for what, n in [('lemma-map', len(lmap)), ('lemma-picker', len(picker)),
                ('postings files', len(works)), ('analyses files', len(analyses))]:
    if not n:
        sys.exit(f'{label}: examined nothing ({what} empty under {data})')


def head(k):
    e = picker.get(k)
    return e['c'][0]['h'] if e and e.get('c') else f'?{k}'


def extra(keys):
    sizes = [len(post.get(k, ())) for k in keys]
    union = set().union(*(post.get(k, set()) for k in keys))
    return len(union) - max(sizes, default=0)


shared = {f: ks for f, ks in lmap.items() if len(ks) > 1}
no_postings = {k for ks in shared.values() for k in ks if k not in post}
rows = []
for f, ks in shared.items():
    norm = [unicodedata.normalize('NFC', head(k)).lower() for k in ks]
    rows.append((extra(ks), f, ks, len(set(norm)) == len(norm)))
rows.sort(reverse=True)
total_extra = sum(r[0] for r in rows)

print(f'## {label}')
print(f'folds {len(lmap):,} · shared by 2+ keys {len(shared):,} ({len(shared)/len(lmap):.1%}) · '
      f'typing the headword cannot separate {sum(not r[3] for r in rows):,} · '
      f'shared keys with no postings {len(no_postings)}')
print(f'extra hits over all shared folds {total_extra:,}; folds adding 100+ {sum(r[0] >= 100 for r in rows):,}')
print(f'top {top} by extra hits:')
for e, f, ks, ok in rows[:top]:
    parts = sorted(((len(post.get(k, ())), head(k)) for k in ks), reverse=True)
    print(f'  {f:<12} +{e:>6,}  {"" if ok else "[same headword] "}' + ', '.join(f'{h} {n:,}' for n, h in parts))

# Part 2: lemma (Beta Code, accented) -> index key, from the picker.
strip = lambda b: re.sub(r'\d+$', '', b)
key_of = {}
for k, e in picker.items():
    for c in e.get('c', []):
        key_of.setdefault(c['k'], k)
        key_of.setdefault(strip(c['k']), k)
# The index keeps elision apostrophes (ἀλλ' is "all'"), so this fold does too.
fold = lambda b: re.sub(r"[^a-z']", '', b.lower())
form_keys, form_raw, unmapped = defaultdict(set), defaultdict(set), set()
for af in analyses:
    for form, al in json.loads(af.read_text()).items():
        for a in al:
            lem = a.get('lemma')
            if not lem:
                continue
            # Most picker entries name their Beta Code; the rest are keyed by the
            # lemma's own fold (the search index folds lemma keys the same way).
            k = key_of.get(lem) or key_of.get(strip(lem))
            if k is None and fold(strip(lem)) in picker:
                k = fold(strip(lem))
            if k is None:
                unmapped.add(lem)
                continue
            form_keys[form.lower()].add(k)
            form_raw[form.lower()].add(strip(lem))
byfold = defaultdict(dict)
for form, ks in form_keys.items():
    byfold[fold(form)][form] = ks
classes = {'separable': [], 'narrowable': [], 'stuck': []}
merged = 0
for f, fs in byfold.items():
    U = set().union(*fs.values())
    raw = set().union(*(form_raw[a] for a in fs))
    if len(U) < 2:
        merged += len(raw) > 1
        continue
    sizes = [len(ks) for ks in fs.values()]
    cls = 'separable' if all(s == 1 for s in sizes) else 'narrowable' if all(s < len(U) for s in sizes) else 'stuck'
    classes[cls].append(f)
classed = {f for v in classes.values() for f in v}
classes['no analyses'] = [f for f in shared if f not in classed]
n_shared = sum(len(v) for v in classes.values())
weights = {c: sum(extra(lmap.get(f, [])) for f in v) for c, v in classes.items()}
# Percentages are of part 1's total, every shared fold included.
wsum = total_extra or 1
print(f'\naccents: {len(form_keys):,} accented forms; {n_shared:,} shared folds; '
      f'lemmas the picker cannot place {len(unmapped):,}; folds whose 2+ lemmas share one key {merged:,}')
for c in classes:
    print(f'  {c:<11} {len(classes[c]):>6,} folds ({len(classes[c])/max(n_shared, 1):.0%})  '
          f'extra hits {weights[c]:>9,} ({weights[c]/wsum:.0%})')
fixable = sorted(classes['separable'] + classes['narrowable'], key=lambda f: -extra(lmap.get(f, [])))[:10]
print('  heaviest folds accents would help: ' + ', '.join(f'{f} +{extra(lmap.get(f, [])):,}' for f in fixable))
