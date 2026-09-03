"""The two-engine comparison must separate its three cases correctly.

`agree_wrong` is the ground-truth audit's candidate list: two engines reading
the same ink the same way AGAINST the corpus. A line sorted into the wrong
bucket either hides an audit candidate (agree-wrong counted as clean) or
sends John to the ink for nothing (clean counted as agree-wrong).
"""

from __future__ import annotations

import pytest

from bonitz_pipeline import calamari_score as cs
from bonitz_pipeline.calamari_score import compare, write_tsv

LINES = [
    ('00000', 'page-055-L:l1', 'ἀνάγκη'),   # both right
    ('00001', 'page-055-L:l2', 'ϗ̀ τὸ ἐξ'),  # both wrong, identically
    ('00002', 'page-055-L:l3', 'τȣ͂ ἔτȣς'),  # A right, B wrong
    ('00003', 'page-055-L:l4', 'αἴσθησις'),  # B right, A wrong
    ('00004', 'page-055-L:l5', 'ὁ νȣ͂ς'),    # both wrong, differently
]
A = {'00000': 'ἀνάγκη', '00001': 'ϗ̀ τὸ ἐξ.', '00002': 'τȣ͂ ἔτȣς',
     '00003': 'αἴσθησιζ', '00004': 'ὁ νȣς'}
B = {'00000': 'ἀνάγκη', '00001': 'ϗ̀ τὸ ἐξ.', '00002': 'τȣ ἔτȣς',
     '00003': 'αἴσθησις', '00004': 'ὁ νȣ͂ζ'}


def test_identical_and_wrong_is_an_audit_candidate():
    cmp = compare(LINES, A, B)
    assert cmp['agree_wrong'] == [('page-055-L:l2', 'ϗ̀ τὸ ἐξ', 'ϗ̀ τὸ ἐξ.')]


def test_identical_and_right_is_not():
    cmp = compare(LINES, A, B)
    assert cmp['both'] == 2
    assert cmp['agree_right'] == 1


def test_disagreements_carry_who_was_right():
    cmp = compare(LINES, A, B)
    verdicts = {site: w for site, w, _, _, _ in cmp['rows']}
    assert verdicts == {'page-055-L:l3': 'A', 'page-055-L:l4': 'B',
                        'page-055-L:l5': '—'}


def test_the_three_buckets_partition_the_lines():
    cmp = compare(LINES, A, B)
    assert cmp['both'] + len(cmp['rows']) == len(LINES)
    assert cmp['agree_right'] + len(cmp['agree_wrong']) == cmp['both']


def test_an_empty_result_still_writes_a_header(tmp_path):
    """A header-only file says 'ran, found none'; a missing file cannot be
    told from a run that never looked."""
    p = tmp_path / 'agree-wrong.tsv'
    write_tsv(p, ['site', 'ground_truth', 'both_engines'], [])
    assert p.read_text(encoding='utf-8') == 'site\tground_truth\tboth_engines\n'


def test_tabs_inside_a_reading_cannot_break_the_tsv(tmp_path):
    p = tmp_path / 'rows.tsv'
    write_tsv(p, ['site', 'gt'], [('s1', 'a\tb')])
    line = p.read_text(encoding='utf-8').splitlines()[1]
    assert line.split('\t') == ['s1', 'a b']


def test_main_writes_both_files(tmp_path, monkeypatch):
    """Grok: the agree-wrong dump was only ever tested as a function —
    deleting its three lines in main() left the suite green. This drives
    main() and asserts both TSVs land."""
    from bonitz_pipeline import calamari_score as cs
    by_site = {site: B[idx] for idx, site, _ in LINES}
    monkeypatch.setattr(cs, 'holdout_lines', lambda work: LINES)
    monkeypatch.setattr(cs, 'read_predictions', lambda path, want: A)
    monkeypatch.setattr(cs, 'kraken_predictions',
                        lambda evaldir, work: by_site)
    pred = tmp_path / 'preds.tsv'
    pred.write_text('')
    assert cs.main(['--work', str(tmp_path), '--pred', str(pred),
                    '--against', str(tmp_path)]) == 0
    vs = tmp_path / 'preds-vs-kraken.tsv'
    aw = tmp_path / 'preds-vs-kraken-agree-wrong.tsv'
    assert len(vs.read_text().splitlines()) == 1 + 3   # header + disagreements
    assert len(aw.read_text().splitlines()) == 1 + 1   # header + agree-wrong


def test_a_decomposed_kraken_reading_still_counts_as_agreement(tmp_path):
    """An NFD respelling of the same ink is the same reading."""
    import unicodedata
    from xml.etree import ElementTree as ET
    from bonitz_pipeline.calamari_score import kraken_predictions
    ns = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'
    nfd = unicodedata.normalize('NFD', 'ἀφῆς')
    (tmp_path / 'holdout.txt').write_text('page-055-L\n')
    (tmp_path / 'page-055-L.pred.xml').write_text(
        f'<?xml version="1.0"?><PcGts xmlns="{ns}"><Page>'
        f'<TextLine id="l1"><TextEquiv><Unicode>{nfd}</Unicode></TextEquiv>'
        f'</TextLine></Page></PcGts>', encoding='utf-8')
    out = kraken_predictions(tmp_path, tmp_path)
    assert out['page-055-L:l1'] == 'ἀφῆς'
    assert out['page-055-L:l1'] != nfd


# --- the five-fold vote -------------------------------------------------------

def test_a_unanimous_ensemble_returns_the_reading_and_says_so():
    folds = [{'0': 'ἀγαθόν', '1': 'Ρα7.'}] * 5
    voted, stats = cs.vote(folds)
    assert voted == {'0': 'ἀγαθόν', '1': 'Ρα7.'}
    assert stats['unanimous'] == 2 and stats['tie'] == 0
    assert stats['folds'] == 5


def test_a_majority_carries_the_line():
    folds = [{'0': 'ἀγαθόν'}, {'0': 'ἀγαθόν'}, {'0': 'ἀγαθόν'},
             {'0': 'ἀγαθὸν'}, {'0': 'ἀγαθων'}]
    voted, stats = cs.vote(folds)
    assert voted['0'] == 'ἀγαθόν'
    assert stats['majority'] == 1 and stats['unanimous'] == 0


def test_a_tie_takes_the_reading_nearest_the_middle_and_is_counted():
    """⚠ A 2-2-1 SPLIT IS WHAT FIVE FOLDS PRODUCE, and a vote that quietly
    coin-flips there reports a confidence it has not got. The rule: prefer
    the candidate that disagrees least with the whole set."""
    folds = [{'0': 'ἀγαθόν'}, {'0': 'ἀγαθόν'},
             {'0': 'xxxxxx'}, {'0': 'xxxxxx'},
             {'0': 'ἀγαθὸν'}]
    voted, stats = cs.vote(folds)
    assert stats['tie'] == 1
    # `ἀγαθόν` is one character from the fifth fold's reading; `xxxxxx` is
    # six from it. The nearer candidate takes the line.
    assert voted['0'] == 'ἀγαθόν'


def test_the_tie_break_is_deterministic():
    folds = [{'0': 'aa'}, {'0': 'bb'}]
    first, _ = cs.vote(folds)
    second, _ = cs.vote(list(reversed(folds)))
    assert first == second


def test_folds_that_cover_different_lines_are_refused():
    """The vote must be taken over one holdout, or it is taken over two
    different books."""
    with pytest.raises(cs.ScoreError):
        cs.vote([{'0': 'a', '1': 'b'}, {'0': 'a'}])


def test_an_ensemble_of_nothing_is_refused():
    with pytest.raises(cs.ScoreError):
        cs.vote([])


def test_a_single_fold_votes_to_itself():
    """The degenerate case must not be a special case: one fold is its own
    ensemble, and every line is unanimous."""
    voted, stats = cs.vote([{'0': 'ἀγαθόν'}])
    assert voted == {'0': 'ἀγαθόν'} and stats['unanimous'] == 1


def test_the_cli_refuses_both_a_single_run_and_an_ensemble(tmp_path):
    """⚠ main()'s WIRING WAS UNTESTED — Grok's finding 10. `--pred` and
    `--fold` name two different questions, and answering both at once would
    score one and report the other's label."""
    with pytest.raises(cs.ScoreError):
        cs.main(['--work', str(tmp_path), '--pred', 'a.tsv',
                 '--fold', 'b.tsv'])
    with pytest.raises(cs.ScoreError):
        cs.main(['--work', str(tmp_path)])
