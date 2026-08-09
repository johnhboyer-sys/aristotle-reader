"""A crop must never claim more confidence than it has.

Adversarial review by Grok, 2026-08-08, on the fallback added earlier that
day: *"crop_word assigns score 0.9 to pure geometry — false confidence... A
bad geometric crop therefore looks like a strong text match."*  It was right.
`score` had been overloaded to mean two different things, and the review page
warned only below 0.6, so a drifted geometric grid cleared the warning and put
John on a line that was not the one he was ruling.

The rule this file pins:

  score  is the TEXT-match ratio and nothing else.  0.0 when no text was
         matched, whatever method produced the box.
  how    says which method produced it: 'text', 'ink', 'slices', 'mismatch'.

The UI decides what to warn from `how`, so these two must not drift back
together.
"""

import pytest

from bonitz_pipeline.mark_review import _profile, crop_word

# page-033-R is quarantined: kraken produced no PageXML for it, which is why
# John twice clicked "unsure" here before the ink profile existed.
QUARANTINED = ('page-033-R', 20, 'ἀλλοιȣ͂ται')
SEGMENTED = ('page-041-R', 3, 'ἀκροτάτῃ')


def test_a_text_matched_line_says_so_and_scores_itself():
    im, score, how = crop_word(*SEGMENTED)
    assert im is not None
    assert how == 'text'
    assert score > 0.6, 'this column is segmented and should match on text'


def test_a_geometric_crop_never_borrows_a_text_score():
    """The whole finding: geometry used to report 0.9 and look like a match."""
    im, score, how = crop_word(*QUARANTINED)
    assert im is not None, 'the ink profile should still produce a crop'
    assert how == 'ink'
    assert score == 0.0, (
        f'geometry reported a text-match score of {score}. That is the '
        f'false confidence this test exists to prevent — no text was matched.')


def test_the_profile_refuses_a_page_it_cannot_describe():
    """`_profile` divides the text block into exactly n slots, so it is only
    meaningful when the page really is n lines of text.  Asking for a wildly
    wrong n must return nothing rather than a confident wrong grid."""
    assert _profile('page-033-R', 62), 'the true line count should work'
    for absurd in (3, 5, 400, 900):
        assert _profile('page-033-R', absurd) == (), (
            f'the profile accepted {absurd} lines for a 62-line column')


def test_every_how_value_is_one_the_page_knows_how_to_explain():
    """A `how` the UI has no message for would warn about nothing at all."""
    known = {'text', 'ink', 'slices', 'mismatch', 'none'}
    for col, line, word in (SEGMENTED, QUARANTINED):
        assert crop_word(col, line, word)[2] in known


def test_a_missing_column_reports_none_rather_than_a_score():
    im, score, how = crop_word('page-999-Z', 1, 'x')
    assert im is None and score == 0.0 and how == 'none'
