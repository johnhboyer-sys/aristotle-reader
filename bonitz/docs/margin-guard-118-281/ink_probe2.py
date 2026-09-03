"""Second pass: the corruption that appends WITHOUT a space.

`Ζμδ5. 682` -> `6821` and `Ζκ11. 704` -> `70415` leave no space, so the
trailing-token test in ink_probe.py cannot see them. This counts line-final
digit runs instead, numbered lines against their own column's neighbours.
"""
import re, statistics
from pathlib import Path
ROOT = Path('/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz')
TXT = ROOT / 'work/kraken15-102/txt118-281'
SUSPECT = {m.group(1) for m in
           (re.match(r'\s+(page-\d+-[LR])\s+median', l)
            for l in Path(__file__).with_name('margin118-281.txt').read_text().splitlines()) if m}

PATS = {
    'final digit-run >=4': re.compile(r'\d{4,}\.?$'),
    'final digit-run >=5': re.compile(r'\d{5,}\.?$'),
    'bekker + extra digits': re.compile(r'\d{3,4}[ab]\d{3,}\.?$'),
}
for name, pat in PATS.items():
    out = {}
    for group in ('suspect', 'clean'):
        num_hit = num_all = oth_hit = oth_all = 0
        for f in sorted(TXT.glob('page-*.txt')):
            if (f.stem in SUSPECT) != (group == 'suspect'):
                continue
            lines = f.read_text(encoding='utf-8').splitlines()
            for i, l in enumerate(lines, 1):
                hit = bool(pat.search(l.rstrip()))
                if i % 5 == 0:
                    num_all += 1; num_hit += hit
                else:
                    oth_all += 1; oth_hit += hit
        out[group] = (num_hit/max(1,num_all), oth_hit/max(1,oth_all), num_hit, oth_hit)
    s, c = out['suspect'], out['clean']
    print(f'{name:24s} suspect numbered {s[0]:.2%} vs other {s[1]:.2%} '
          f'({s[2]} hits) | clean numbered {c[0]:.2%} vs other {c[1]:.2%} ({c[2]} hits)')
