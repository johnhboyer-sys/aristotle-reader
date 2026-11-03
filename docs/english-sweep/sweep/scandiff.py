"""Compare the site's text of a translation with an OCR text of the printed book
(e.g. archive.org's _djvu.txt) and list the places where they differ by a few
words. The scan's own OCR errors, running heads and footnotes also show up as
differences, so every line needs a judgement; but a word the site dropped or
changed shows up here even when it makes a real word (which the detector misses).

usage: python3 -I scandiff.py <site text> <scan text> <out.json> [--max 6]
Only differences of at most --max words on either side, with at least 6
matching words on both sides, are listed."""
import difflib, json, re, sys
site_path, scan_path, out_path = sys.argv[1:4]
MAXW = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 6
norm = lambda w: re.sub(r"[^a-z0-9]", '', w.lower().replace('’', "'"))
site = open(site_path, encoding='utf-8').read()
scan = open(scan_path, encoding='utf-8', errors='replace').read()
scan = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", scan)             # words hyphenated at a line end
# page furniture: running heads in capitals, page and margin numbers, scraps.
def body(line):
    letters = sum(ch.isalpha() for ch in line); lower = sum(ch.islower() for ch in line)
    return lower >= 3 and letters >= 0.5 * len(line.strip())
scan = '\n'.join(l for l in scan.split('\n') if body(l))
# site tokens with their chapter labels and offsets
toks = []; chap = ''
for line in site.split('\n'):
    if line.startswith('=== '): chap = line.strip('= ').strip(); continue
    if line.startswith('# '): continue
    for m in re.finditer(r"\S+", line):
        n = norm(m.group(0))
        if n and not n.isdigit(): toks.append((n, m.group(0), chap))
stoks = [norm(w) for w in scan.split()]; sraw = scan.split()
keep = [i for i, n in enumerate(stoks) if n and not n.isdigit()]
stoks = [stoks[i] for i in keep]; sraw = [sraw[i] for i in keep]
a = [t[0] for t in toks]
# locate each site chunk in the scan by its first rare 8-gram, then align
index = {}
for i in range(len(stoks) - 8):
    index.setdefault(tuple(stoks[i:i + 8]), []).append(i)
diffs = []; CH = 1500; pos_hint = 0; aligned = 0; placed = 0
for start in range(0, len(a), CH):
    chunk = a[start:start + CH]
    at = None
    for k in range(0, min(len(chunk) - 8, 300)):
        hits = index.get(tuple(chunk[k:k + 8]))
        if hits and len(hits) == 1:
            at = hits[0] - k; break
    if at is None: continue
    placed += len(chunk)
    lo = max(0, at - 200); hi = min(len(stoks), at + CH + 400)
    sm = difflib.SequenceMatcher(None, chunk, stoks[lo:hi], autojunk=False)
    ops = sm.get_opcodes()
    aligned += sum(i2 - i1 for tag, i1, i2, j1, j2 in ops if tag == 'equal')
    for n, (tag, i1, i2, j1, j2) in enumerate(ops):
        if tag == 'equal': continue
        if i2 - i1 > MAXW or j2 - j1 > MAXW: continue
        # matching words on each side; a long run found only in the scan (a
        # footnote, a running head the filter missed) is stepped over
        def run(k, step):
            got = 0
            while 0 <= k < len(ops) and got < 5:
                t, a1, a2, b1, b2 = ops[k]
                if t == 'equal': got += a2 - a1
                elif t == 'insert' and b2 - b1 > MAXW: pass
                else: break
                k += step
            return got
        if run(n - 1, -1) < 5 or run(n + 1, 1) < 5: continue
        gi1, gi2 = start + i1, start + i2
        diffs.append({'chapter': toks[gi1 if gi1 < len(toks) else -1][2], 'site': ' '.join(t[1] for t in toks[gi1:gi2]), 'scan': ' '.join(sraw[lo + j1:lo + j2]),
                      'site_context': ' '.join(t[1] for t in toks[max(0, gi1 - 10):gi2 + 10]), 'scan_context': ' '.join(sraw[lo + max(0, j1 - 10):lo + j2 + 10])})
json.dump(diffs, open(out_path, 'w'), indent=1, ensure_ascii=False)
cover = aligned / max(1, len(a))
print(f"{len(diffs)} differences of at most {MAXW} words; {aligned} of {len(a)} site words matched the scan ({cover:.0%})")
if cover < 0.8:
    print(f"WARNING: only {cover:.0%} of the site text was compared. A short list here does not mean the texts agree: "
          "the scan may be another edition, OCR'd as another language, or missing pages.")
    sys.exit(2)
