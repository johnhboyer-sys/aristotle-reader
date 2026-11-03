"""Prove the raw edits did exactly what the correction records say.

For every archive translation: take the OLD parse (before any edit), apply each
record's find -> replace to its whitespace-collapsed book text as a plain string
replacement, and require the result to equal the NEW parse's collapsed book text.
Any edit the records don't account for (or a record that didn't land) shows up
as a mismatch. Also reports chapters whose paragraph-break count changed and
chapters added or lost.

usage: python3 -I verify.py <old.json> <new.json> <records.json> [<records2.json> ...]"""
import json, re, sys, difflib
from collections import defaultdict

old = json.load(open(sys.argv[1], encoding='utf-8'))
new = json.load(open(sys.argv[2], encoding='utf-8'))
recs = []
for p in sys.argv[3:]:
    recs += json.load(open(p, encoding='utf-8'))
col = lambda s: re.sub(r'\s+', ' ', s).strip()


def books(chs):
    by = defaultdict(list)
    for k, t in chs.items():
        b, c = map(int, k.split(':'))
        by[b].append((c, t))
    return {b: col(' '.join(t for _, t in sorted(v))) for b, v in by.items()}


by_dir = defaultdict(list)
for r in recs:
    by_dir[r['dir']].append(r)

bad, checked, n_recs, used = [], 0, 0, set()
for key in sorted(old):
    d = key.split('|')[0]
    ob, nb = books(old[key]), books(new.get(key, {}))
    if set(ob) != set(nb):
        bad.append((key, 'books differ', sorted(ob), sorted(nb)))
        continue
    for b in sorted(ob):
        t = ob[b]
        for r in [r for r in by_dir.get(d, []) if int(r['book']) == b]:
            f, rp = col(r['find']), col(r['replace'])
            k = t.find(f)
            if k < 0:
                bad.append((key, b, 'find not in old text', f[:80]))
                continue
            if t.find(f, k + 1) >= 0:
                bad.append((key, b, 'find twice in old text', f[:80]))
                continue
            t = t[:k] + rp + t[k + len(f):]
            n_recs += 1
            used.add(id(r))
        checked += 1
        if t != nb[b]:
            sm = difflib.SequenceMatcher(None, t, nb[b], autojunk=False)
            diffs = [(tag, t[max(0, i1 - 40):i2 + 40], nb[b][max(0, j1 - 40):j2 + 40]) for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != 'equal']
            bad.append((key, b, 'result differs from new parse', diffs[:4]))
    # paragraph structure
    for k in sorted(set(old[key]) | set(new.get(key, {}))):
        o, n = old[key].get(k), new.get(key, {}).get(k)
        if o is None or n is None:
            print(f'  chapter {"added" if o is None else "lost"}: {key} {k}')
        elif o.count('\n') != n.count('\n'):
            print(f'  paragraph breaks {o.count(chr(10))} -> {n.count(chr(10))}: {key} {k}')

unused = [r for r in recs if id(r) not in used]
print(f'{checked} books checked; {n_recs} records applied; {len(unused)} records not applied; {len(bad)} problems')
for u in unused[:10]:
    print('  unused:', u['dir'], u['book'], u['find'][:70])
for x in bad[:30]:
    print('  BAD', x)
