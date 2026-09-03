"""alphacheck judges the PRINTED order, not the emission order.

`reconciled_headwords` follows LlamaParse's bold runs, which interleave: on
page 63 it emits ἀναπληρȣ͂ν (l.31) before ἀναπιμπλάναι (l.18). The longest-
non-decreasing-subsequence walk judges order, so feeding it that shuffle
manufactured nine "Bonitz order anomalies" on 63-102 that no printed page
carries — they survived a triage and reached John's review page as cards
before the band crops' line numbers exposed the contradiction (2026-08-21).
These tests pin the sort that fixes it.
"""
from bonitz_pipeline import alphacheck


def test_the_manufactured_page_63_violation_is_gone():
    """In print order, ἀναπιμπλάναι (l.18) precedes ἀναπληρȣ͂ν (l.31) and the
    run is alphabetical — nothing on 063-L may be flagged for it."""
    flags = {(v['col'], v['line']) for v in alphacheck.scan([63])}
    assert ('L', 31) not in flags, 'the emission-order artifact is back'


def test_all_nine_manufactured_anomalies_are_gone():
    """The nine sites presented to John as order anomalies on 2026-08-21,
    every one an artifact of the shuffle. None may be flagged again."""
    ghosts = {('page-063-L', 31), ('page-074-R', 12), ('page-077-R', 44),
              ('page-077-R', 53), ('page-091-L', 31), ('page-093-R', 15),
              ('page-093-R', 53), ('page-098-R', 11), ('page-098-R', 33)}
    pages = sorted({int(c[5:8]) for c, _ in ghosts})
    flags = {(f"page-{v['page']:03d}-{v['col']}", v['line'])
             for v in alphacheck.scan(pages)}
    assert not (ghosts & flags), f'manufactured anomalies back: {ghosts & flags}'


def test_the_sweep_still_flags_genuine_order_breaks():
    """The fix must not silence the sweep. The original specimen here was
    063-R:40 (— ἀναπνευστός, a dash sub-lemma out of strict order), but that
    was a line-initial word inside an entry, not a headword, and the
    2026-08-21 headword-detection fix rightly stopped nominating it
    (test_alphacheck_headword_detection.py). The ink-verified genuine order
    breaks stand in for it: αἰφνίδιοι is printed as a real outdented entry
    AFTER αἰχμή on 035-R, ἄμικτος after ἄμιλλα/ἁμιλλᾶσθαι on 050-R — φ
    before χ and κ before λ say both are out of order in the print itself."""
    flags = {(v['page'], v['col'], v['line']) for v in alphacheck.scan([35])}
    assert (35, 'R', 12) in flags
    flags = {(v['page'], v['col'], v['line']) for v in alphacheck.scan([50])}
    assert (50, 'R', 24) in flags
