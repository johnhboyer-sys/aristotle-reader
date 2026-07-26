"""An entry must agree with itself about breathing.

Ground truth: p049-L, where the headword ἀμαρτάνειν is smooth and fourteen
of its own inflections are rough. ἁμαρτάνω is rough, so the headword is the
error — which is why the family votes rather than deferring to the headword.
"""

from bonitz_pipeline.family import breathing_of, scan

ROUGH, SMOOTH = '̔', '̓'


def test_breathing_of():
    assert breathing_of('ἁμαρτάνειν') == ROUGH
    assert breathing_of('ἀμαρτάνειν') == SMOOTH
    assert breathing_of('μυσική') is None


def test_headword_is_not_the_authority():
    """The headword loses to its own inflections when they outnumber it."""
    hits = scan(49, 'L')
    odd = [h for h in hits if h['word'] == 'ἀμαρτάνειν']
    assert odd, 'the smooth headword should be flagged, not its rough family'
    assert odd[0]['expected'] == 'rough'
    assert odd[0]['agree'] > odd[0]['differ']


def test_stays_quiet_elsewhere():
    """Deferring to the headword reported 15; the family vote reports 1."""
    n = sum(len(scan(p, c)) for p in range(15, 52) for c in ('L', 'R'))
    assert n <= 3
