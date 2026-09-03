"""A corrigendum needs BOTH halves, and the card could only record one.

`corrigenda_for` banks a `preserve` only when the entry carries a proposal
that differs from the standing form — deliberately, since banking every
preserve once put 373 entries in the register whose "correction" was
identical to what was printed, and an erratum that corrects nothing hides the
ones that do.

The siglum corrigenda carry no proposal, because Bonitz's key gives WORK
Bekker ranges and not per-book ones: nothing in it can say whether 1374a is
`Ρα` or `Ρβ`. Of thirty findings exactly one derives mechanically. So John
supplies the correction — he read `Λγ13. 78b` off the crop and said the ink
is Λ but the letter should be Α — and until now the card had nowhere to put
it. Keeping as printed banked nothing at all.

The typed READING escape is the wrong shape for this: it records an `accept`,
changing the corpus, and he is not disputing the reading. This is a second
field that records `preserve` PLUS the emendation.
"""

import json

import pytest

from bonitz_pipeline import settle_apply as sa
from bonitz_pipeline import settle_review as sr


def _step(**kw):
    base = dict(page=58, col='L', line=26, sid='corrigendum:x',
                verdict='preserve', printed='Λγ13. 78b', becomes='Λγ13. 78b',
                proposal='')
    base.update(kw)
    return base


def test_a_preserve_with_no_correction_banks_nothing():
    """The guard that stopped 373 empty entries must keep standing."""
    assert sa.corrigenda_for([_step()]) == []


def test_a_preserve_carrying_the_correction_banks_both_halves():
    got, = sa.corrigenda_for([_step(proposal='Αγ13. 78b')])
    assert got['printed'] == 'Λγ13. 78b'
    assert got['correct'] == 'Αγ13. 78b'


def test_a_correction_identical_to_the_printed_form_is_not_a_correction():
    assert sa.corrigenda_for([_step(proposal='Λγ13. 78b')]) == []


def test_the_ruling_correction_outranks_the_queue_proposal():
    """John read the crop; a queue-derived guess did not.

    Where both exist his typed correction wins, or the sitting cannot overrule
    a proposal the builder got wrong.
    """
    assert sa.correction_for({'correction': 'Αγ13. 78b'}, 'Ζγ13. 78b') \
        == 'Αγ13. 78b'
    assert sa.correction_for({}, 'Ζγ13. 78b') == 'Ζγ13. 78b'
    assert sa.correction_for({'correction': '  '}, 'Ζγ13. 78b') == 'Ζγ13. 78b'


def test_only_a_corrigendum_card_offers_the_correction_field():
    """Four other sittings are live; they must render exactly as before."""
    def member(kind):
        return sr.Member(page=58, col='L', line=26, word_off=1, char_at=1,
                         readers={}, kind=kind, reason='')
    corr = sr.Card(form_set=('Λγ13. 78b',), printed='Λγ13. 78b',
                   sid_override='corrigendum:page-058-L:26')
    corr.members.append(member('corrigendum'))
    plain = sr.Card(form_set=('a', 'b'), printed='a',
                    sid_override='accent:page-058-L:26')
    plain.members.append(member('accent'))
    assert sr.wants_correction(corr) is True
    assert sr.wants_correction(plain) is False
