"""A Latin capital standing where a Greek siglum belongs must be REPORTED.

`siglum_check` knows the homoglyph map and uses it to FOLD Latin into Greek so
the citation resolves. That is tolerance: `siglum-check.tsv` holds zero rows
about these while 91 Latin-led citation-shaped tokens sit in work/reconciled.
This module detects instead of folding, and these tests pin the two halves of
that:

THE DISCRIMINATOR. Most Latin capitals in the index are Bonitz being correct —
editors (`St K Cr Su`), Aubert-Wimmer (`AZι I 77`), Homeric book letters
(`Hom B 672`), Roman numerals (`S III 379`). Only a token that FOLDS to one of
Bonitz's sigla AND whose neighbouring Bekker page falls inside that work's span
is reported. Neuter that test and the apparatus cases below start failing —
which is the point of having them.

AND VOLUME AS WELL AS VERDICT. An apparatus token is skipped and COUNTED, never
dropped on the floor; examined = reported + skipped + clean always; an empty
reconciled glob raises rather than printing a clean zero.

Synthetic text and a synthetic siglum table throughout; the last test is the
only one that touches the real corpus, and it skips visibly when it is absent.
"""

import json

import pytest

from bonitz_pipeline import siglum_homoglyph as sh
from bonitz_pipeline.siglum_check import Work

# Two works from Bonitz's key, enough to make every case: Ρ and Η are both
# homoglyphs of Latin capitals, and their spans are far apart.
WORKS = {
    'Ρ': Work('Ρ', 'τέχνη Ῥητορική', 'Rh', 1354, 1420),
    'Η': Work('Η', 'Ἠθικὰ Νικομάχεια', 'EN', 1094, 1181),
    'Κ': Work('Κ', 'Κατηγορίαι', 'Cat', 1, 15),
}


def test_a_latin_p_that_resolves_is_reported_with_the_right_proposal():
    """page-021-R:13, the specimen: `Pα` with LATIN P, beside 1359a25, which
    is squarely inside the Rhetoric."""
    found, c = sh.scan('εἴδη Pα13. 1359a25.', 'page-021-R', WORKS)
    assert len(found) == 1
    f = found[0]
    assert f.token == 'Pα' and f.proposal == 'Ρα'
    assert f.work == 'Ρ' and f.page == 1359
    assert f.col == 'page-021-R' and f.line == 1
    assert c['latin'] == 1 and c['reported'] == 1 and c['skipped'] == 0


def test_the_shared_page_downstream_still_adjudicates():
    """Bonitz shares one page across a run of references, so CITE's shape —
    page immediately after the token — misses every real case. Both `Pα`s
    here are decided by the single 1359a25 at the end of the line."""
    found, c = sh.scan('κημάτων εἴδη Pα13. ἀδίκημα μεῖζον τί Pα14. 3. 1359a25.',
                       'page-021-R', WORKS)
    assert [f.token for f in found] == ['Pα', 'Pα']
    assert {f.page for f in found} == {1359}


def test_a_page_across_a_printed_line_break_still_adjudicates():
    """The column is a stream: 790 citations in the corpus wrap, and the break
    is where the measure ran out, not anything Bonitz meant. The finding is
    still filed under the line the TOKEN begins on."""
    found, _ = sh.scan('πρῶτον\nτῶν ἀδικημάτων Pα13.\n1359 a25.', 'page-021-R',
                       WORKS)
    assert len(found) == 1
    assert found[0].line == 2 and found[0].page == 1359


def test_a_single_digit_bekker_page_still_adjudicates():
    """page-045-L:58, `veluti K5. 3 b19.` — a Latin K where Κ belongs. The
    Categoriae run 1a-15b, so their first nine pages are ONE digit, and CITE's
    `\\d{2,4}` cannot see them. That floor was the only thing hiding this
    finding, so the floor is one digit here."""
    found, c = sh.scan('veluti K5. 3 b19. Αγ6. 74 b17.', 'page-045-L', WORKS)
    assert len(found) == 1
    assert found[0].token == 'K' and found[0].proposal == 'Κ'
    assert found[0].work == 'Κ' and found[0].page == 3


def test_a_column_letter_followed_by_a_word_is_not_a_page():
    """The cost of dropping the floor: `AZι I 77 n 5 al.` would read `5 a` as
    page 5 column a, and page 5 is inside the Categoriae. It is `al.`, an
    abbreviation. No letter may follow the column letter."""
    found, c = sh.scan('scops AZι I 77 n 5 al.', 'page-023-R', WORKS)
    assert found == []


def test_the_same_token_out_of_range_is_skipped_as_apparatus():
    """Identical token, identical fold — only the page differs. 583 is not in
    the Rhetoric, so `Pα` here is something else and the check stays silent."""
    found, c = sh.scan('εἴδη Pα13. 583a25.', 'page-021-R', WORKS)
    assert found == []
    assert c['latin'] == 1 and c['skipped'] == 1 and c['reported'] == 0
    assert c['out-of-range'] == 1


def test_a_genuinely_greek_siglum_produces_nothing():
    found, c = sh.scan('ἀδικήματα πρὸς ἕνα Ρα13. 1373 b21.', 'page-021-R',
                       WORKS)
    assert found == []
    assert c['latin'] == 0
    assert c['examined'] == c['clean'] == 1


def test_an_apparatus_token_is_skipped_and_counted_not_dropped():
    """page-016-R:19's shape, `(Β15. v l cf Wolf Prol p CLXVIII)` — a reference
    to somebody else's book, not to Aristotle. (The corpus spells that one with
    a GREEK Β; the Latin spelling below is the case this check must survive.)
    Latin `B` folds to Greek `Β`, which is not one of Bonitz's 48 sigla, so
    there is nothing to report — but the token was LOOKED AT, and the summary
    must be able to say so. Silence and never-looked must not print the same."""
    found, c = sh.scan('b7 (B15. v l cf Wolf Prol p CLXVIII). 1287 b14',
                       'page-016-R', WORKS)
    assert found == []
    assert c['latin'] == 1
    assert c['skipped'] == 1
    assert c['no-siglum'] == 1
    assert c['lead-B'] == 1               # counted under the letter it led with


def test_a_latin_token_with_no_page_nearby_is_skipped_no_page():
    """page-021-R:19's real shape, `περὶ ἀδικίας Hε. ημα34. πκθ.` — Bonitz
    citing works and no page at all. The token folds to a siglum, so it is not
    apparatus in the `Β15.` sense; there is simply nothing to adjudicate WITH.
    That is a different not-knowing, and it is counted apart."""
    found, c = sh.scan('περὶ ἀδικίας Hε. ημα34. πκθ.', 'page-021-R', WORKS)
    assert found == []
    assert c['latin'] == 1
    assert c['no-page'] == 1
    assert c['skipped'] == c['latin']


def test_the_window_bounds_the_search_for_the_page():
    """A page far enough downstream belongs to the next entry, not to this
    token. The bound is what keeps the forward search from manufacturing one."""
    text = 'εἴδη Pα13.' + ' κ' * 200 + ' 1359a25.'
    found, c = sh.scan(text, 'page-021-R', WORKS)
    assert found == []
    assert c['no-page'] == 1


MIXED = ('ἀδίκημα Ηε10. 1135 a8.\n'          # clean: Greek Η
         'εἴδη Pα13. 1359a25.\n'             # reported: Latin P, in range
         'ἀδικεῖν Hε15. 1136 a33.\n'         # reported: Latin H, in range
         'εἴδη Pα13. 583a25.\n'              # skipped: out of range
         '(B15. cf Wolf Prol p 1287 b14).\n')  # skipped: Β is not a siglum


def test_the_volumes_add_up():
    found, c = sh.scan(MIXED, 'page-001-L', WORKS)
    assert len(found) == 2
    assert c['examined'] == c['reported'] + c['skipped'] + c['clean']
    assert c['latin'] == c['reported'] + c['skipped'] == 4
    assert c['reported'] == 2 and c['skipped'] == 2
    assert c['out-of-range'] == 1 and c['no-siglum'] == 1


def test_summary_states_every_volume():
    _, c = sh.scan(MIXED, 'page-001-L', WORKS)
    c['columns'] = 1
    s = sh.summary(c)
    assert '1 columns read' in s
    assert f"{c['examined']} citation-shaped tokens examined" in s
    assert 'clean' in s and 'LATIN capital' in s
    assert 'reported' in s and 'skipped as apparatus' in s
    for reason in sh.REASONS:              # every reason states its count
        assert reason in s
    assert 'P×2' in s and 'B×1' in s       # the breakdown by leading letter


def _sigla(tmp_path):
    """Bonitz's key, cut down to the two works these tests need."""
    p = tmp_path / 'work-sigla.json'
    p.write_text(json.dumps({'works': [
        {'siglum': 'Ρ', 'title': 'τέχνη Ῥητορική', 'manifest': 'Rh',
         'bekker': '1354a-1420a'},
        {'siglum': 'Η', 'title': 'Ἠθικὰ Νικομάχεια', 'manifest': 'EN',
         'bekker': '1094a-1181b'},
    ]}), encoding='utf-8')
    return p


def test_empty_reconciled_glob_raises(tmp_path):
    """Never looked must never read as clean."""
    (tmp_path / 'reconciled').mkdir()
    with pytest.raises(SystemExit, match='no reconciled columns'):
        sh.main(['--reconciled', str(tmp_path / 'reconciled'),
                 '--sigla', str(_sigla(tmp_path)),
                 '--out', str(tmp_path / 'out.tsv')])


def test_main_writes_the_tsv_and_prints_the_volumes(tmp_path, capsys):
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-001-L.txt').write_text(MIXED, encoding='utf-8')
    out = tmp_path / 'sweeps' / 'siglum-homoglyph.tsv'
    assert sh.main(['--reconciled', str(rec), '--sigla', str(_sigla(tmp_path)),
                    '--out', str(out)]) == 0
    lines = out.read_text(encoding='utf-8').splitlines()
    assert lines[0] == 'column\tline\ttoken\tproposal\twork\tpage'
    assert lines[1] == 'page-001-L\t2\tPα\tΡα\tΡ\t1359'
    assert lines[2] == 'page-001-L\t3\tHε\tΗε\tΗ\t1136'
    assert len(lines) == 3                 # the two skipped tokens wrote no row
    printed = capsys.readouterr().out
    assert '1 columns read' in printed
    assert 'never edits the corpus' in printed   # the diplomatic rule, stated


def test_header_is_written_even_with_no_findings(tmp_path, capsys):
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-001-L.txt').write_text('ἀδίκημα Ηε10. 1135 a8.\n',
                                        encoding='utf-8')
    out = tmp_path / 'siglum-homoglyph.tsv'
    assert sh.main(['--reconciled', str(rec), '--sigla', str(_sigla(tmp_path)),
                    '--out', str(out)]) == 0
    # "ran, found none" must be distinguishable from "never ran"
    assert out.read_text(encoding='utf-8') == sh.TSV_HEADER


REAL = sorted((sh.ROOT / 'work/reconciled').glob('*.txt'))


@pytest.mark.skipif(not REAL or not sh.SIGLA.exists(),
                    reason='the real corpus or the siglum key is not present')
def test_the_real_corpus_volumes_add_up():
    from bonitz_pipeline.siglum_check import inventory
    found, c = sh.run(REAL, inventory())
    assert c['columns'] == len(REAL)
    assert c['examined'] == c['reported'] + c['skipped'] + c['clean']
    assert c['latin'] == c['reported'] + c['skipped']
    assert len(found) == c['reported']
    # ⚠ NONE LEFT, AND THAT IS THE POINT. The four this module found — `Hε`
    # and two `Pα` on page-021-R, the specimen it was built from, and
    # `K5. 3 b19` on page-045-L, which only the one-digit page floor reaches
    # — were ruled by John on 2026-08-13 and written by `audit_apply`. A
    # finder that has been acted on finds nothing, so the empty set is this
    # sweep confirming the apply from the other side.
    assert {(f.col, f.line, f.token, f.proposal) for f in found} == set()
    assert c['reported'] == 0
    # ⚠ AND THE VOLUME MUST STILL SHOW IT LOOKED. An empty report from a run
    # that examined 96 columns and one from a run that read nothing are
    # different facts, and only the counters tell them apart.
    assert c['examined'] and c['latin'] == c['skipped']
