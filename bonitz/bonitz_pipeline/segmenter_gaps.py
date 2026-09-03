"""A line the segmenter never found, recorded so the corpus can carry it.

    python3 -m bonitz_pipeline.segmenter_gaps --check 118-281
    python3 -m bonitz_pipeline.segmenter_gaps --apply page-215-L <in.txt >out.txt

⚠ THE GAP GOES IN THE CORPUS AND NEVER IN THE READER. A reader's file is
TESTIMONY — what that engine saw. Typing a line into `txt118-281/page-215-L.txt`
would make kraken appear to have read something it did not, and the panel would
count a vote that does not exist; the two LlamaParse variants already
manufactured a majority out of one opinion once. The corpus is the EDITED TEXT:
what Bonitz printed. A line he printed belongs there whoever noticed it, so long
as the record says who.

⚠ AN UNAPPLIED NOTE IS WORTHLESS. `--check` is the point of this module: a
column with an open gap must not pass into the corpus quietly at one line
short, because a short column shifts every position after it against every
other reader and nothing downstream says so.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAPS = ROOT / 'work' / 'segmenter-gaps'


def gaps_for(stem: str, root: Path = GAPS) -> list[dict]:
    """Recorded gaps for one column, ordered by the line they precede."""
    f = root / f'{stem}.json'
    if not f.exists():
        return []
    d = json.loads(f.read_text(encoding='utf-8'))
    return sorted(d.get('gaps', []), key=lambda g: g['before_line'])


def apply_gaps(stem: str, lines: list[str], root: Path = GAPS) -> list[str]:
    """Insert every recorded gap into a column's lines.

    ⚠ `before_line` IS A POSITION IN THE FINISHED COLUMN, NOT IN THE SHORT ONE.
    It is the line number the text will have once the gap is filled — 60 of 61
    on page-215-L — so the inserts run TOP DOWN: each one puts the list back in
    final numbering before the next index is used. Going bottom-up looks like
    the safe direction and is wrong here; with gaps before lines 2 and 5 it
    lands the second one past the end.
    """
    out = list(lines)
    for g in gaps_for(stem, root):
        i = g['before_line'] - 1
        if not 0 <= i <= len(out):
            raise ValueError(
                f'{stem}: gap recorded before line {g["before_line"]} but the '
                f'column has {len(out)} lines — the record and the text have '
                f'drifted apart')
        out.insert(i, g['text'])
    return out


def check(stems: list[str], txt_dir: Path, target: int = 61,
          root: Path = GAPS) -> list[str]:
    """Columns short of target with no gap recorded to explain it."""
    unexplained = []
    for stem in stems:
        f = txt_dir / f'{stem}.txt'
        if not f.exists():
            continue
        n = len(f.read_text(encoding='utf-8').splitlines())
        if n >= target:
            continue
        f = root / f'{stem}.json'
        rec = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
        # ⚠ SHORT AND CORRECT IS A THING. Four pages of 118-281 open a letter
        # section: the display capital stands in a band with no body text in
        # EITHER column, and 134 is simply a 60-line page — its last line
        # carries the marginal 60 with blank paper below. Without a way to say
        # so, the check cries wolf on ten columns forever and the eleventh
        # stops being visible.
        if rec.get('short_by_design') == n:
            continue
        if len(gaps_for(stem, root)) < target - n:
            unexplained.append(f'{stem}: {n} lines, {target - n} short, '
                               f'{len(gaps_for(stem, root))} recorded')
    return unexplained


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', metavar='STEM',
                    help='read a column on stdin, write it with its gaps in')
    ap.add_argument('--check', metavar='FIRST-LAST',
                    help='name every short column with no gap to explain it')
    ap.add_argument('--txt-dir', type=Path)
    ap.add_argument('--target', type=int, default=61)
    a = ap.parse_args(argv)
    if a.apply:
        lines = sys.stdin.read().splitlines()
        out = apply_gaps(a.apply, lines)
        sys.stdout.write('\n'.join(out) + ('\n' if out else ''))
        print(f'{a.apply}: {len(lines)} -> {len(out)} lines', file=sys.stderr)
        return 0
    if a.check:
        lo, _, hi = a.check.partition('-')
        stems = [f'page-{n:03d}-{c}'
                 for n in range(int(lo), int(hi or lo) + 1) for c in 'LR']
        bad = check(stems, a.txt_dir or Path('.'), a.target)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        print(f'{len(bad)} column(s) short with nothing recorded')
        return 1 if bad else 0
    ap.error('one of --apply or --check')


if __name__ == '__main__':
    raise SystemExit(main())
