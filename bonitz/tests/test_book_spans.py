"""Which book a letter names, settled by measurement rather than assumption.

`siglum_check` knows where a WORK runs and stops there, so `Μδ2. 1031b26` passes:
1031b is inside the Metaphysics, and that is all it can see.  1031b is book Ζ.

Building the missing level needed per-book Bekker spans, which are reference data
— and inventing 48 works' worth of it is the failure this pipeline keeps having
to avoid.  It did not need inventing: `build/dist` already carries the corpus
split by book with its Bekker columns.

⚠ THE PART THAT COULD NOT BE ASSUMED IS WHICH BOOK A LETTER NAMES.  Bonitz runs
three lettering systems and they disagree from book 6 on.  Every system was
scored against every book letter in the corpus before one was chosen:

    PLAIN ALPHABET   α β γ δ ε ζ η θ ι κ    every ordinary work
    ITS OWN SERIES   ΜΑ Μα Μβ … Μν          the Metaphysics, whose books are NAMED
    GREEK NUMERALS   stigma at 6            the Problemata, 38 books, alone

`BOOK_LETTERS` in siglum_check encodes the numeral series, and for every work but
the Problemata it is wrong — stigma displaces ζ and everything after it by one.
It does no damage there, because nothing outside the Metaphysics goes past book
κ, but it must not be reasoned from about which book a letter is.
"""

import json

import pytest

from bonitz_pipeline.book_spans import (META, OUT, PLAIN, TOLERANCE, book_number,
                                        check, derive, series)
from bonitz_pipeline.siglum_check import Cite, inventory, read, resolve

TABLE = json.loads(OUT.read_text(encoding='utf-8'))
WORKS = inventory()


def test_the_metaphysics_second_book_is_alpha_elatton():
    """The whole named-series claim rests on this. Book 2 of the Metaphysics is
    α elatton — five columns, 993a-995a — and not Β. If the table ever numbers
    it as Β, every Metaphysics book after it is off by one."""
    spans = TABLE['spans']['Μ']
    assert spans['α'] == [993, 995], f"Μα is {spans['α']}; α elatton is 993a-995a"
    assert spans['Α'][0] == 980, 'ΜΑ is the first book'
    assert spans['β'][0] == 995, 'Μβ is Β, the third book'
    assert book_number('Μ', 'ν') == 14, 'Μν is the fourteenth book, not the fiftieth'


def test_an_ordinary_work_letters_its_books_by_the_plain_alphabet():
    """ζ is book 6 of the Ethics, not book 7. The numeral series puts stigma at 6
    and displaces everything after it — which scores 49/86 on the Ethics against
    91/97 for the plain alphabet."""
    assert book_number('Η', 'ζ') == 6
    assert series('Η') is PLAIN and series('Μ') is META
    lo, hi = TABLE['spans']['Η']['ζ']
    assert lo <= 1139 <= hi, 'Ηζ2. 1139b9 is EN book 6, per the module docstring'


def test_the_bulk_of_the_corpus_agrees_with_the_table():
    """The guard against a table that is merely self-consistent. If the letter to
    book mapping were wrong, mismatches would run to hundreds rather than dozens
    — and they would cluster on one letter instead of scattering."""
    cites = read()
    resolve(cites, WORKS)
    bad = check(cites, TABLE)
    checked = sum(1 for c in cites
                  if c.book and c.work and c.how in ('explicit', 'inherited')
                  and TABLE['spans'].get(
                      c.work[:-len(c.book)] if c.work.endswith(c.book) else c.work,
                      {}).get(c.book))
    assert checked > 700, f'only {checked} citations were checkable'
    assert len(bad) < checked * 0.06, (
        f'{len(bad)} of {checked} citations disagree with the table — too many to '
        f'be misreadings; suspect the letter-to-book mapping instead')


def test_a_book_our_corpus_does_not_have_is_not_a_finding():
    """The Historia animalium runs to book κ in Bonitz and to book ι in our
    corpus, because book X is held spurious and was not built. `Ζικ6. 637b` is a
    perfectly good citation and must not be reported for want of a span."""
    assert 'κ' not in TABLE['spans']['Ζι'], 'our HA has nine books'
    c = Cite('page-000-L', 1, 'Ζικ6. 637b', 'Ζικ', '6', 637, 'b',
             work='Ζι', book='κ', how='explicit')
    assert check([c], TABLE) == [], 'a book with no span must not be reported'


def test_a_boundary_inside_a_column_is_not_a_finding():
    """Book Β of the Metaphysics ends at 1003a17 and Γ opens at 1003a21, so the
    column 1003a belongs to both and a column-granular span cannot say which.
    `Μγ1. 1002b` misses Γ's first column by one and is not a misreading."""
    assert TOLERANCE >= 1
    c = Cite('page-023-L', 4, 'Μγ1. 1002 b', 'Μγ', '1', 1002, 'b',
             work='Μγ', book='γ', how='explicit')
    assert check([c], TABLE) == []


def test_the_two_specimens_from_the_explainer_are_caught():
    """The entry the explainer is built on carries both, and neither was visible
    to any check before this one."""
    cites = [Cite('page-015-R', 7, 'κ1. 1050a', 'κ', '1', 1050, 'a',
                  work='Μκ', book='κ', how='inherited'),
             Cite('page-015-R', 12, 'Μδ2. 1031b', 'Μδ', '2', 1031, 'b',
                  work='Μδ', book='δ', how='explicit')]
    bad = check(cites, TABLE)
    assert len(bad) == 2, f'caught {len(bad)} of 2'
    assert {t[4] for t in bad} == {'θ', 'ζ'}, 'and it names the book the page is in'


def test_the_table_regenerates_to_what_is_committed():
    """The file is derived, so it must not drift from its source."""
    assert derive()['spans'] == TABLE['spans']
