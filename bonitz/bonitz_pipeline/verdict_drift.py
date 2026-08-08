"""
Has a later edit undone a ruling nobody was watching?

`work/adjudicated/` holds 1,663 verdicts over 84 columns, each recording the
context it was ruled in.  `reconcile.py` applies them once, at build time, and
after that nothing looks at them again — so any later pass over
`work/reconciled/` (a sweep correction, a family fix, a breathing fix) can
quietly overwrite a place a human already decided, and the only trace is that
the adjudicated context no longer exists in the text.

That already happened.  `tests/fixtures/john-rulings.json` records 44 hand
rulings and its test caught two — `ἀλίσκεται` and `ἀλίζειν` on 044-R, both
ruled KEPT and both since given a rough breathing.  Those 44 are tested.  The
1,663 are not, and they are 38× the sample.

The check is deliberately crude: an adjudicated `ctx` is canonical text, so it
should still be findable in the canonical column.  If it is not, something
moved underneath the ruling.  That is a signal to look, not a verdict — a
legitimate correction elsewhere on the line shifts the window too — so the
output is ranked by whether the RULED READING survived, which is the part that
actually matters.

    python3 -m bonitz_pipeline.verdict_drift
    python3 -m bonitz_pipeline.verdict_drift --show 40
"""

from __future__ import annotations
import argparse
import glob
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from .normalize import canonical, clean_opus, fold

ROOT = Path(__file__).resolve().parent.parent


def column_text(stem: str) -> str | None:
    f = ROOT / 'work/reconciled' / f'{stem}.txt'
    if not f.exists():
        return None
    return canonical(clean_opus(f.read_text(encoding='utf-8')))[0]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--show', type=int, default=25)
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/verdict-drift.tsv')
    args = p.parse_args(argv)

    files = sorted(glob.glob(str(ROOT / 'work/adjudicated/*.json')))
    if not files:
        sys.exit('no adjudicated verdicts found')

    rows, tally = [], Counter()
    for f in files:
        stem = Path(f).stem
        text = column_text(stem)
        if text is None:
            tally['column missing'] += 1
            continue
        for r in json.load(open(f, encoding='utf-8')):
            # Both sides must go through `canonical`, or the two encodings of
            # the printed circumflex — combining tilde against perispomeni —
            # report every ligature ruling as lost.  Same fold the comparator
            # uses, so this compares like with like.
            ctx = canonical(r.get('ctx') or '')[0]
            verdict = canonical(str(r.get('verdict') or ''))[0]
            if not ctx:
                tally['no context recorded'] += 1
                continue
            tally['checked'] += 1
            if ctx in text:
                tally['intact'] += 1
                continue
            # The window moved.  The question that matters is whether the
            # RULED reading is still there; a correction elsewhere on the
            # line moves the window without touching the decision.
            if not verdict:
                # A DELETION ruling — "no extra γ", "no clear comma", "opus
                # doubled".  There is no string to look for, so substring
                # search cannot speak to it; it needs an absence check against
                # the reading that was rejected, which these files do not
                # record.  Counted, not guessed at.
                tally['deletion ruling — not checkable this way'] += 1
                continue
            if verdict in text:
                tally['context moved, ruling intact'] += 1
                continue
            # Most of these verdicts rule the LIGATURE IDENTITY — the notes say
            # "ϗ raw", "kai-ligature ϗ" — and record it without its grave. The
            # corpus writes `ϗ̀`, which honours the ruling. Comparing exactly
            # calls that a loss; folding asks the question John was answering.
            if verdict and fold(verdict) in fold(text):
                tally['ruling honoured, marks differ'] += 1
                continue
            tally['RULING LOST'] += 1
            rows.append((stem, 'RULING LOST', verdict, ctx[:60],
                         (r.get('note') or '')[:70]))

    rows.sort(key=lambda r: (r[1] != 'RULING LOST', r[0]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w', encoding='utf-8') as fh:
        fh.write('column\tstatus\tverdict\tcontext\tnote\n')
        for r in rows:
            fh.write('\t'.join(r) + '\n')

    for k, v in tally.most_common():
        print(f'  {v:5d}  {k}')
    print(f'\n-> {args.out}')
    lost = [r for r in rows if r[1] == 'RULING LOST']
    if lost:
        print(f'\n{len(lost)} rulings whose decided reading is no longer in '
              f'the column:')
        for r in lost[:args.show]:
            print(f'  {r[0]}  verdict={r[2]!r}')
            print(f'      {r[4]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
