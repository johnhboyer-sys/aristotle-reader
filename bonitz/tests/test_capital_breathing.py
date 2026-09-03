"""The breathing this book prints BEFORE a capital, put on the capital.

The mark carries no direction, so the whole of this file is about where the
direction is allowed to come from — and about the count that looked
unanimous and was not.
"""

from __future__ import annotations

import collections

from bonitz_pipeline import capital_breathing as cb
from bonitz_pipeline import elision

APOS, KOR, RSQ = elision.MARKS


def seen(*words: str) -> dict[str, collections.Counter]:
    out: dict[str, collections.Counter] = collections.defaultdict(
        collections.Counter)
    for w in words:
        for k, v in cb.census(w).items():
            out[k].update(v)
    return out


# --- the half that needs no evidence ------------------------------------------

def test_a_mark_before_an_already_breathed_capital_is_dropped():
    """⚠ THE LETTER'S OWN BREATHING SAYS WHICH WAY IT FACES. The OCR produced
    it twice, loose and combined; only one of them can stay, and it is not
    the one with no direction in it."""
    got, left = cb.fix(f'{APOS}Ἀλκιδάμας Ρβ23.', seen())
    assert got == 'Ἀλκιδάμας Ρβ23.' and not left


def test_it_does_not_need_the_corpus_to_do_that():
    """No stem, no census, no evidence — and still deterministic."""
    got, _ = cb.fix(f'{KOR}Ἁρμόδιος', {})
    assert got == 'Ἁρμόδιος'


# --- where a direction may come from ------------------------------------------

def test_an_exact_word_the_corpus_already_breathes_settles_it():
    got, left = cb.fix(f'{APOS}Ἀλκμαίων πο13.',
                       seen('Ἀλκμαίων ὁ Κροτωνιάτης'))
    assert got.startswith('Ἀλκμαίων') and not left


def test_a_stem_of_six_letters_settles_it():
    got, left = cb.fix(f'{APOS}Αμμωνιάς, τριήρης', seen('Ἀμμωνιακόν'))
    assert got.startswith('Ἀμμωνιάς') and not left


def test_four_letters_of_somebody_elses_name_do_not():
    """⚠ `Αστυδά-` WOULD BE SETTLED BY `Ἀστυπαλαίας`, which is a different
    name. Six letters is the floor because four is demonstrably too few."""
    got, left = cb.fix(f'{APOS}Αστυδάμας', seen('Ἀστυπαλαίας'))
    assert got == f'{APOS}Αστυδάμας'
    assert left and 'no breathed stem' in left[0]


def test_a_stem_the_corpus_breathes_both_ways_settles_nothing():
    got, left = cb.fix(f'{APOS}Αλκυόνη', seen('Ἀλκυονίς', 'Ἁλκυονίδες'))
    assert got == f'{APOS}Αλκυόνη' and left


def test_an_exact_match_outranks_the_prefix_crowd():
    """⚠ THE LEMMA ABBREVIATION IS ONE LETTER. Tested by prefix it is
    compared with every capital-alpha word in the book, `Ἅιδης` among them,
    and nothing is ever settled — while the corpus holds the standalone `Ἀ`
    26 times and `Ἁ` never."""
    s = seen('Ἀ. ἐν τῷ Μεσσηνιακῷ', 'Ἅιδης', 'Ἀβδηρίτης')
    got, left = cb.fix(f'{APOS}Α. Εὐριπίδȣ', s)
    assert got.startswith('Ἀ.') and not left


def test_the_census_sees_a_breathing_under_an_accent():
    """⚠ THE COUNT THAT LOOKED UNANIMOUS AND WAS NOT. Reading one level of
    decomposition, capital alpha came out 189 smooth to 0 rough — because
    `Ἅιδης`, `Ἅιδȣ`, `Ἅλυς` and `Ἅλυν` hide their rough breathing under an
    added accent. The real figure is 215 to 4, and those four are right."""
    assert cb.census('Ἅιδης')['Αιδης'][cb.DASIA] == 1
    assert cb.census('Ἄλκιμος')['Αλκιμος'][cb.PSILI] == 1


# --- the boundary with elision ------------------------------------------------

def test_it_never_takes_a_mark_that_belongs_to_an_elision():
    """`elision` owns every mark after a Greek letter. Two sweeps reaching
    for one character is how a corpus gets edited twice."""
    got, left = cb.fix(f'καθ{APOS} Ἀλκμαίων', seen('Ἀλκμαίων'))
    assert got == f'καθ{APOS} Ἀλκμαίων' and not left


def test_a_mark_before_a_latin_word_is_left_and_named():
    got, left = cb.fix(f'({APOS}duo diversa', seen())
    assert got == f'({APOS}duo diversa'
    assert left == ['the next character is not a Greek capital']


def test_a_mark_before_a_lowercase_greek_word_is_left_and_named():
    got, left = cb.fix(f'ut {APOS}νόματος', seen())
    assert got == f'ut {APOS}νόματος' and left


# --- the queue and the corpus must agree --------------------------------------

def test_a_cards_ground_truth_is_spelt_the_way_the_corpus_spells_it(
        monkeypatch, tmp_path):
    """⚠ A CARD'S TEXT COMES FROM THE OCR TARGETS, NOT THE CORPUS. Every sweep
    over `work/reconciled` moves the two apart, and a card whose text is not
    in the corpus is one `audit_apply.locate` cannot place — which refused a
    `none` ruling the hour these breathings were swept up."""
    from bonitz_pipeline import audit_review
    rec = tmp_path / 'reconciled'
    rec.mkdir()
    (rec / 'page-045-L.txt').write_text('Ἀλκιδάμας Ρβ23.\n', encoding='utf-8')
    monkeypatch.setattr(cb, 'RECONCILED', rec)
    cb.corpus_census.cache_clear()
    try:
        assert audit_review._spelt(f'{APOS}Ἀλκιδάμας Ρβ23.') == \
            'Ἀλκιδάμας Ρβ23.'
    finally:
        cb.corpus_census.cache_clear()
