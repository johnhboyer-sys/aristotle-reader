"""Two buttons drawing the same picture is a defect in the tool.

`Νικομάχεια` and `Nικομάχεια` differ by one codepoint and render identically
in every face. When `CONFUSABLE` does not hold the pair, `name_letters`
returns nothing and the card offers "keep as printed · Νικομάχεια" above
"read Νικομάχεια" — the same word twice, and no way to tell which is which.
John hit exactly that on 113-L:37 and again on 113-L:7.

The map has been widened three times for this reason and each time it was
widened only to the pairs that had just bitten. The Greek capitals whose
Latin twin is the same piece of type are ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ — this pins the
whole set, so the next card cannot fall through for the same reason.
"""

import pytest

from bonitz_pipeline.settle_review import CONFUSABLE, name_letters

# Greek capital, Latin capital — one sort, two codepoints.
PAIRS = [('Α', 'A'), ('Β', 'B'), ('Ε', 'E'), ('Ζ', 'Z'), ('Η', 'H'),
         ('Ι', 'I'), ('Κ', 'K'), ('Μ', 'M'), ('Ν', 'N'), ('Ο', 'O'),
         ('Ρ', 'P'), ('Τ', 'T'), ('Υ', 'Y'), ('Χ', 'X')]


@pytest.mark.parametrize('greek,latin', PAIRS)
def test_both_halves_of_every_capital_pair_are_named(greek, latin):
    assert greek in CONFUSABLE, f'{greek!r} missing — its button says nothing'
    assert latin in CONFUSABLE, f'{latin!r} missing — its button says nothing'
    assert 'Greek' in CONFUSABLE[greek]
    assert 'Latin' in CONFUSABLE[latin]


@pytest.mark.parametrize('greek,latin', PAIRS)
def test_a_card_on_that_pair_can_tell_the_two_buttons_apart(greek, latin):
    """The real failure: same length, one differing char, and no word for it."""
    a, b = greek + 'ικο', latin + 'ικο'
    assert name_letters(a, b), f'{a!r} vs {b!r} draws two identical buttons'
    assert name_letters(b, a)


def test_the_case_john_hit():
    assert 'Latin' in name_letters('Nικομάχεια', 'Νικομάχεια')
    assert 'Greek' in name_letters('Νικομάχεια', 'Nικομάχεια')
    assert 'Latin' in name_letters('Tὰ', 'Τὰ')
