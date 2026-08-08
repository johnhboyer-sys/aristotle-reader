"""
Pick the best Codex sample per column, across the best-of-N runs.

Measured 2026-08-07 on gold columns: Codex's kai-ligature decision is made once
per read and held for the whole column — recall was 0/5, 7/7, 0/9, 4/4, never
partial.  It varies between samples (030-R gave 0/9, 0/9, 9/9), so best-of-N is
the right harness, the same shape `llama_best.py` uses for LlamaParse.

Selection is by `ȣ` count ONLY, and deliberately not by `ϗ`.  Codex undercounts
ȣ and does not invent it — 9/7/8 against a 9-10 consensus on 053-L, 15/15
against 15-17 on 053-R, 22/23 and 12/14 on gold — so for that character "more
is better" holds and `llama_best.py`'s rule transfers.

It does NOT hold for ϗ.  On 053-L three samples of the same column gave 5, 1
and 0 where the true count is 2, and the 5 was Codex writing ϗ over `καί`
SPELLED OUT IN FULL (verified against the ink at lines 29/32/36/37).  Selecting
on ϗ would systematically pick the most hallucinating sample.  Its ϗ vote is
noise in both directions and should be muted in the panel, not maximised.

`--audit` prints the per-run spread so both premises stay checked.

    python3 work/codex/codex_best.py 53-62 [--audit]

Writes `work/codex/best/page-NNN-C.txt` plus SOURCES.json recording which run
won each column and what every run scored, so the choice is auditable.
"""

from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'best'
LIG, KAI = 'ȣ', 'ϗ'


def runs_for(stem: str) -> list[tuple[str, Path]]:
    """Every sample of one column, as (run label, path)."""
    found = [(f'r{f.stem.split(".r")[-1]}', f)
             for f in sorted(ROOT.glob(f'{stem}.400.r*.txt'))]
    plain = ROOT / f'{stem}.400.txt'
    if plain.exists():
        found.insert(0, ('r1', plain))
    return found


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='page range, e.g. 53-62')
    p.add_argument('--audit', action='store_true',
                   help='print every run\'s ligature counts, not just the winner')
    args = p.parse_args(argv)
    a, _, b = args.pages.partition('-')
    pages = range(int(a), int(b or a) + 1)

    OUT.mkdir(exist_ok=True)
    sources: dict[str, dict] = {}
    missing, spread = [], 0

    for pg in pages:
        for col in ('L', 'R'):
            stem = f'page-{pg:03d}-{col}'
            rs = runs_for(stem)
            if not rs:
                missing.append(stem)
                continue
            scored = []
            for label, f in rs:
                t = f.read_text(encoding='utf-8')
                # rank on ȣ alone — see the module docstring on why ϗ must not
                # enter the key, even though it is reported alongside.
                scored.append((t.count(LIG), label, t,
                               t.count(LIG), t.count(KAI), len(t.splitlines())))
            scored.sort(key=lambda r: -r[0])
            total, label, text, lig, kai, lines = scored[0]
            (OUT / f'{stem}.txt').write_text(text, encoding='utf-8')
            allruns = {r[1]: {'ȣ': r[3], 'ϗ': r[4], 'lines': r[5]} for r in scored}
            sources[stem] = {'chosen': label, 'ȣ': lig, 'ϗ': kai,
                             'lines': lines, 'all': allruns}
            if scored[0][0] != scored[-1][0]:
                spread += 1
            if args.audit:
                runs = '  '.join(f'{r[1]}:{r[3]}+{r[4]}' for r in sorted(scored, key=lambda r: r[1]))
                print(f'{stem}  ->{label}  ȣ{lig} ϗ{kai}  [{runs}]')

    if missing:
        sys.exit(f'no Codex runs for: {" ".join(missing)}')

    (OUT / 'SOURCES.json').write_text(json.dumps(
        {'_': ['Which Codex sample won each column, and every sample\'s counts.',
               'Selection is by ligature count: Codex undercounts ȣ/ϗ and does',
               'not invent them, so more is a better reading. The ϗ decision is',
               'per-column all-or-nothing, which is why best-of-N exists here.'],
         'columns': sources}, ensure_ascii=False, indent=1), encoding='utf-8')

    tot_l = sum(c['ȣ'] for c in sources.values())
    tot_k = sum(c['ϗ'] for c in sources.values())
    print(f'{len(sources)} columns -> {OUT}')
    print(f'  {tot_l} ȣ, {tot_k} ϗ in the chosen runs')
    print(f'  {spread}/{len(sources)} columns where the runs disagreed on count')
    for lbl in sorted({c['chosen'] for c in sources.values()}):
        n = sum(1 for c in sources.values() if c['chosen'] == lbl)
        print(f'  {n:3d} columns won by {lbl}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
