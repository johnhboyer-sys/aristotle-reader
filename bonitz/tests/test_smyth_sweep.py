"""A validator is only worth its false-positive rate, so that is what is tested.

Every NO-FLAG case below is a form that a naive reading of the rule WOULD
flag and that is nevertheless correct Greek.  Most were not obvious: the first
run of this battery over the corpus produced 545 hits, and 500 of them were
these — §183c enclitic hosts carrying a legitimate second accent (124 hits),
§13 ῥ taking a breathing on a consonant (43), and the hiatus spelling `ἀίδιος`
whose breathing sits on the first vowel precisely BECAUSE the αι is not a
diphthong (51).  A rule that fires on those is not a validator, it is noise
with a citation attached.

Ground truth for the FLAG cases is `work/reconciled/` as it stood on
2026-08-08, before any correction from this sweep was applied.
"""

import pytest

from bonitz_pipeline.smyth_sweep import judge

ACUTE, CIRC, SUBSCRIPT = '́', '͂', 'ͅ'
ROUGH, SMOOTH = '̔', '̓'


def ids(word, after=''):
    return {r for r, _ in judge(word, after)}


# --------------------------------------------------------------------------
# forms that must NOT flag
# --------------------------------------------------------------------------

@pytest.mark.parametrize('word', ['ῥήτωρ', 'ῥυθμός', 'ῥόδον', 'ῥᾳδίως'])
def test_initial_rho_takes_its_breathing_on_a_consonant(word):
    """§13. Initial ρ is always rough — 43 of the first run's hits."""
    assert 'A4' not in ids(word)
    assert 'A7' not in ids(word)


@pytest.mark.parametrize('word', ['Πύῤῥος', 'διάῤῥοια', 'ῥινοῤῥαγία'])
def test_double_rho_carries_two_breathings(word):
    """§13. ῤῥ is two breathing marks in one word, and both are correct — and
    `ῥινοῤῥαγία` carries THREE, an initial rough on top of the pair, which an
    exception written as 'exactly two adjacent rhos' would have flagged."""
    assert ids(word) & {'A4', 'A5'} == set()


@pytest.mark.parametrize('word', ['Ῥήτωρ', 'Ῥόδος'])
def test_capital_rho_takes_its_breathing_too(word):
    """`Ῥ` decomposes to a CAPITAL rho, so a rule special-casing lowercase ρ
    flags every capitalised rho-word — and this index is full of proper
    names."""
    assert ids(word) & {'A4', 'A7'} == set()


@pytest.mark.parametrize('word', ['ΛΟΓΟΣ', 'ΤΩΝ', 'ΑΝΗΡ'])
def test_words_set_in_capitals_end_legally(word):
    """§133 is about the letter, not its case: Σ is a legal final."""
    assert 'D1' not in ids(word)


def test_an_accented_lemma_before_a_sense_number_is_not_a_siglum():
    """`ἀλώπηξ 1.` is a headword with its sense number, not a work-siglum, and
    silencing it would silence every numbered entry in the index."""
    from bonitz_pipeline.smyth_sweep import line_parts
    p = line_parts('ἀλώπηξ 1. τὸ ζῷον')[0]
    assert not p.siglum
    p2 = line_parts('Ζμδ 5. 678a31')[0]
    assert p2.siglum


@pytest.mark.parametrize('word', ['ἄνθρωπός', 'σῶσόν', 'παῖδές', 'εἶναί',
                                  'οἷόν', 'αἷμά', 'ἕνεκά', 'αἴσθησίν',
                                  'ἀλλοίωσίς', 'ῥάχεώς'])
def test_enclitic_host_keeps_two_accents(word):
    """§183c. A proparoxytone or properispomenon takes the enclitic's acute
    onto its own ultima, inside its own token.  124 of the first run's hits."""
    assert 'A6' not in ids(word)


@pytest.mark.parametrize('word', ['ταὑτοῦ', 'αὑτός'])
def test_crasis_keeps_the_rough_of_the_second_word(word):
    """§68a. τοῦ αὐτοῦ -> ταὑτοῦ, with the rough on a non-initial α."""
    assert 'A7' not in ids(word)


@pytest.mark.parametrize('word', ['ἀίδιος', 'ἀίδιον', 'ἀιδιότης', 'Ἅιδης'])
def test_hiatus_puts_the_breathing_on_the_first_vowel(word):
    """§11. In a real diphthong the breathing sits on the SECOND vowel, so a
    breathing on the first is itself the proof that αι is two syllables.
    Bonitz writes it without the diaeresis; 51 of the first run's hits."""
    assert 'C3' not in ids(word)


@pytest.mark.parametrize('word,after', [('ἀγαθὸς', ','), ('ἀλλὰ', ' ... γε')])
def test_grave_stands_before_a_comma_and_before_an_ellipsis(word, after):
    """§154a: usage varies before a comma, so it cannot settle anything.  And
    `...` marks words Bonitz left out — a following word, not a pause."""
    assert 'B2' not in ids(word, after)


@pytest.mark.parametrize('word', ['ἐκ', 'οὐκ', 'οὐχ', 'ἐξ', 'ȣ̓κ', 'κȣ̓κ'])
def test_the_words_that_may_end_in_a_stop(word):
    """§133a, §137 — and κοὐκ, which is καὶ οὐκ by crasis, printed `κȣ̓κ`."""
    assert 'D1' not in ids(word)


@pytest.mark.parametrize('word,after', [("κατ'", ' αὑτό'), ("ἀλλ'", ' ὅταν'),
                                        ('ἀδ', '. ἐν θαλάττῃ')])
def test_elision_and_abbreviation_are_not_word_endings(word, after):
    """§70 elides the ending; an index abbreviates its headword and marks it
    with the stop.  Neither is a word that ends in a stop, and neither has
    lost an accent."""
    assert ids(word, after) & {'D1', 'E1'} == set()


@pytest.mark.parametrize('word,after', [('Ζμδ', ' 5. 678 a31'), ('Οα', '11'),
                                        ('πκγ', ' 4'), ('ΑΒΓ', ' signa')])
def test_sigla_are_labels_not_words(word, after):
    """A work-siglum carries no breathing and no accent by design, so every
    presence rule would fire on it.  `ΑΒΓ` are term-letters, same case."""
    assert ids(word, after) == set()


def test_a_breathing_set_as_its_own_sort_still_counts():
    """This typeface sets the breathing before a capital, so `'Αλκμαίων` is
    Ἀλκμαίων and wants no flag.  `normalize.canonical` folds the same pair."""
    assert 'C1' not in ids("'Αλκμαίων")
    assert 'C1' not in ids('᾽Αμνέα')


@pytest.mark.parametrize('word', ['ȣ̓δεὶς', 'ȣ̔́τω', 'τȣ͂', 'ϗ̀', 'ϗ'])
def test_a_breathed_or_consonantal_ligature_word_is_clean(word):
    """A breathed ȣ-word satisfies §9; ϗ abbreviates καί, consonant-initial,
    so §9 is silent about it with or without its grave. The old form of this
    test also blessed `ȣ́τω` — accent, no breathing — under the claim that the
    book prints such forms as a matter of course. The corpus refuted that
    28:1, John ruled all 192 bare sites on 2026-08-11, and the exemption this
    test was protecting hid 167 reader-lost breathings. Tests are claims;
    that one was wrong and is replaced, not appeased."""
    assert 'C1' not in ids(word)


@pytest.mark.parametrize('word', ['ȣ́τω', 'ȣ͂ς'])
def test_an_accented_unbreathed_ligature_word_is_a_finding(word):
    """The ten accent-without-breathing words are the last open ligature
    class. C1 must SAY so — a rule that abstains on them is the fourth layer
    of absence-rendered-as-clean, relaid."""
    assert 'C1' in ids(word)


@pytest.mark.parametrize('word', ['τε', 'γε', 'τις', 'τινες', 'ἐν', 'εἰς',
                                  'ὡς', 'ἐστι'])
def test_clitics_may_go_unaccented(word):
    """§179, §181."""
    assert 'E1' not in ids(word)


# --------------------------------------------------------------------------
# forms that must flag — every one found in work/reconciled/
# --------------------------------------------------------------------------

@pytest.mark.parametrize('word,rule', [
    ('ȣ̈δὲν', 'A3'),          # 033-L:40,59 — a diaeresis on the ou-ligature
    ('ῥόδόν', 'A6'),          # 036-L:48 — paroxytone: §183c throws it no acute
    ('δίμερῆ', 'A6'),         # 033-L:54 — acute and circumflex together
    ('γίνεταιὁ', 'A7'),       # 028-L:42 — two words run together at a line join
    ('ττȣ̀ςς', 'A8'),         # 052-R:26 — final sigma inside the word
    ('τὰδική', 'B1'),         # 021-L:57 — a grave two syllables from the end
    ('ίτ', 'C1'),             # 019-L:15 — an accented word with no breathing
    ('ίτ', 'D1'),             # 019-L:15 — and it ends in τ
    ('πασχει', 'E1'),         # 040-L — πάσχει with its accent gone
])
def test_the_corpus_hits(word, rule):
    assert rule in ids(word)


@pytest.mark.parametrize('word,rule', [
    ('λόγ' + 'ο' + CIRC + 'ς', 'A1'),     # §169 — ο is short, it cannot
    ('τιμ' + 'ε' + SUBSCRIPT, 'A2'),      # §5 — subscript only under α η ω
    ('λ' + ROUGH + 'όγος', 'A4'),         # §13 — λ takes no breathing
    ('ἁἀτος', 'A5'),                      # two breathings, not on a ῤῥ
    ('λόγ' + 'ο' + ACUTE + ACUTE + 'ς', 'A9'),   # two accents on one letter
    ('κῆρυκος', 'B6'),                    # §149 — circumflex on the antepenult
    ('ὐπό', 'C2'),                        # §10 — initial υ is always rough
    ('α' + ACUTE + 'ι' + SMOOTH + 'ρω', 'C3'),   # §11 — the marks contradict
    ('ρόδον', 'E3'),                      # §13 — initial ρ wants its rough
])
def test_the_impossible_shapes(word, rule):
    """Constructed, because the corpus happens not to contain them — the rules
    are cheap and the classes are real, so they stand as regression tests.

    Every hard rule needs one of these.  Without it a rule whose body was
    replaced by `return None` would pass the whole suite, and the no-flag
    cases above would certify nothing at all.
    """
    assert rule in ids(word)


def test_grave_cannot_stand_before_a_full_stop():
    """§154a — the one direction of the grave/acute question that is decidable
    from the page, so B2 must actually fire on it."""
    assert 'B2' in ids('ἀγαθὸς', '.')
    assert 'B2' not in ids('ἀγαθὸς', ' καὶ')
