"""The editor-siglum check, against Bonitz's own p.11/p.12 key.

The key is complete by design — he closes p.11 saying every name not
abbreviated there is written out in full — so an abbreviated siglum absent
from it is a question. What this file pins is that the question is asked of
the right tokens:

  * `Bk1` is caught, because the ink prints `Bk²` and the key allows only
    `Bk`, `Bk2` and `Bk3`. That site was known before the check existed,
    which makes it the instrument confirming against a known answer.
  * a PAGE number welded to a siglum is not an edition numeral. Reading two
    digits of `Cuv F304` and `AΖι I121` invented `F30` and `I12` — two
    findings out of two, in the first run.
  * the allowlist is checked for silence: the same column must yield nothing
    with the key and something without it.
"""

import json
from pathlib import Path

import pytest

from bonitz_pipeline import editor_check as ec

ROOT = Path(__file__).resolve().parent.parent
REAL = sorted((ROOT / 'work' / 'reconciled').glob('page-*.txt'))
KEY = ec.sanctioned()


def column(tmp_path: Path, *lines: str) -> list[Path]:
    p = tmp_path / 'page-900-L.txt'
    p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return [p]


# --- the key, and what it sanctions -------------------------------------------

def test_the_edition_numerals_are_read_out_of_the_keys_own_prose():
    """`Bk2` and `Bk3` are not entries in the key; they live in Bekker's
    note. A hand-kept second list would be free to drift from the key it
    describes."""
    assert {'Bk', 'Bk2', 'Bk3'} <= KEY
    assert 'Bk1' not in KEY


def test_the_keys_ordinary_latin_does_not_leak_into_the_allowlist():
    """The entries carry prose — titles, cities, years. Only a token whose
    letters are already a siglum may add a numeral variant, so the two
    editions are the ONLY things the prose contributes."""
    from bonitz_pipeline.latin_check import sigla
    assert 'Aristoteles' not in KEY and 'Lpz' not in KEY
    assert KEY - set(sigla()) == {'Bk2', 'Bk3'}


def test_prose_that_looks_like_a_numeral_variant_is_still_refused(tmp_path,
                                                                  monkeypatch):
    """⚠ THE REAL KEY CANNOT EXERCISE THIS GUARD. Its prose happens to hold
    no `Word12` outside Bekker's note, so removing the check that a token's
    letters are already a siglum changed nothing and no test noticed. A key
    whose prose DOES carry one says whether the guard works."""
    from bonitz_pipeline import latin_check
    doc = tmp_path / 'apparatus-sigla.json'
    doc.write_text(json.dumps({
        'editors_p11': {'Bk': {'who': 'Bekker',
                               'note': 'Bk2 and Bk3 are his later editions'}},
        'zoological_p12': {'Cuv': 'Regne animal, Paris 1836, vol 12 and '
                                  'Lpz2 in the reprint'},
    }, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(ec, 'SIGLA', doc)
    monkeypatch.setattr(latin_check, 'SIGLA', doc)
    ec.sanctioned.cache_clear()
    latin_check.sigla.cache_clear()
    try:
        key = ec.sanctioned()
        assert key == {'Bk', 'Cuv', 'Bk2', 'Bk3'}, key
        assert 'Lpz2' not in key      # `Lpz` is no siglum, so neither is this
    finally:
        ec.sanctioned.cache_clear()
        latin_check.sigla.cache_clear()


def test_the_longest_siglum_in_the_key_can_still_be_matched(tmp_path):
    """⚠ A SIGLUM THE PATTERN CANNOT SEE IS ONE IT REPORTS AS ABSENT.
    `Sonnenburg` is ten letters; a candidate pattern capped at nine would
    read it as clean by never looking at it."""
    longest = max(KEY, key=len)
    rows, counts, hits = ec.run(column(tmp_path, f'auctore {longest} p 12.'))
    assert hits[longest] == 1 and rows == []


# --- the known answer ---------------------------------------------------------

def test_bk1_is_a_finding_and_the_sanctioned_editions_are_not(tmp_path):
    rows, counts, _ = ec.run(column(
        tmp_path,
        'ζ8. 1322 a35 (Bk1 utroque loco)',
        'ἀγνοῶν ϗ̀ (ϗ̀ Bk3, ἢ Bk) ἄκων',
        'τὸ δὲ Bk2 alterum'))
    assert [(r['token'], r['tier']) for r in rows] == [('Bk1', 'numeral')]
    assert counts['sanctioned'] == 3
    assert 'sanctions Bk, Bk2, Bk3 and not Bk1' in rows[0]['evidence']


def test_a_page_number_welded_to_a_siglum_is_not_an_edition(tmp_path):
    """⚠ BOTH OF THE FIRST RUN'S FINDINGS WERE THIS. `Cuv F304, 9` is Cuvier
    at page 304; `AΖι I121 n2` is Aubert-Wimmer volume I, page 121. Two
    digits taken off each gave `F30` and `I12`, which are on no page of the
    book."""
    rows, counts, _ = ec.run(column(
        tmp_path,
        'scomber amia L, s lichia amia Cuv F304, 9, scomber sardo',
        'pelamys sarda, bonite AΖι I121 n2).'))
    assert [r for r in rows if r['tier'] == 'numeral'] == []
    assert counts['sanctioned'] >= 2          # F and I are still counted


def test_a_one_letter_miss_on_a_long_siglum_is_a_spelling_finding(tmp_path):
    rows, _, _ = ec.run(column(tmp_path, 'ψα4. 408b17 (Trdlbg p 270).'))
    assert [(r['token'], r['tier'], r['sanctioned']) for r in rows] == [
        ('Trdlbg', 'spelling', 'Trdllbg')]


def test_a_short_token_is_never_matched_by_spelling(tmp_path):
    """Two- and three-letter sigla are one edit from half the key. `Bz`
    against `Bk` is not evidence of anything.

    ⚠ `Heh` IS THE CASE THAT BITES. It is one deletion from `Hehn`, which IS
    in the key — so a bound that only constrained the key's side, or that
    let three-letter tokens in, would call it a spelling finding. `Bx` alone
    could not catch that: nothing four letters long is one edit from it, so
    the assertion passed however the bound was written."""
    assert ec.classify('Bx', KEY) == ('unknown', '')
    assert ec.classify('Wx', KEY) == ('unknown', '')
    assert 'Hehn' in KEY
    assert ec.classify('Heh', KEY) == ('unknown', '')
    # ⚠ AND THE BOUND HOLDS ON BOTH SIDES. `Bsm` is a three-letter siglum, so
    # every four-letter word built on it is one edit away; without the bound
    # on the KEY's side, `Bsmn` would be reported against it.
    assert 'Bsm' in KEY
    assert ec.classify('Bsmn', KEY) == ('unknown', '')


def test_an_ancient_author_is_held_back_not_reported(tmp_path):
    """Bonitz abbreviates authors freely and they are not editor sigla.
    Tuning this tier to look better is the temptation `latin_check`'s
    `other` tier was held back to resist."""
    rows, counts, _ = ec.run(column(
        tmp_path, 'versus Hom affertur Ρβ9. 1387 a34, cf Emped 222'))
    assert counts['unknown'] == 2
    assert all(r['tier'] == 'unknown' for r in rows)
    assert counts['numeral'] == 0 and counts['spelling'] == 0


# --- the evidence a card carries ----------------------------------------------

def test_a_lone_site_and_a_settled_convention_do_not_look_alike(tmp_path):
    """`Bk1` stands alone against 20 `Bk`; `Trdlbg` is spelt the same way at
    all 8 of its sites. One reads like a slip and the other like Bonitz's
    own habit, and the card must not show them in the same shape."""
    rows, _, _ = ec.run(column(
        tmp_path, '(Bk1 utroque loco)', 'Trdlbg p 270.', '405a13, 16 Trdlbg,'))
    ev = {r['token']: r['evidence'] for r in rows}
    assert 'the only site in the corpus' in ev['Bk1']
    assert '2 sites in the corpus, all spelt this way' in ev['Trdlbg']


# --- volume, and the silence of an allowlist ----------------------------------

def test_the_allowlist_is_what_makes_the_column_clean(tmp_path, monkeypatch):
    """⚠ AN ALLOWLIST FAILS SILENTLY. The design doc's own requirement: a
    known-good column must produce zero findings WITH the key and something
    without it, or the check cannot tell a clean corpus from a key that
    never loaded."""
    good = column(tmp_path, 'ϗ̀ (ϗ̀ Bk3, ἢ Bk) Wz Vhl Bz Trdllbg')
    rows, _, _ = ec.run(good)
    assert rows == []
    monkeypatch.setattr(ec, 'sanctioned', lambda: frozenset({'Zz'}))
    rows, _, _ = ec.run(good)
    assert rows, 'without the key every siglum should be unaccounted for'


def test_a_run_that_reads_nothing_refuses():
    with pytest.raises(ec.EditorCheckError):
        ec.run([])


def test_the_tsv_is_written_even_when_there_is_nothing_to_report(tmp_path):
    out = tmp_path / 'editor-check.tsv'
    ec.write_tsv([], out)
    assert out.read_text(encoding='utf-8').splitlines() == [
        'column\tline\ttoken\ttier\tsanctioned\tevidence\tcontext']


# --- the real corpus ----------------------------------------------------------

@pytest.mark.skipif(not REAL, reason='no reconciled corpus here')
def test_the_real_corpus_holds_one_unsanctioned_edition_and_it_is_bk1():
    rows, counts, hits = ec.run(REAL)
    assert counts['columns'] >= 96 and counts['candidates'] > 500
    numerals = [(r['column'], r['line'], r['token']) for r in rows
                if r['tier'] == 'numeral']
    assert numerals == [('page-053-R', '7', 'Bk1')]
    # The key is doing real work, not exempting a handful of stragglers.
    assert counts['sanctioned'] > 400 and hits['Bk'] > 10


# --- the digit in the volume position -----------------------------------------

def test_a_digit_where_the_volume_is_a_roman_numeral_is_a_finding(tmp_path):
    """⚠ THE CLASS `encoding_check` CANNOT SEE. It folds Latin against Greek
    and knows nothing of numerals, so a Roman `I` set as the digit `1` is
    structurally invisible to it — the gap named in the 2026-08-12 handoff.
    Bonitz's p.11 rule is the authority: the letter A takes the work siglum
    and then Aubert-Wimmer's volume as a Roman numeral."""
    rows, counts, _ = ec.run(column(
        tmp_path,
        'caprimulgus europaeus L St K CrSu 131 n 95 AΖι1. 77. n 5).',
        'gallus alector St Cr AΖγ 22, Ζι I 77',
        'saltatoria, genus incertum AΖι I 156 n 2,'))
    vols = [(r['token'], r['tier'], r['sanctioned']) for r in rows
            if r['tier'] == 'volume']
    assert vols == [('AΖι1', 'volume', 'AΖι I')]
    assert counts['roman'] == 1          # the sibling that proves the rule
    assert 'Roman numeral' in [r for r in rows if r['tier'] == 'volume'][0]['evidence']


def test_a_page_with_the_space_closed_is_not_a_volume_finding(tmp_path):
    """`AΖγ216` is page 216 with the gap closed, and that gap is John's
    RENDER rule of 2026-08-13 — not an error, and not this check's business.
    One digit is a numeral; more is a page."""
    rows, counts, _ = ec.run(column(
        tmp_path, 'dum certo definitae C II 697 St K 714 AΖγ216 Cr Su'))
    assert counts['volume'] == 0
    assert [r for r in rows if r['tier'] == 'volume'] == []


def test_a_greek_work_siglum_is_not_an_editor_siglum(tmp_path):
    """⚠ THE DISTINCTION JOHN RULED ON 2026-08-13. The editor's `A` is
    LATIN and the work siglum after it is Greek, so `Αα1.` — Greek alpha,
    the Analytics, chapter 1 — must not be read as an editor's volume. The
    two are one sort in the fount and only the codepoint tells them apart."""
    rows, counts, _ = ec.run(column(
        tmp_path, 'gismorum figura Αα 4 al. Αα1. 24b18. Ηα4. 1096b6.'))
    assert counts['volume'] == 0


@pytest.mark.skipif(not REAL, reason='no reconciled corpus here')
def test_the_real_corpus_holds_exactly_one_digit_volume():
    """Measured before it was built: 32 corpus tokens carry a digit inside a
    letter run and 31 are a siglum with its Bekker page (`οβ1347a`). This is
    the one, and it is why the class lives here rather than in a sweep of
    its own."""
    rows, counts, _ = ec.run(REAL)
    vols = [(r['column'], r['line'], r['token']) for r in rows
            if r['tier'] == 'volume']
    assert vols == [('page-026-L', '15', 'AΖι1')]
    assert counts['roman'] > 15, 'the Roman-numeral siblings are the evidence'
