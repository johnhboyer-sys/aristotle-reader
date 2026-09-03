"""Calamari's out-of-fold read of the training set, as audit candidates.

    python3 -m bonitz_pipeline.oof_ingest            # report
    python3 -m bonitz_pipeline.oof_ingest --write

Calamari had read 722 of the corpus's 5,832 lines — the holdout — so 88% of
the text had exactly one machine reader. The five folds are a proper
cross-validation (each fold's val split is disjoint from every other's), so
for every one of the 4,693 training lines there is exactly one model that
never saw it. Predicting each line with that model gives an honest second
read over the whole training set: no holdout spent, nothing selected.

⚠ THE VOTE IS NOT THAT READ, AND ITS DISAGREEMENTS MEAN SOMETHING ELSE. On a
training line four of the five voters were fitted to reproduce that exact
ground truth, so the vote agreeing with the corpus is memory rather than
evidence — it disagrees on 8 lines out of 4,693. But that is precisely what
makes those 8 the sharpest signal in the project: a model TRAINED on the line
still will not reproduce it. Four of the 8 turned out to be sites John had
already corrected by hand, which is the hit rate that says the rest are worth
his time.

Two tiers are emitted, and nothing else:

    vote   the five-model vote refuses the line despite having memorised it
    both   calamari's out-of-fold read AND kraken e26 disagree with the
           corpus at the same line, neither having seen the other's answer

The 1,188 lines only the out-of-fold model disputes are NOT emitted. A single
fold runs at a few percent CER, so most of those are the model being wrong,
and a queue that spends John's attention on engine noise is worse than no
queue. The count is printed rather than dropped in silence.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from bonitz_pipeline import audit_apply as aa
from bonitz_pipeline import audit_review as review
from bonitz_pipeline.calamari_score import ScoreError, _arrow_texts, read_lines
from bonitz_pipeline.gt_audit import SEVERITY, classify
from bonitz_pipeline.kraken_eval import align

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work' / 'kraken400'
OOF = ROOT / 'work' / 'calamari' / 'oof'
OUT = ROOT / 'work' / 'calamari' / 'oof-vs-corpus.tsv'
HEAD = ['site', 'tier', 'ground_truth', 'oof', 'kraken', 'vote']


def train_lines(work: Path = WORK) -> list[tuple[str, str]]:
    """[(`column:line id`, ground truth)] in EXPORT ORDER.

    Rebuilt from the gt XML in `train.txt` order — the order `stage_compile`
    passed to ketos — and then proved against the arrow the export was dumped
    from.

    ⚠ PROVING IT IS THE WHOLE JOB. The arrow rows carry `im`, `language` and
    `text`: no page, no line number. Position in the export is the ONLY link
    from a prediction back to the corpus, so an unnoticed reordering would
    file every line's reading against its neighbour and nothing downstream
    could tell. Same guard as `calamari_score.holdout_lines`, same reason.
    """
    cols = (work / 'train.txt').read_text(encoding='utf-8').split()
    out = []
    for col in cols:
        for lid, text in read_lines(work / 'gt' / f'{col}.xml'):
            out.append((f'{col}:{lid}', text))
    arrow = _arrow_texts(work / 'train.arrow')
    if len(arrow) != len(out):
        raise ScoreError(f'train.arrow holds {len(arrow)} lines, the gt XML '
                         f'of {len(cols)} columns holds {len(out)}')
    bad = [(i, a, b) for i, ((_, b), a) in enumerate(zip(out, arrow))
           if a != b]
    if bad:
        i, a, b = bad[0]
        raise ScoreError(
            f'{len(bad)} line(s) differ between train.arrow and the gt XML — '
            f'the export index does not address the ground truth. First at '
            f'{i}: arrow {a[:40]!r} vs xml {b[:40]!r}')
    return out


def read_indexed(path: Path, n: int) -> list[str]:
    """`<index>\\ttext`, in index order, with every index 0..n-1 present."""
    have: dict[int, str] = {}
    for lineno, line in enumerate(
            path.read_text(encoding='utf-8').splitlines(), 1):
        idx, tab, text = line.partition('\t')
        if not tab or not idx.isdigit():
            raise ScoreError(f'{path}:{lineno}: no index before a tab')
        if int(idx) in have:
            raise ScoreError(f'{path}:{lineno}: index {idx} appears twice')
        have[int(idx)] = text
    missing = sorted(set(range(n)) - set(have))
    if missing:
        raise ScoreError(f'{path}: {len(missing)} of {n} indices are missing, '
                         f'first {missing[:5]} — the predictions do not cover '
                         f'the export and the rest cannot be trusted to line '
                         f'up')
    if len(have) > n:
        raise ScoreError(f'{path} holds {len(have)} predictions for an export '
                         f'of {n} lines')
    return [have[i] for i in range(n)]


def _live(site: str, gt: str) -> bool:
    """Is this still a question? A site John has already corrected reads
    something else now, and re-asking it is how a settled ruling gets
    re-litigated under a new card ([[carry-rulings-by-site]])."""
    col = site.split(':', 1)[0]
    try:
        aa.locate(col, gt)
        return True
    except aa.ApplyError:
        return False


def candidates(work: Path = WORK, oof_dir: Path = OOF) -> tuple[list[dict],
                                                                dict]:
    """(rows, counts). Counts are returned so the caller can PRINT what was
    left out — a queue that quietly shows less than it found is the defect
    this project keeps re-fixing ([[absence-rendered-as-clean]])."""
    lines = train_lines(work)
    oof = read_indexed(oof_dir / 'train-oof.tsv', len(lines))
    vote = read_indexed(oof_dir / 'train-vote.tsv', len(lines))
    kraken = {f'{r["column"]}:{r["line_id"]}': r['model']
              for r in review._tsv(review.TRAIN_TSV)}

    rows, n = [], {'oof_only': 0, 'settled': 0, 'vote': 0, 'both': 0}
    for i, (site, gt) in enumerate(lines):
        k = kraken.get(site)
        tier = ('vote' if vote[i] != gt else
                'both' if oof[i] != gt and k is not None and k != gt else
                None)
        if tier is None:
            n['oof_only'] += oof[i] != gt
            continue
        if not _live(site, gt):
            n['settled'] += 1
            continue
        n[tier] += 1
        rows.append({'site': site, 'tier': tier, 'ground_truth': gt,
                     'oof': oof[i] if oof[i] != gt else '',
                     'kraken': k if k and k != gt else '',
                     'vote': vote[i] if vote[i] != gt else ''})
    return rows, n


def write(rows: list[dict], out: Path = OUT) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    body = '\n'.join('\t'.join(r[h] for h in HEAD) for r in rows)
    out.write_text('\t'.join(HEAD) + '\n' + body + '\n', encoding='utf-8')
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--write', action='store_true')
    a = p.parse_args(argv)

    rows, n = candidates()
    print(f'{n["vote"]:5d}  tier `vote`  — the five-model vote refuses the '
          f'line it was trained on')
    print(f'{n["both"]:5d}  tier `both`  — calamari out-of-fold AND kraken '
          f'e26, independently')
    print(f'{n["settled"]:5d}  skipped: John has already corrected the line')
    print(f'{n["oof_only"]:5d}  NOT emitted: only the out-of-fold model '
          f'disputes these, and one fold at a few percent CER is mostly '
          f'wrong about them')
    if not a.write:
        print(f'\nDRY RUN — re-run with --write to put {len(rows)} rows in '
              f'{OUT.relative_to(ROOT)}')
        return 0
    print(f'\n{write(rows)} rows -> {OUT.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
