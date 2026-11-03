"""Remap sources/<dir>/paragraphs.yaml (main's paragraph placement, PR #177)
onto the corrected prose: each entry's chapter offset moves through a
word-level diff of the old and new chapter text; if an edit touched its
opening words, `at` is re-read from the new prose (same word count). Lines are
rewritten in place, keeping the file's flow style. Then the build's own check,
stage1_archive._load_paragraphs, must accept every file.

usage (repo root): python3 -I remap_paragraphs.py <old.json> <new.json>"""
import glob, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, 'pipeline')
import yaml
from wordmap import Map  # noqa: E402  (same word-level mapper as update_anchors.py)
from aristotle_pipeline import stage1_archive

old = json.load(open(sys.argv[1], encoding='utf-8'))
new = json.load(open(sys.argv[2], encoding='utf-8'))
slot = {k.split('|')[0]: k for k in old}
LINE = re.compile(r'^(- \{book: (\d+), chapter: (\d+), offset: )(\d+)(, at: )(".*")(\}\s*)$')

for f in sorted(glob.glob('sources/*/paragraphs.yaml')):
    d = f.split('/')[1]
    oc, nc = old[slot[d]], new[slot[d]]
    lines = open(f, encoding='utf-8').read().splitlines(keepends=True)
    maps, moved, reworded = {}, 0, 0
    for i, ln in enumerate(lines):
        m = LINE.match(ln)
        if not m:
            assert not ln.lstrip().startswith('- '), (f, ln)
            continue
        ch = f'{m.group(2)}:{m.group(3)}'
        off, at = int(m.group(4)), json.loads(m.group(6))
        if oc[ch] == nc[ch]:
            continue
        mp = maps.setdefault(ch, Map(oc[ch], nc[ch]))
        n_off = mp.f(off)
        words = at.split()
        end = off + len(re.compile(r'\s+'.join(map(re.escape, words))).match(oc[ch], off).group(0))
        n_at = at
        if mp.touches(off, end):
            n_at = ' '.join(nc[ch][n_off:].split()[:len(words)])
            reworded += 1
        if n_off != off or n_at != at:
            moved += n_off != off
            lines[i] = f'{m.group(1)}{n_off}{m.group(5)}{json.dumps(n_at, ensure_ascii=False)}{m.group(7)}'
    open(f, 'w', encoding='utf-8').write(''.join(lines))
    # the build's own check, on the new prose
    cfg = next(c for c in [dict(dir=d)])
    prose = {tuple(map(int, k.split(':'))): v for k, v in nc.items()}
    placed = stage1_archive._load_paragraphs(cfg, prose)
    print(f'{d}: {moved} offsets moved, {reworded} openings re-read; build check accepts {sum(len(v) for v in placed.values())} entries')
