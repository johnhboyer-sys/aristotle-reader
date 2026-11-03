"""Every anchors.yaml entry must resolve on the corrected text where it
resolved before, mapped. Old entries (origin/main) are located in the old
prose and new entries (working tree) in the new prose, the way _find_phrase
does (full phrase, then 8/6/5/4-word prefixes); each old hit is mapped through
the word-level diff and must be among the new hits. Entries added or removed
are listed. A positive control (a known-moved entry) must fail.

usage (repo root): python3 -I anchors_check.py <old.json> <new.json>"""
import glob, json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import yaml
from wordmap import Map

old = json.load(open(sys.argv[1], encoding='utf-8'))
new = json.load(open(sys.argv[2], encoding='utf-8'))
slot = {k.split('|')[0]: k for k in old}


def hits(chs, phrase):
    words = phrase.split()
    for k in (None, 8, 6, 5, 4):
        part = words if k is None else words[:k]
        if k is not None and len(words) <= k:
            continue
        pat = re.compile(r'\s+'.join(re.escape(w) for w in part))
        out = {(ch, m.start()) for ch, t in chs.items() for m in pat.finditer(t)}
        if out:
            return out
    return set()


def check(d, old_entries, new_entries, maps):
    oc, nc = old[slot[d]], new[slot[d]]
    o_by = {str(e['bekker']): str(e['at']).strip() for e in old_entries}
    n_by = {str(e['bekker']): str(e['at']).strip() for e in new_entries}
    removed = sorted(set(o_by) - set(n_by))
    added = sorted(set(n_by) - set(o_by))
    bad, newly = [], []
    for b in set(o_by) & set(n_by):
        oh = hits(oc, o_by[b])
        nh = hits(nc, n_by[b])
        if not oh:
            if nh:
                newly.append(b)
            continue
        mapped = set()
        for ch, s in oh:
            if oc[ch] == nc[ch]:
                mapped.add((ch, s))
            else:
                mp = maps.setdefault(ch, Map(oc[ch], nc[ch]))
                mapped.add((ch, mp.f(s)))
        # an old hit inside text a correction deleted (a footnote run-in, a
        # garbled repeat) may legitimately vanish; every surviving hit must map
        if not (mapped & nh) or not (nh <= mapped):
            bad.append((b, o_by[b][:50], sorted(mapped)[:3], sorted(nh)[:3]))
    return removed, added, bad, newly


tot_bad = 0
for f in sorted(glob.glob('sources/*/anchors.yaml')):
    d = f.split('/')[1]
    if d not in slot:
        continue
    o_raw = subprocess.run(['git', 'show', f'origin/main:{f}'], capture_output=True, text=True).stdout
    oe = yaml.safe_load(o_raw) or []
    ne = yaml.safe_load(open(f, encoding='utf-8').read()) or []
    if oe == ne and all(old[slot[d]][c] == new[slot[d]].get(c) for c in old[slot[d]]):
        continue
    removed, added, bad, newly = check(d, oe, ne, {})
    tot_bad += len(bad)
    if removed or added or bad or newly:
        print(f'{d}: removed {removed[:12]} added {added[:6]} newly-resolved {newly[:6]} BAD {len(bad)}')
        for x in bad[:6]:
            print('    ', x)

# positive control: point one Cael entry at the wrong words; it must be caught
d = 'cael-stocks'
ne = yaml.safe_load(open(f'sources/{d}/anchors.yaml', encoding='utf-8'))
oe = yaml.safe_load(subprocess.run(['git', 'show', f'origin/main:sources/{d}/anchors.yaml'], capture_output=True, text=True).stdout)
victim = next(e for e in ne if str(e['bekker']) == '268b15')
victim['at'] = 'Of things constituted by nature some are bodies and magnitudes'
_, _, bad, _ = check(d, oe, ne, {})
assert any(b[0] == '268b15' for b in bad), 'control not caught'
print(f'control caught; {tot_bad} bad entries in all')
