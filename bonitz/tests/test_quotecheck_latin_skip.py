"""Latin commentary is Bonitz talking, not Aristotle quoted.

The function-word gate tests the whole span, so a span whose tail is Bonitz's
own Latin (`sed Anaxagorea verba paullum ab …`) slipped through and scored
zero against Greek it never claimed to quote. On pages 53-62 that manufactured
5 of the 10 zero-overlap findings.

The first fix — skip any tail at least half Latin — was itself over-broad, as
cross-model review proved: 20 of the 27 spans it skipped on 15-52 match their
cited line at 0.5 or better on their Greek words alone. `τὸ ἀνάλογον ἐναλλάξ
(de proportionibus convertendis)` matches perfectly and was coming back
unjudged. So a Latin-dominated tail is judged on its GREEK words, flagged
`greek_only`; only a span with fewer than MIN_GREEK Greek words is skipped.

Every state is reported: a span the gate declines to judge comes back marked,
never silently absent. Three states: judged, judged-on-Greek-alone,
did-not-judge.
"""

import subprocess
import sys

import pytest

from bonitz_pipeline import dashboard
from bonitz_pipeline.quotecheck import (
    is_greek, latin_dominated, load_corpus, scan)


@pytest.fixture(scope='module')
def index():
    return load_corpus()


def rows(index, pages=range(53, 63)):
    return [(p, c, r) for p in pages for c in ('L', 'R')
            for r in scan(p, c, index)]


def by_cite(index, pages=range(53, 63)):
    return {(p, c, r['column'], r['bekker_line']): r
            for p, c, r in rows(index, pages)}


def test_pure_latin_spans_are_skipped_and_counted(index):
    """The 3 pure-Latin spans on 53-62 that used to fire as zero-overlap
    findings must come back marked, present, and countable."""
    skipped = {k for k, r in by_cite(index).items()
               if r.get('skipped') == 'latin'}
    for who in [(53, 'L', '414b', 18),   # usus formulae deest tamen veluti
                (53, 'L', '30b', 14),    # aliquot codd habent sine
                (53, 'R', '1283b', 15)]:  # aliquoties deest apud optativum
        assert who in skipped, f'{who} must be skipped as Latin, not judged'
    # Counted, not just present: the records are in scan's output, so a
    # caller summing skips gets the real number.
    assert len(skipped) >= 3


def test_skipped_records_carry_no_overlap(index):
    """No fake number for a judgement never made. A consumer that forgets to
    check 'skipped' must get a KeyError, not a score."""
    for _p, _c, r in rows(index):
        if r.get('skipped'):
            assert 'overlap' not in r, r


def test_cli_reports_skips_out_loud():
    """The printed report must say it declined to judge, and how often —
    a check that answers "nothing" without saying it never looked is the
    defect this project keeps re-fixing."""
    r = subprocess.run(
        [sys.executable, '-m', 'bonitz_pipeline.quotecheck', '--pages', '53'],
        cwd=dashboard.ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-300:]
    assert 'skipped: latin' in r.stdout, r.stdout
    assert 'Latin-commentary spans skipped' in r.stdout, r.stdout


def test_interleaved_apparatus_does_not_dominate(index):
    """Bonitz threads `dist`, `sive`, `veluti` through genuine Greek
    constantly. A Greek-majority quote is judged whole, on all its words."""
    assert not latin_dominated(
        ['βελτιστον', 'dist', 'αναγκαιον', 'ιδιον', 'λογον', 'ουσιας'])
    assert not latin_dominated(
        ['αναγκαια', 'χρησιμα', 'sive', 'καλα', 'ενεκεν'])
    assert latin_dominated(['verso', 'αιτιου', 'αιτιατου', 'ordine'])
    assert latin_dominated(['aliquot', 'codd', 'habent', 'sine'])
    # And a judged Greek-majority record keeps every word in its denominator.
    r = by_cite(index)[(54, 'R', '685a', 18)]
    assert not r['greek_only'] and len(r['quote']) >= 4


def test_script_is_decided_by_greek_characters_not_ascii():
    """æ/œ/ß make a Latin word non-ASCII; it must still count as Latin, not
    leak into a Greek-only denominator it can never match."""
    assert not is_greek('præterea')
    assert not is_greek('cæteris')
    assert not is_greek('groß')
    assert is_greek('ἀνάλογον') and is_greek('αναλογον')
    assert latin_dominated(['præterea', 'cæteris', 'αγαθον', 'κακον'])


def test_genuine_quote_behind_latin_parenthetical_is_judged(index):
    """The over-broad skip's poster case, pinned: `τὸ ἀνάλογον ἐναλλάξ (de
    proportionibus convertendis) Αγ5. 74a18` is a genuine quotation whose
    Greek matches its line perfectly. It must be judged, on Greek alone, and
    say so."""
    r = by_cite(index, pages=[60])[(60, 'L', '74a', 18)]
    assert 'skipped' not in r, 'a real quotation went unjudged'
    assert r['greek_only'] is True
    assert r['overlap'] == 1.0, r


def test_all_five_real_zero_overlap_findings_still_fire(index):
    """The skip must not eat the true positives — all five, not a sample.
    Ζμδ9. 685a18 sits in a span threaded with `opp`, exactly the shape the
    skip could over-eat."""
    judged = {k: r['overlap'] for k, r in by_cite(index).items()
              if 'skipped' not in r}
    # The three former members of this list (685a18, 1332b32, 33a12) are
    # ruled: printed citation errors, kept as printed, corrigenda banked —
    # they are asserted in the adjudication test below, not here. The gate's
    # zero-overlap class on 53-62 is EMPTY of open members.
    assert not [w for w, ov in judged.items()
                if ov == 0.0 and 53 <= w[0] <= 62
                and not by_cite(index)[w].get('adjudicated')], \
        'an unruled zero-overlap finding has appeared on 53-62'
    # Φη3. 247b21 is NOT in this list any more, and must never come back as a
    # zero: John ruled it a recension seam (2026-08-11, against his Ross —
    # Bonitz cites Bekker 1831, which prints both recensions of Physics VII;
    # "247b1-248a9 = 247a28-248b28"). The seam is excluded by name, so the
    # citation is did-not-judge, not a manufactured zero.
    assert (53, 'R', '247b', 21) not in judged, (
        'the Physics VII seam is ruled a recension difference; a zero here '
        'would be measuring the edition, not the transcription')


def test_mixed_spans_judged_greek_only_report_their_score(index):
    """The two mixed spans that were round-1 false positives are now judged
    on their Greek words — and both come back at zero, a finding for John to
    rule on, not a number to suppress. If either starts matching, the corpus
    or the gate changed and this pin should be re-examined."""
    d = by_cite(index)
    for who in [(61, 'R', '1007b', 25),   # μεμιχθαι παντι …
                (62, 'R', '402b', 21)]:   # αιτιου αιτιατου
        r = d[who]
        assert 'skipped' not in r and r['greek_only'] is True
        assert r['overlap'] == 0.0, (who, r['overlap'])


def test_the_skip_class_cannot_widen(index):
    """The volume rule, pinned live: did-not-judge is lawful ONLY below
    MIN_GREEK. Every skip on 15-62 must have fewer than MIN_GREEK Greek
    words, and every Greek-only judgement must have at least MIN_GREEK, all
    Greek. Cross-model review found the class could widen (or the 1-word
    boundary move) without a failing test; this is the pin. The known
    exactly-one-Greek-word span is asserted by name so the boundary sits on
    a real page, not a synthetic list."""
    from bonitz_pipeline.quotecheck import MIN_GREEK
    cases = by_cite(index, pages=range(15, 63))
    skips = {k: r for k, r in cases.items() if r.get('skipped') == 'latin'}
    for k, r in skips.items():
        n = sum(1 for w in r['quote'] if is_greek(w))
        assert n < MIN_GREEK, f'{k} skipped with {n} Greek words'
    for k, r in cases.items():
        if r.get('greek_only'):
            assert len(r['quote']) >= MIN_GREEK and \
                all(is_greek(w) for w in r['quote']), k
    assert (55, 'L', '260a', 16) in skips, \
        'the exactly-one-Greek-word boundary case must stay skipped'


def test_a_ruled_benign_finding_is_labelled_not_open(index):
    """John's dossier rulings (2026-08-11): Μκ5. 1062b11 is a similiter list,
    Μγ4. 1007b25 scores against its neighbour's citation, ψα1. 402b21 is
    Bonitz's Latin. Each record must CARRY its ruling — vanishing would be
    absence-rendered-as-clean, and an unlabelled zero would be open work."""
    cases = by_cite(index)
    for who in [(54, 'R', '685a', 18),
                (54, 'R', '1332b', 32),
                (57, 'R', '33a', 12),
                (57, 'R', '1062b', 11),
                (61, 'R', '1007b', 25),
                (62, 'R', '402b', 21)]:
        r = cases[who]
        assert r['overlap'] == 0.0, who
        assert r.get('adjudicated'), f'{who} must carry its ruling'
