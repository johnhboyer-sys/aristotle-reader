"""Bonitz's quotation should appear where he says it does.

Two calibration facts this pins down, both learned the hard way:

Exact matching is not enough. Bonitz cites lemma forms (ἀμαυρός, ἀχλυώδης)
where the text has them inflected (ἀμαυρότερον, ἀχλυώδη), so the CORRECT
citation μβ8. 367a21 scored 0.00 against a line that plainly contains
ἀμαυρότερον. Stem matching fixes it.

And the double-recension columns must stay excluded: Bonitz used Bekker, our
corpus follows a critical text, and where they diverge a mismatch measures the
edition rather than the transcription.
"""

import pytest

from bonitz_pipeline.quotecheck import load_corpus, scan


@pytest.fixture(scope='module')
def index():
    return load_corpus()


def test_a_correct_citation_with_lemma_forms_scores(index):
    """μβ8. 367a21 — ἀμαυρός/ἀχλυώδης against ἀμαυρότερον/ἀχλυώδη."""
    hits = [r for r in scan(49, 'R', index)
            if 'skipped' not in r and r['cite'].endswith('367a21')]
    assert hits, 'the ἀμαυρός citation should be checkable'
    assert hits[0]['overlap'] > 0.0, 'lemma vs inflected form must still match'


def test_verbatim_quotations_score_high(index):
    # Latin-commentary spans come back marked 'skipped' and carry no
    # 'overlap' on purpose — judged rows only here.
    best = max((r for r in scan(51, 'R', index) if 'skipped' not in r),
               key=lambda r: r['overlap'])
    assert best['overlap'] >= 0.9


def test_double_recension_columns_are_excluded(index):
    _, excluded = index
    # Physics VII is the reason this exclusion exists
    assert '243a' in excluded and '241b' in excluded


def test_signal_is_strong_across_the_reviewed_pages(index):
    """If this drops, the checker or the corpus has regressed."""
    rows = [r for p in range(15, 52) for c in ('L', 'R') for r in scan(p, c, index)
            if 'skipped' not in r]
    assert len(rows) > 1000
    strong = sum(1 for r in rows if r['overlap'] >= 0.5) / len(rows)
    zero = sum(1 for r in rows if r['overlap'] == 0) / len(rows)
    assert strong > 0.80, f'only {strong:.0%} of citations match their line'
    assert zero < 0.07, f'{zero:.1%} score zero'
