"""Margin-guard geometry for 118-281, measured off the ALTO instead of crops.

`margin_guard.line_widths` opens every dumped line image. Those images live only
in /kaggle/working for this tranche, and pulling them is 7 GB. The width it
measures is the width of the box the SEGMENTER drew, and kraken writes that into
the ALTO as TextLine WIDTH — the same number, before ketos ever cuts it.

Read-only. Writes nothing, changes no module. It answers one question: does any
column in 118-281 show the numbered-line-runs-wide signature that put seventeen
gutter numbers inside the text on 107-117?
"""
import sys
from pathlib import Path

ROOT = Path('/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz')
sys.path.insert(0, str(ROOT))

from bonitz_pipeline import filter_kraken_lines as flk  # noqa: E402
from bonitz_pipeline import margin_guard  # noqa: E402

ALTO = ROOT / 'work/kraken15-102/alto118-281'
TXT = ROOT / 'work/kraken15-102/txt118-281'

widths = {}
previous_line = None
mismatch = []
for page in range(118, 282):
    for side in ('L', 'R'):
        stem = f'page-{page:03d}-{side}'
        alto = ALTO / f'{stem}.xml'
        if not alto.exists():
            sys.exit(f'{stem}: no ALTO')
        lines = flk.parse_alto_lines(alto)
        w, _ = flk.alto_size(alto)
        kept, _ = flk.filter_lines(lines, w, previous_line, 61)
        spine = (TXT / f'{stem}.txt').read_text(encoding='utf-8').splitlines()
        got = [l['content'] for l in kept]
        if got != spine:
            mismatch.append(stem)
        previous_line = spine[-1] if spine else None
        widths[stem] = [l['width'] for l in kept]

if mismatch:
    sys.exit(f'refiltering does not reproduce the spine on {mismatch[:5]} '
             f'({len(mismatch)} columns) — the widths below would be keyed to '
             f'lines the spine does not have')

print(f'{len(widths)} columns, {sum(len(v) for v in widths.values())} lines, '
      f'reproduced the spine exactly')
sus = margin_guard.suspect_columns(widths)
print(f'{len(sus)} column(s) whose numbered lines run wide by '
      f'{margin_guard.WIDE_BY}px or more')
for col, med, nmed, lines in sus:
    print(f'  {col}  median {med}  numbered {nmed}  (+{nmed - med})  '
          f'lines {lines[0]}-{lines[-1]} every 5')

# The spread, so "none" can be read as measured rather than as nothing looked.
deltas = []
import statistics
for col, ws in widths.items():
    if len(ws) < 10:
        continue
    numbered = [ws[n - 1] for n in range(5, len(ws) + 1, 5)]
    deltas.append((statistics.median(numbered) - statistics.median(ws), col))
deltas.sort()
print(f'delta range across columns: {deltas[0][0]:+.0f}px ({deltas[0][1]}) to '
      f'{deltas[-1][0]:+.0f}px ({deltas[-1][1]}); '
      f'median {statistics.median([d for d, _ in deltas]):+.0f}px')
