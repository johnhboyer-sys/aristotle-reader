"""A word broken at the measure is not a numeral, whatever its letters spell.

`settle_review` drops a card whose only dispute is ς against ϛ on a NUMERAL
form, because that is a codepoint choice `numeral_fix` settles and not a
question for John. Right rule, and it silently ate a real card.

`τοϛ` at page-117-R:9 reads as a numeral — τ 300, ο 70, ϛ 6 — so the predicate
dropped it. But line 8 ends `κατοικίσαν-`, which makes `τοϛ` the TAIL of
`κατοικίσαντος`: a word continuing over the measure can never be a numeral,
and the stigma closing it is exactly the defect. John went looking for the
card and it was not on the page.

The letters alone cannot tell these apart, so the drop has to ask the line
above. Nothing else about the rule changes: a standalone `πκϛ` is still a
numeral and still goes.
"""

import pytest

from bonitz_pipeline.settle_review import (encoding_only_form_set,
                                           numeral_card_is_a_word_tail)


def test_the_predicate_still_calls_a_bare_numeral_a_numeral():
    assert encoding_only_form_set(('πκς', 'πκϛ')) is True
    assert encoding_only_form_set(('τος', 'τοϛ')) is True


def test_a_tail_continuing_a_hyphenated_word_is_not_a_numeral(tmp_path):
    d = tmp_path / 'sp'; d.mkdir()
    (d / 'page-117-R.txt').write_text(
        '\n'.join(['x'] * 7 + ['βάρȣς f 549. Δρύοπος … κατοικίσαν-',
                               'τοϛ f 441 1550b1. Ἀρκάδων']) + '\n',
        encoding='utf-8')
    assert numeral_card_is_a_word_tail(117, 'R', 9, 'τοϛ', d) is True


def test_a_numeral_that_does_not_continue_anything_stays_droppable(tmp_path):
    d = tmp_path / 'sp'; d.mkdir()
    (d / 'page-117-R.txt').write_text(
        '\n'.join(['x'] * 7 + ['a line ending in a full stop.',
                               'πκϛ 940a18 ἐν τοῖς']) + '\n', encoding='utf-8')
    assert numeral_card_is_a_word_tail(117, 'R', 9, 'πκϛ', d) is False


def test_a_token_that_is_not_first_on_its_line_continues_nothing(tmp_path):
    """The hyphen joins the FIRST token of the next line and no other."""
    d = tmp_path / 'sp'; d.mkdir()
    (d / 'page-117-R.txt').write_text(
        '\n'.join(['x'] * 7 + ['something broken at the mea-',
                               'sure and then πκϛ later']) + '\n',
        encoding='utf-8')
    assert numeral_card_is_a_word_tail(117, 'R', 9, 'πκϛ', d) is False


def test_a_missing_column_answers_no_rather_than_raising(tmp_path):
    d = tmp_path / 'sp'; d.mkdir()
    assert numeral_card_is_a_word_tail(117, 'R', 9, 'τοϛ', d) is False
