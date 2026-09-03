"""A headword is what STARTS an entry — not any line-initial word bold caught.

Bonitz prints in-entry forms of the lemma and dash sub-lemmata in the same
face as headwords, so LlamaParse's bold nominates fakes, and after the
print-order fix every remaining alphacheck flag but two was one: 12 on
63-102, 4 of the 6 on 15-62 (2026-08-21). The fix reads the print's hanging
indent — entry lines outdent, continuations indent, measured from the
justified RIGHT margin because the left one anchors nothing in a column
dense with one-line entries — from the kraken pair's gt geometry, verified
text-by-text against the corpus, with dash and end-of-clause rules where no
geometry reaches. These tests pin each signal by its live specimen, and pin
the two flags that survived because their lines are genuinely outdented
entries printed out of alphabetical order (ink-verified 2026-08-21).
"""
import pytest

from bonitz_pipeline import alphacheck


@pytest.fixture(scope='module')
def pool():
    """(col, line) -> word for every candidate the sweep now nominates."""
    out = {}
    for p in (16, 35, 41, 50, 52, 56, 63, 73, 78, 80, 91):
        for w, col, ln in alphacheck.reconciled_headwords(p):
            out[(p, col, ln)] = w
    return out


def test_dash_sub_lemmata_are_not_headwords(pool):
    """Bonitz hangs a derivative off its verb with a dash — on the same line
    (— ἀνυστός under ἀνύειν, 080-L:30) or hanging off the previous line's
    end (ἀναπνευστός under ἀναπνεῖν, 063-R:40; ἀκρόθεν under ἄκρος,
    041-R:12). Deliberate placement, not order violations to nominate."""
    assert (80, 'L', 30) not in pool
    assert (63, 'R', 40) not in pool
    assert (41, 'R', 12) not in pool


def test_in_entry_forms_on_indented_lines_are_not_headwords(pool):
    """τὰ μὴ ἀναπνευστικά inside ἀναπνευστικός (063-R:45) and the
    parenthetical variant ἀνυπόδητος inside ἀνυπόδετος (080-L:41) sit on
    continuation lines; the second one used to steal the bold run from the
    real ἀνυπόδητος entry two lines down, which then flagged ἀνυποδησία."""
    assert (63, 'R', 45) not in pool
    assert (80, 'L', 41) not in pool
    assert (80, 'L', 43) in pool        # the real ἀνυπόδητος entry
    assert (80, 'L', 42) in pool        # ἀνυποδησία, no longer indicted


def test_geometry_overrules_a_clean_looking_previous_line(pool):
    """ἀντεστραμμένος (078-R:42) opens its own sub-lemma paragraph after a
    period, and ἀποδεικτικὴ πρότασις (091-L:15) is mid-entry after a
    citation's period — no textual rule sees either, only the indent. 091's
    line is one gt excluded (a numbered line), so this also pins the raw-seg
    recovery path."""
    assert (78, 'R', 42) not in pool
    assert (91, 'L', 15) not in pool


def test_entries_survive_in_a_dense_column(pool):
    """056-R is thick with short entries AND its crop clips the outdent to
    the image edge — the failure mode where a left-margin anchor reads every
    real headword as a continuation and silences the sweep over the whole
    column."""
    for line in (43, 44, 47, 49):       # ἀναίδεια ἀναιδής ἀναιμία ἄναιμος
        assert (56, 'R', line) in pool, f'056-R:{line} lost — recall broken'


def test_entries_survive_a_shallow_outdent(pool):
    """The hand-set indent runs shallow on some pages: 052-L outdents
    ἀμφισβητεῖν by 31 px against the tree-wide ~55. A threshold at the
    tree-wide valley read it as a continuation."""
    assert (52, 'L', 3) in pool


def test_the_unpaired_column_falls_back_to_textual_rules(pool):
    """073-R never paired, so it has no geometry at all. ἄνισον (073-R:9)
    is excluded because its previous line ends mid-clause; the column's real
    headwords stay nominated."""
    assert alphacheck.entry_starts(73, 'R') == {}
    assert (73, 'R', 9) not in pool
    assert any(p == 73 and c == 'R' for p, c, _ in pool)


def test_alto_fallback_sees_a_column_with_no_pagexml():
    """Pages 103-106 have ALTO, not PageXML gt. Line 1 of 104-L continues
    Ἄργος (`Μίτυος …` after 103-R's `ὁ τȣ͂`) — a continuation, not a headword."""
    geo = alphacheck.entry_starts(104, 'L')
    assert geo, 'ALTO fallback must yield geometry, not an empty unknown'
    assert geo[1] is False


def test_absent_geometry_is_unknown_not_settled():
    """`entry_starts` answers only for lines the pair reached; a line it
    cannot see must be absent from the dict, never False — an absence read
    as an answer is how five gates once certified pages they never opened."""
    geo = alphacheck.entry_starts(91, 'L')
    assert geo, 'the paired column must yield geometry'
    assert all(isinstance(v, bool) for v in geo.values())


def test_the_two_genuine_violations_still_flag():
    """αἰφνίδιοι (035-R:12) and ἄμικτος (050-R:24) are outdented spaced-type
    entries in the ink, printed after αἰχμή and ἁμιλλᾶσθαι — genuinely out
    of alphabetical order. Headword detection must not eat the sweep's only
    real findings."""
    flags = {(v['page'], v['col'], v['line'])
             for v in alphacheck.scan([35, 50])}
    assert (35, 'R', 12) in flags
    assert (50, 'R', 24) in flags


def test_the_measured_state_of_both_ranges():
    """The numbers the 2026-08-21 fix was pinned against: no flags on
    63-102, exactly the two ink-verified order breaks on 15-62. A regression
    in either direction — new fakes, or silenced findings — moves these."""
    assert alphacheck.scan(list(range(63, 103))) == []
    v = alphacheck.scan(list(range(15, 63)))
    assert [(x['page'], x['col'], x['line']) for x in v] == \
        [(35, 'R', 12), (50, 'R', 24)]
