"""Did the wide box actually PUT the gutter number in the text?

`margin_guard` answers where the segmenter drew the box; it says outright that
only the ink says whether the number was read. 107-L was as wide as 109-L and
clean. So this asks the text a question the geometry cannot answer, on the
kraken spine we already have: inside one column, are the every-fifth lines
LONGER than their neighbours?

A swallowed number adds one to three characters at the end of the line. Per
column that is a tiny effect; across 65 columns it is either there or it is not.
Read-only, and it proves nothing about any single line — it says which columns
are worth cutting crops for.
"""
import re
import statistics
import sys
from pathlib import Path

ROOT = Path('/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz')
TXT = ROOT / 'work/kraken15-102/txt118-281'

SUSPECT = set()
for line in Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name('margin118-281.txt')).read_text().splitlines():
    m = re.match(r'\s+(page-\d+-[LR])\s+median', line)
    if m:
        SUSPECT.add(m.group(1))

def profile(stem):
    lines = (TXT / f'{stem}.txt').read_text(encoding='utf-8').splitlines()
    if len(lines) < 20:
        return None
    num = [len(lines[n - 1]) for n in range(5, len(lines) + 1, 5)]
    oth = [len(l) for i, l in enumerate(lines, 1) if i % 5]
    # a bare trailing token of 1-2 chars after a space, on a numbered line
    tail = sum(1 for n in range(5, len(lines) + 1, 5)
               if re.search(r'\s\S{1,2}$', lines[n - 1]))
    tail_oth = sum(1 for i, l in enumerate(lines, 1)
                   if i % 5 and re.search(r'\s\S{1,2}$', l))
    return (statistics.median(num) - statistics.median(oth),
            tail / max(1, len(num)), tail_oth / max(1, len(oth)))

rows = {'suspect': [], 'clean': []}
for f in sorted(TXT.glob('page-*.txt')):
    stem = f.stem
    p = profile(stem)
    if p is None:
        continue
    rows['suspect' if stem in SUSPECT else 'clean'].append((stem, *p))

print(f'{len(SUSPECT)} suspect columns read from the geometry report\n')
for k, rs in rows.items():
    dlen = [r[1] for r in rs]
    tail = [r[2] for r in rs]
    tail_o = [r[3] for r in rs]
    print(f'{k:8s} n={len(rs):3d}  '
          f'median(numbered) - median(other) = {statistics.median(dlen):+.1f} chars  '
          f'| short trailing token: numbered {statistics.mean(tail):.1%} '
          f'vs other {statistics.mean(tail_o):.1%}')

worst = sorted(rows['suspect'], key=lambda r: -r[1])[:8]
print('\nsuspect columns with the largest length excess:')
for stem, d, t, to in worst:
    print(f'  {stem}  {d:+.1f} chars  trailing-token {t:.0%} vs {to:.0%}')
