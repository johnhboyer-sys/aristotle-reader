"""The two-engine CER, recomputed from the files in the repo.

⚠ THE POINT IS THAT IT DOES NOT NEED A GPU, A MODEL, OR A SCAN. `work/kraken/
NOTES.md` publishes kraken round 6 at 0.3303% against calamari round 2 at
0.4582%, and until 2026-08-26 the only thing behind either number was a
directory of predictions on one laptop. Three tracked text files now stand
behind them, and this test is what keeps the files honest — edit one and the
published figure moves, loudly.
"""

import re
from pathlib import Path

import pytest

from bonitz_pipeline.kraken_eval import align

W = Path(__file__).resolve().parent.parent / 'work'
HOLDOUT = W / 'kraken15-102'


def _tsv(path: Path, cols: int) -> list[str]:
    lines = path.read_text(encoding='utf-8').splitlines()
    return [l.split('\t', cols - 1)[cols - 1] for l in lines]


@pytest.fixture(scope='module')
def gt() -> list[str]:
    return _tsv(HOLDOUT / 'holdout-gt.tsv', 3)


def cer(gt: list[str], pred: list[str]) -> tuple[float, int, int]:
    """(CER, edits, whitespace-only edits) — kraken_eval's own arithmetic."""
    assert len(pred) == len(gt), f'{len(pred)} predicted lines against {len(gt)}'
    edits = chars = space = 0
    for g, h in zip(gt, pred):
        for x, y in align(g, h):
            if x != y:
                edits += 1
                if (x or ' ').isspace() and (y or ' ').isspace():
                    space += 1
        chars += len(g)
    return edits / chars, edits, space


def test_the_holdout_is_the_twelve_columns_everything_else_scores(gt):
    cols = (HOLDOUT / 'holdout.txt').read_text().split()
    assert len(cols) == 12
    named = {l.split('\t')[0] for l in
             (HOLDOUT / 'holdout-gt.tsv').read_text(encoding='utf-8').splitlines()}
    assert named == set(cols)
    assert len(gt) == 722
    assert sum(len(t) for t in gt) == 37538


def test_kraken_round6_epoch11_scores_what_the_notes_publish(gt):
    rate, edits, space = cer(gt, _tsv(HOLDOUT / 'e11-holdout-pred.tsv', 3))
    assert f'{rate:.4%}' == '0.3303%'
    assert (edits, space) == (124, 25)
    assert f'{(edits - space) / sum(len(t) for t in gt):.4%}' == '0.2637%'


def test_calamari_round2_scores_what_the_notes_publish(gt):
    rate, edits, space = cer(
        gt, _tsv(W / 'calamari' / 'ens15102-holdout-pred.tsv', 2))
    assert f'{rate:.4%}' == '0.4582%'
    assert (edits, space) == (172, 33)
    assert f'{(edits - space) / sum(len(t) for t in gt):.4%}' == '0.3703%'


def test_both_engines_were_scored_on_the_same_lines(gt):
    # ⚠ The whole reason these numbers can be compared at all. kraken's
    # published 0.3769% was measured on pages 63+ and calamari's on this
    # holdout, and for a month they were quoted side by side anyway.
    assert len(_tsv(HOLDOUT / 'e11-holdout-pred.tsv', 3)) == len(gt)
    assert len(_tsv(W / 'calamari' / 'ens15102-holdout-pred.tsv', 2)) == len(gt)


def test_the_ground_truth_is_the_trained_text_and_not_the_diplomatic_corpus(gt):
    """⚠ READ THIS BEFORE SCORING ANY MODEL AGAINST `work/reconciled`.

    `kraken_corpus.BEKKER_SPACE` closes `1130 a3` up to `1130a3` on the way
    into training, on John's ruling of 2026-08-06 — so both engines LEARNED
    the closed form, and every one of the 861 citations on this holdout is
    glued in the ground truth. `work/reconciled` still spaces 422 of the same
    861. Score against it and the CER roughly quadruples on a difference that
    is editorial policy, not a misread.
    """
    blob = '\n'.join(gt)
    assert len(re.findall(r'(\d)[ \t]+([ab]\d)', blob)) == 0
    assert len(re.findall(r'(\d)([ab]\d)', blob)) == 861

    cols = (HOLDOUT / 'holdout.txt').read_text().split()
    rec = '\n'.join((W / 'reconciled' / f'{c}.txt').read_text(encoding='utf-8')
                    for c in cols)
    assert len(re.findall(r'(\d)[ \t]+([ab]\d)', rec)) == 422
