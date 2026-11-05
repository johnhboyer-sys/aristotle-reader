# Keep only Parma tokens set in the commentary's body type: per page, body = the largest type size holding 100+ tokens.
import json, collections
S = json.load(open('streams.json')); pm = S['pm'][400:133754]; B = json.load(open('boxes.json'))
pages = collections.defaultdict(collections.Counter)
for b in B:
    if b[2]: pages[b[0]][b[2]] += 1
# body type is 45, 50 or 54 px depending on the scan's scale; 41 is Parma's small type (Aristotle's texts, notes)
body = {k: max([s for s, n in c.items() if n >= 40 and 44 <= s <= 58] or [0]) for k, c in pages.items()}
print('pages with no body type:', sorted(k for k, v in body.items() if v == 0))
keep = []; drop = collections.Counter()
for i, b in enumerate(B):
    xs = b[2]
    if xs is None or (body[b[0]] and 0.9 * body[b[0]] <= xs <= 1.1 * body[b[0]]): keep.append(i)
    else: drop['small' if xs < (body[b[0]] or 99) else 'large'] += 1
json.dump(keep, open('keep.json', 'w'))
print('kept', len(keep), 'of', len(B), dict(drop), '| body sizes', collections.Counter(body.values()))
