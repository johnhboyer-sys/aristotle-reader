"""B2 — the cited line number must exist on the cited page.

Design: docs/sweep-validators-next.md §B2. Two disciplines pinned here:

The near-miss band is a tier, not a pass: corpus columns are contiguous,
so the only possible misses sit past a column's ends — and 1-2 past the
end is exactly the tail slip the design named (544a32 against a column
ending at 30). That band is tier `tail`: not clean, not a finding, but
VISIBLE — in the TSV and the summary — so the drift rate can be measured
and the rule tightened. 544a33 (beyond ±2) is a finding; the boundary is
tested from both sides.

And volume as well as verdict: a column the corpus does not hold comes
back as a `no-corpus` ROW and a skip COUNT, never silence. quotecheck's
own `if not window: continue` is the named anti-pattern — the impossible
address is the one case it structurally cannot report — so these tests
pin that parsed = checked + skipped always, and that the summary states
every skip reason.

Unit tests run on synthetic corpus dicts and synthetic reconciled text;
only the final integration test touches the real corpus, and it skips
(visibly) when the corpus is not present.
"""

import glob

import pytest

from bonitz_pipeline import linecheck
from bonitz_pipeline.lexcheck import CORPUS
from bonitz_pipeline.linecheck import FUZZ, check, run, summary

# A synthetic corpus: column 544a holds lines 1-30, nothing else exists.
COLS = {'544a': {n: ['λόγος'] for n in range(1, 31)}}


def skipped(c):
    return c['no-corpus'] + c['seam'] + c['unparseable']


def test_a_valid_citation_passes_and_is_counted():
    rows, c = check('καὶ τὸ Ζιε13. 544a29.', 'page-001-L', COLS, set())
    assert rows == []                     # nothing to report...
    assert c['parsed'] == c['checked'] == 1   # ...but it was LOOKED AT
    assert c['finding'] == 0


def test_cited_line_just_past_the_fuzz_is_a_finding():
    # column max is 30; 33 has no neighbour within ±2 that exists
    rows, c = check('Ζιε13. 544a33.', 'page-001-L', COLS, set())
    assert c['finding'] == 1
    assert rows[0]['tier'] == 'finding'
    assert rows[0]['column'] == '544a' and rows[0]['line'] == 33
    # the finding row says what the column actually holds
    assert rows[0]['corpus_lines'] == '1-30'


def test_cited_line_just_past_the_column_end_is_tier_tail():
    """The design document's motivating case: 544a32 against a column
    ending at 30. Forgiving it would hide the one-line tail slip this
    check was built to catch, so it is neither clean nor a finding —
    tier `tail`, reported and counted so John can measure the band."""
    rows, c = check('Ζιε13. 544a32.', 'page-001-L', COLS, set())
    assert c['checked'] == 1
    assert c['finding'] == 0              # not condemned: editions drift
    assert c['tail'] == 1                 # ...but never silently forgiven
    assert rows and rows[0]['tier'] == 'tail'
    assert rows[0]['line'] == 32
    assert rows[0]['corpus_lines'] == '1-30'


def test_the_tail_band_covers_the_column_start_too():
    # column holds 5-30: cite 3 is min-2 (tail), cite 2 is min-3 (finding)
    cols = {'544a': {n: ['λόγος'] for n in range(5, 31)}}
    rows, c = check('Ζιε13. 544a3.', 'page-001-L', cols, set())
    assert c['tail'] == 1 and c['finding'] == 0
    rows, c = check('Ζιε13. 544a2.', 'page-001-L', cols, set())
    assert c['tail'] == 0 and c['finding'] == 1


def test_absent_column_is_reported_skipped_never_dropped():
    """The anti-pattern this check exists to avoid: quotecheck's
    `if not window: continue` drops the corpus-absent citation on the
    floor. Here it must surface as a row AND a count."""
    rows, c = check('ρ2. 999b5.', 'page-001-L', COLS, set())
    assert c['finding'] == 0              # absence of corpus is NOT a finding
    assert c['no-corpus'] == 1
    assert rows and rows[0]['tier'] == 'no-corpus'
    assert rows[0]['column'] == '999b'
    assert c['parsed'] == c['checked'] + skipped(c)


def test_seam_column_is_skipped_not_condemned():
    # our 247b stops at 19; Bonitz cites Bekker's other recension
    cols = dict(COLS, **{'247b': {n: [] for n in range(1, 20)}})
    rows, c = check('Φη3. 247b21.', 'page-001-L', cols, {'247b'})
    assert c['finding'] == 0
    assert c['seam'] == 1
    assert rows[0]['tier'] == 'seam'


def test_page_cite_without_a_line_number_is_counted_unparseable():
    rows, c = check('cf 544a. et', 'page-001-L', COLS, set())
    assert c['unparseable'] == 1 and c['checked'] == 0
    assert c['parsed'] == 1


def test_page_cite_at_end_of_line_with_no_wrapped_digits_stays_unparseable():
    # next line opens with prose, not a line number: no join, no check
    rows, c = check('cf 544a\nτὰ λοιπά', 'page-001-L', COLS, set())
    assert c['unparseable'] == 1 and c['checked'] == 0


def test_a_wrapped_citation_is_joined_and_checked():
    """page-051-L's real shape: `θ20. 832 a` ends one printed line and
    `1. eorum…` begins the next. One citation, line 1 — CHECKED, not
    dropped into `unparseable` with its line number never looked at."""
    text = 'τὸ μέλι ποιεῖν θ20. 544 a\n1. eorum amaritudo explicatur'
    rows, c = check(text, 'page-051-L', COLS, set())
    assert c['unparseable'] == 0          # the line number was found
    assert c['parsed'] == c['checked'] == 1
    assert c['finding'] == 0 and c['tail'] == 0
    assert rows == []                     # line 1 exists in 544a


def test_a_cite_matched_across_a_line_break_has_no_newline_in_its_row():
    # CITE_RE spans `426\na33`; a raw newline in the cite splits its TSV row
    rows, c = check('γ2. 426\na33 δὲ', 'page-031-L', COLS, set())
    assert rows and rows[0]['tier'] == 'no-corpus'
    assert '\n' not in rows[0]['cite']
    assert rows[0]['cite'] == 'γ2. 426 a33'


def test_a_wrapped_citation_with_an_impossible_line_is_a_finding():
    text = 'τὸ μέλι ποιεῖν θ20. 544 a\n40. eorum amaritudo'
    rows, c = check(text, 'page-051-L', COLS, set())
    assert c['checked'] == 1 and c['finding'] == 1
    assert rows[0]['column'] == '544a' and rows[0]['line'] == 40
    # the source names the line the cite STARTS on, not the wrapped line
    assert rows[0]['source'] == 'page-051-L:1'
    assert rows[0]['siglum'] == 'θ'


MIXED = ('καὶ τὸ Ζιε13. 544a29 λέγεται\n'      # checked, passes
         'Ζιε13. 544a33 δὲ\n'                   # checked, finding
         'Ζιε13. 544a31 ἔτι\n'                  # checked, tail
         'ρ2. 999b5 ἄλλο\n'                     # no-corpus
         'cf 544a. ϗ τὰ λοιπά\n')               # unparseable


def test_the_volumes_add_up():
    rows, c = check(MIXED, 'page-001-L', COLS, set())
    assert c['parsed'] == 5
    assert c['checked'] == 3
    assert skipped(c) == 2
    assert c['finding'] == 1
    assert c['tail'] == 1                 # counted apart from both
    assert c['parsed'] == c['checked'] + skipped(c)


def test_summary_states_every_volume():
    rows, c = check(MIXED, 'page-001-L', COLS, set())
    s = summary(c, rows)
    assert '5 citations parsed' in s
    assert '3 checked' in s and '2 skipped' in s
    assert 'no-corpus' in s and '1 distinct sigla' in s
    assert 'unparseable' in s
    assert '1 tail' in s                  # visible, so it can be measured
    assert '1 findings' in s


def test_empty_reconciled_glob_raises(tmp_path):
    """Never looked must never read as clean: no columns → raise,
    before the corpus is even loaded."""
    (tmp_path / 'reconciled').mkdir()
    with pytest.raises(SystemExit, match='no reconciled columns'):
        linecheck.main(['--reconciled', str(tmp_path / 'reconciled'),
                        '--out', str(tmp_path / 'out.tsv')])


def test_main_writes_tsv_and_prints_the_volumes(tmp_path, monkeypatch, capsys):
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-001-L.txt').write_text(MIXED, encoding='utf-8')
    out = tmp_path / 'sweeps' / 'linecheck.tsv'
    monkeypatch.setattr(linecheck, 'load_corpus', lambda: (COLS, set()))
    assert linecheck.main(['--reconciled', str(rec), '--out', str(out)]) == 0
    lines = out.read_text(encoding='utf-8').splitlines()
    assert lines[0] == 'source\tcite\tcolumn\tline\ttier\tcorpus_lines'
    tiers = [l.split('\t')[4] for l in lines[1:]]
    assert 'finding' in tiers and 'no-corpus' in tiers
    assert 'tail' in tiers                          # the band is in the TSV
    finding = next(l for l in lines[1:] if '\tfinding\t' in l)
    assert finding.startswith('page-001-L:2\t')     # source col:line
    assert finding.endswith('\t1-30')               # the column's real range
    tail = next(l for l in lines[1:] if '\ttail\t' in l)
    assert tail.startswith('page-001-L:3\t')
    assert tail.endswith('\t1-30')
    printed = capsys.readouterr().out
    assert '5 citations parsed: 3 checked, 2 skipped' in printed
    assert '1 tail' in printed
    assert '1 findings' in printed


REAL_CORPUS = glob.glob(str(CORPUS / '*/book-*.json'))
REAL_RECONCILED = sorted((linecheck.ROOT / 'work/reconciled').glob('*.txt'))


@pytest.mark.skipif(not REAL_CORPUS or not REAL_RECONCILED,
                    reason='real corpus or reconciled columns not present')
def test_real_corpus_volumes_add_up():
    """Integration: the arithmetic must hold against the real corpus too."""
    from bonitz_pipeline.quotecheck import load_corpus
    rows, c = run(REAL_RECONCILED[:4], load_corpus())
    assert c['parsed'] > 0
    assert c['parsed'] == c['checked'] + skipped(c)
