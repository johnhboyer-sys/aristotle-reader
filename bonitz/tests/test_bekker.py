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


def test_a_four_digit_page_keeps_all_four_digits():
    """⚠ `(\\d{0,3})\\.?` made the period after the book number optional, so the
    book group ate the leading digits of any four-digit page that lacked one.
    `οβ 1352b8` resolved to page 52, `ακ800a` to page 00 — and neither tripped
    the impossible check, because a truncated page is usually still a valid
    page. 116 of 6,134 sigla-bearing citations on 15-62 were validated against
    the wrong page that way.

    A citation WITH the period must keep parsing as before: that is how the two
    known compositor errors above are found at all.
    """
    from bonitz_pipeline.bekker import CITE
    cases = {
        'οβ 1352b8': '1352', 'οβ1347a9': '1347', 'ακ800a15': '800',
        'Ηε10. 1835 b12': '1835', 'Πζ5. 1820a18': '1820',
        'Ζμδ10. 688a3': '688', 'Ηβ2. 1104 b33': '1104',
    }
    for text, page in cases.items():
        m = CITE.search(text)
        assert m, f'{text!r} did not parse at all'
        assert m.group(3) == page, f'{text!r} -> page {m.group(3)}, want {page}'
