"""Calamari's out-of-fold read, turned into audit candidates.

The hazard this file guards is not OCR quality. It is that the arrow rows
carry `im`, `language` and `text` and NOTHING ELSE — no page, no line number.
Position in the export is the only link from a prediction back to the corpus,
so a reordering nobody noticed would file every line's reading against its
neighbour, and every card downstream would ask about the wrong ink.
"""

import pytest

from bonitz_pipeline import oof_ingest as oi
from bonitz_pipeline.calamari_score import ScoreError


def test_read_indexed_refuses_a_missing_index(tmp_path):
    """⚠ NOT 'SKIP THE GAP'. If index 2 is absent the file may be short by
    one, or it may be misnumbered from there on — and the second silently
    scores every later line against its neighbour."""
    p = tmp_path / 'p.tsv'
    p.write_text('0\ta\n1\tb\n3\td\n', encoding='utf-8')
    with pytest.raises(ScoreError) as e:
        oi.read_indexed(p, 4)
    assert '[2]' in str(e.value)


def test_read_indexed_refuses_a_duplicate_index(tmp_path):
    p = tmp_path / 'p.tsv'
    p.write_text('0\ta\n0\tb\n', encoding='utf-8')
    with pytest.raises(ScoreError):
        oi.read_indexed(p, 1)


def test_read_indexed_refuses_a_line_with_no_tab(tmp_path):
    p = tmp_path / 'p.tsv'
    p.write_text('0\ta\n1 no tab here\n', encoding='utf-8')
    with pytest.raises(ScoreError):
        oi.read_indexed(p, 2)


def test_read_indexed_keeps_an_empty_prediction(tmp_path):
    """An engine that read nothing is a fact, not a gap. Index 1468 of this
    run is empty; dropping it would renumber everything after it."""
    p = tmp_path / 'p.tsv'
    p.write_text('0\ta\n1\t\n', encoding='utf-8')
    assert oi.read_indexed(p, 2) == ['a', '']


def test_the_export_index_is_proved_against_the_arrow():
    """The live join on the real corpus: the arrow text must equal the gt XML
    text at every position, or `train_lines` raises.

    ⚠ COMPUTED, NOT PINNED. This asserted `len(lines) == 4693` and went red the
    moment the corpus moved — first when John's rulings changed 66 lines, then
    again when the `surplus` fix of 2026-08-19 made page-033-R pairable and the
    count became 4741. Neither was a regression, and for four days the red test
    read as one while the REAL defect it was pointing at — a stale arrow that
    also blocked calamari_export — went unaddressed behind it.

    The count is scaffolding. What is under test is that the join holds and
    that every row is a well-formed site, so the count comes from the arrow
    itself.
    """
    pytest.importorskip('pyarrow')
    if not (oi.WORK / 'train.arrow').exists():
        pytest.skip('train.arrow is not on disk')
    lines = oi.train_lines()          # raises if arrow and gt XML disagree
    import bonitz_pipeline.kraken_corpus as kc
    assert len(lines) == len(kc.arrow_texts(oi.WORK / 'train.arrow'))
    assert lines, 'the join produced nothing'
    assert all(':' in site for site, _ in lines)
    assert all(text.strip() for _, text in lines)


def test_only_the_two_earned_tiers_are_emitted(monkeypatch, tmp_path):
    """⚠ THE 1,188 OOF-ONLY LINES ARE NOT A QUEUE. One fold runs at a few
    percent CER, so most of those are the model being wrong, and spending
    John's attention on engine noise is worse than showing him nothing. The
    count is PRINTED, never dropped in silence."""
    monkeypatch.setattr(oi, 'train_lines',
                        lambda work=None: [('page-900-L:a', 'alpha'),
                                           ('page-900-L:b', 'beta'),
                                           ('page-900-L:c', 'gamma')])
    (tmp_path / 'train-oof.tsv').write_text(
        '0\talpha\n1\tBETA\n2\tGAMMA\n', encoding='utf-8')
    (tmp_path / 'train-vote.tsv').write_text(
        '0\tALPHA\n1\tbeta\n2\tgamma\n', encoding='utf-8')
    monkeypatch.setattr(oi.review, '_tsv', lambda *a, **k: [
        {'column': 'page-900-L', 'line_id': 'b', 'model': 'BETA'}])
    monkeypatch.setattr(oi, '_live', lambda site, gt: True)
    rows, n = oi.candidates(oof_dir=tmp_path)
    assert [(r['site'], r['tier']) for r in rows] == [
        ('page-900-L:a', 'vote'),      # the vote refuses a line it memorised
        ('page-900-L:b', 'both')]      # oof and kraken, independently
    assert n['oof_only'] == 1          # gamma: only the fold model disputes it
    assert n['both'] == 1 and n['vote'] == 1


def test_a_line_john_has_already_corrected_is_not_re_asked(monkeypatch,
                                                           tmp_path):
    """[[carry-rulings-by-site]]: a settled site re-opened under a new card
    is how a ruling gets re-litigated by a machine that did not know."""
    monkeypatch.setattr(oi, 'train_lines',
                        lambda work=None: [('page-900-L:a', 'alpha')])
    (tmp_path / 'train-oof.tsv').write_text('0\tALPHA\n', encoding='utf-8')
    (tmp_path / 'train-vote.tsv').write_text('0\tALPHA\n', encoding='utf-8')
    monkeypatch.setattr(oi.review, '_tsv', lambda *a, **k: [])
    monkeypatch.setattr(oi, '_live', lambda site, gt: False)
    rows, n = oi.candidates(oof_dir=tmp_path)
    assert rows == [] and n['settled'] == 1
