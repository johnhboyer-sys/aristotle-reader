"""Readers that agree can be wrong together, and over `ȣ` they usually are.

The worry, carried since the 052-R `ὁποτερȣ͂` case: two readers agreeing are
right 96.3% of the time, but their failures are not independent — they share a
training diet, and the mark over the ou-ligature is the character they both
lose. An agreement built out of two blind readers settles a dispute nobody
looked at.

A word-initial vowel takes a breathing. So a settled winner beginning with a
bare ligature is the signature of that shared failure — and it must go to John
rather than be corrected, because a compositor really can drop a breathing and
only the ink says which happened.

Measured over pages 53-62 after the segmentation fix: it does not happen. The
guard would have been speculation. This test is what keeps it that way.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline.settle import settle_words
from bonitz_pipeline.word_flags import words

LIGATURES = 'ȣȢ'
FLAGS = (Path(__file__).resolve().parent.parent
         / 'work' / 'flags5-053-062-filtered.jsonl')


def initial_bare_ligature(form: str) -> bool:
    """A word opening on `ȣ` with no breathing over it."""
    d = unicodedata.normalize('NFD', form)
    if not d or d[0] not in LIGATURES:
        return False
    return not any(unicodedata.combining(c) for c in d[1:3])


def test_the_probe_fires():
    """⚠ A check that matches nothing reports nothing, and looks exactly like a
    check that finds nothing. Six arbitrators in this project failed that way."""
    assert initial_bare_ligature('ȣκ')
    assert not initial_bare_ligature('ȣ̓κ')
    assert not initial_bare_ligature('τȣ')      # medial: no breathing expected
    assert not initial_bare_ligature('ȣ̔́τως')


@pytest.mark.skipif(not FLAGS.exists(), reason='no filtered flags yet')
def test_no_word_opens_on_an_unbreathed_ligature_by_machine():
    report = settle_words(words(FLAGS))
    settled = [(s.word.page, s.word.col, s.word.word_off, s.winner,
                s.authority)
               for s in report.settled if initial_bare_ligature(s.winner)]
    assert not settled, (
        f'{len(settled)} sites were settled to a word-initial ligature with no '
        f'breathing. Either the readers agreed on a mark they both lost, or '
        f'Bonitz dropped one — and only the crop can say which. Send them to a '
        f'card: {settled[:5]}')

    # …and the ones that DO carry the question are still being asked, so the
    # emptiness above is a clean bill of health and not an empty index.
    asked = [s for s in report.refused
             if any(initial_bare_ligature(f) for f in s.word.readers.values())]
    assert len(asked) == 26, len(asked)
