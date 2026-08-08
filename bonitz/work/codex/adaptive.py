"""
Read columns with Codex, escalating only where the kai-ligature vote collapsed.

Measured 2026-08-07: Codex decides how to read `ϗ` once per column and holds it
for the whole column — recall was 0/5, 7/7, 0/9, 4/4 on gold, never partial —
and the decision varies between samples (030-R gave 0/9, 0/9, 9/9).  Blind
best-of-3 therefore pays for a third read on every column that already got it
right, which on that sample was half of them.

The failure is detectable WITHOUT ground truth: kraken and Opus both read every
column of 53-62 as containing between 2 and 14 `ϗ`, and they agree everywhere
but 057-R (2 vs 3).  A Codex sample reporting ZERO is a lost coin flip, full
stop.  So: one read per column, then one more only where ϗ == 0, up to MAX.

    python3 work/codex/adaptive.py 53-62 [--max 3] [--workers 6] [--dry-run]

Escalation is capped so a column Codex simply cannot read costs a bounded
amount rather than looping.  Columns whose other readers see no ϗ at all are
never escalated — there would be nothing to detect.
"""

from __future__ import annotations
import argparse
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
KAI = 'ϗ'


def expected_kai(pg: int, col: str) -> int:
    """How many ϗ the per-column readers see. Page-level readers can't help."""
    counts = []
    for f in (ROOT / f'work/kraken400/read/txt/page-{pg:03d}-{col}.txt',
              ROOT / f'raw/opus/page-{pg:03d}-{col}.txt'):
        if f.exists():
            counts.append(f.read_text(encoding='utf-8').count(KAI))
    return max(counts) if counts else 0


def samples(pg: int, col: str) -> dict[int, Path]:
    """Existing samples for one column, keyed by run index."""
    out = {}
    for f in HERE.glob(f'page-{pg:03d}-{col}.400.r*.txt'):
        m = re.search(r'\.r(\d+)\.txt$', f.name)
        if m:
            out[int(m.group(1))] = f
    return out


def best_kai(pg: int, col: str) -> int:
    return max((f.read_text(encoding='utf-8').count(KAI)
                for f in samples(pg, col).values()), default=-1)


def run(pg: int, col: str, idx: int) -> str:
    r = subprocess.run([str(HERE / 'resample.sh'), str(pg), col, str(idx)],
                       cwd=ROOT, capture_output=True, text=True)
    return (r.stdout or r.stderr).strip()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('pages', help='page range, e.g. 53-62')
    p.add_argument('--max', type=int, default=3,
                   help='hard cap on samples per column (default 3)')
    p.add_argument('--workers', type=int, default=6)
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args(argv)
    a, _, b = args.pages.partition('-')
    cols = [(pg, c) for pg in range(int(a), int(b or a) + 1) for c in ('L', 'R')]

    for rnd in range(1, args.max + 1):
        todo = []
        for pg, c in cols:
            have = samples(pg, c)
            if len(have) >= args.max:
                continue
            if not have:
                todo.append((pg, c))                       # never read
            elif best_kai(pg, c) == 0 and expected_kai(pg, c) > 0:
                todo.append((pg, c))                       # lost the coin flip
        if not todo:
            print(f'round {rnd}: nothing to do')
            break
        why = 'first read' if rnd == 1 else 'ϗ == 0'
        print(f'round {rnd}: {len(todo)} columns ({why}) — '
              f'{", ".join(f"{p}{c}" for p, c in todo)}')
        if args.dry_run:
            continue
        jobs = [(pg, c, max(samples(pg, c), default=0) + 1) for pg, c in todo]
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            for line in ex.map(lambda j: run(*j), jobs):
                print(f'  {line}')

    print('\nfinal ϗ per column (codex best / expected):')
    lost = 0
    for pg, c in cols:
        got, want = best_kai(pg, c), expected_kai(pg, c)
        bad = got <= 0 < want
        lost += bad
        print(f'  page-{pg:03d}-{c}  {got:3d} / {want:<3d} '
              f'({len(samples(pg, c))} samples){"   LOST" if bad else ""}')
    print(f'{lost}/{len(cols)} columns still reading no ϗ after {args.max} samples')
    return 0


if __name__ == '__main__':
    sys.exit(main())
