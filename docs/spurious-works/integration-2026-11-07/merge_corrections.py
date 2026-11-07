"""3-way merge of sources/english-corrections.json by entry.
usage: merge_corrections.py BASE OURS THEIRS OUT"""
import json, sys
base, ours, theirs = (json.load(open(p)) for p in sys.argv[1:4])
key = lambda c: json.dumps(c, sort_keys=True, ensure_ascii=False)
for k in set(base) | set(ours) | set(theirs):
    if k == 'corrections': continue
    vals = {key(d.get(k)) for d in (base, ours, theirs)}
    if key(ours.get(k)) != key(theirs.get(k)):
        # take the side that changed it; both changed = stop
        if key(ours.get(k)) != key(base.get(k)) and key(theirs.get(k)) != key(base.get(k)):
            sys.exit(f'both sides changed top-level {k!r}')
B = [key(c) for c in base['corrections']]
O = [key(c) for c in ours['corrections']]
T = [key(c) for c in theirs['corrections']]
bs, os_, ts = set(B), set(O), set(T)
# Ours in its own order (its edits stay in place), less what theirs removed or
# edited away, plus theirs' additions and edits at the end.
removed_t = bs - ts
out = [c for c in ours['corrections'] if key(c) not in removed_t]
added_o = [c for c in ours['corrections'] if key(c) not in bs]
added_t = [c for c in theirs['corrections'] if key(c) not in bs and key(c) not in os_]
out += added_t
res = dict(ours)
for k in theirs:
    if k != 'corrections' and key(theirs[k]) != key(base.get(k)): res[k] = theirs[k]
res['corrections'] = out
# clash check: same find in same dir added on both sides with different replace
fo = {(c.get('dir'), c.get('work'), c['find']) for c in added_o}
clash = [c for c in added_t if (c.get('dir'), c.get('work'), c['find']) in fo]
print(f'base {len(B)} ours {len(O)} theirs {len(T)}; removed/edited by ours {len(bs-os_)}, by theirs {len(removed_t)}; added ours {len(added_o)}, theirs {len(added_t)}; result {len(out)}; clashes {len(clash)}')
json.dump(res, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
open(sys.argv[4], 'a').write('\n')
