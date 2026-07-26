"""A Bekker page beyond the end of the corpus is wrong whatever the siglum says.

Ground truth: the two compositor errors confirmed against the scan on
2026-07-24 — Ηε10. 1835b for 1135, and Πζ5. 1820a for 1320. Both are in
Bonitz's print, not in our reading, so they are recorded rather than repaired.
"""

from bonitz_pipeline.bekker import IMPOSSIBLE, scan


def _all(ranges=False):
    out = []
    for p in range(15, 52):
        for col in ('L', 'R'):
            bad, _ = scan(p, col, ranges)
            out += bad
    return out


def test_finds_both_known_compositor_errors():
    cites = [b['cite'] for b in _all()]
    assert any('1835' in c for c in cites)
    assert any('1820' in c for c in cites)


def test_no_false_positives_without_the_siglum_table():
    """Default mode must stay silent everywhere else — 2 findings, not 103."""
    bad = _all()
    assert len(bad) == 2
    assert all(b['impossible'] and b['bekker'] > IMPOSSIBLE for b in bad)


def test_range_check_is_opt_in():
    """The guessed table is exploratory; it must not fire unless asked."""
    assert len(_all(ranges=False)) < len(_all(ranges=True))
