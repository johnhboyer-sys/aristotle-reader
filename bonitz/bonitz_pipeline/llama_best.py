"""
Pick the better LlamaParse reading per page, across every run we have.

LlamaParse's ligature handling is close to random between runs — page 106 gave
30, then 43, then 0 on the same image — so each completed run is an independent
sample, and there is no reason to throw the earlier ones away.  The 400 dpi
best-of-2 pass beat the 300 dpi pass on 89 pages and lost on 53; taking the
per-page maximum makes it effectively best-of-3 or 4 and strictly dominates
either run alone.  Costs nothing: no API calls, everything is already on disk.

Selection is by ligature count, for the same reason the best-of-N inside a run
uses it: LlamaParse misses ligatures often and invents them rarely, so more of
them means a better reading of the one character this edition cannot lose.

    python3 -m bonitz_pipeline.llama_best

Writes `raw/llama-best/page-NNN.md` plus a `SOURCES.json` recording which run
won each page, so the choice is auditable and reversible.
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Every completed run, newest first; ties go to the earlier entry.
RUNS = [
    ('400dpi-best-of-2', ROOT / 'raw/llama400'),
    ('300dpi-original', ROOT / 'raw/llamaparse'),
]
OUT = ROOT / 'raw/llama-best'


def main() -> int:
    pages = sorted({int(f.stem.split('-')[1])
                    for _, d in RUNS if d.exists()
                    for f in d.glob('page-*.md')})
    if not pages:
        sys.exit('no LlamaParse output found')

    OUT.mkdir(parents=True, exist_ok=True)
    sources: dict[str, dict] = {}
    wins: dict[str, int] = {}
    total = 0

    for p in pages:
        best_name, best_text, best_lig = None, None, -1
        counts = {}
        for name, d in RUNS:
            f = d / f'page-{p:03d}.md'
            if not f.exists():
                continue
            t = f.read_text(encoding='utf-8')
            lig = t.count('ȣ')
            counts[name] = lig
            if lig > best_lig:
                best_name, best_text, best_lig = name, t, lig
        if best_text is None:
            continue
        (OUT / f'page-{p:03d}.md').write_text(best_text, encoding='utf-8')
        sources[f'{p:03d}'] = {'chosen': best_name, 'ligatures': best_lig,
                               'all': counts}
        wins[best_name] = wins.get(best_name, 0) + 1
        total += best_lig

    (OUT / 'SOURCES.json').write_text(json.dumps(
        {'_': ['Which LlamaParse run won each page, and every run\'s count.',
               'Selection is by ligature count: LlamaParse misses them often',
               'and invents them rarely, so more is a better reading.'],
         'pages': sources}, ensure_ascii=False, indent=1), encoding='utf-8')

    print(f'{len(sources)} pages -> {OUT}')
    for name, n in sorted(wins.items(), key=lambda kv: -kv[1]):
        print(f'  {n:4d} pages won by {name}')
    print(f'  {total} ligatures total')
    for name, d in RUNS:
        got = sum(c['all'].get(name, 0) for c in sources.values())
        print(f'    ({name} alone would give {got})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
