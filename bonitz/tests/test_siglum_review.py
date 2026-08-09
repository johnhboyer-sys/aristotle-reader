"""The work-level queue: every card offers a reading a reader could actually see.

The rule this file keeps is John's — an "unsure" click is a defect in the tool.
For this queue that means two things at once, and they pull against each other:

    every site must offer at least one candidate      (or there is nothing to click)
    no site may offer a candidate that cannot be right (or the row is noise)

Both failures happened while building it, and each is pinned below.
"""

import pytest

from bonitz_pipeline.siglum_check import inventory
from bonitz_pipeline.siglum_review import (CONFUSIONS, page_candidates,
                                           siglum_candidates, sites, usage)
from bonitz_pipeline.siglum_check import read, resolve

WORKS = inventory()
SS = sites()
_c = read()
resolve(_c, WORKS)
SEEN = usage(_c)


def test_every_site_offers_something_to_click():
    bare = [s.sid for s in SS if not (s.sigla or s.pages)]
    assert not bare, f'sites with no candidate at all: {bare}'


def test_two_iotas_read_as_an_upsilon_is_one_error_not_two():
    """John on the crop at 016-L:32, 2026-08-09: "Clear double iota." The ink
    reads `Ζιι` — Historia animalium, book ι — and our reader wrote `Ζυ`,
    because in this type two adjacent iotas sit exactly where a υ sits.

    One confusion to the eye, two edits to a string. An edit-distance search
    cannot reach it, so the card offered only `Ζι`: the work with no book."""
    got = siglum_candidates('Ζυ', 616, WORKS, SEEN)
    assert 'Ζιι' in got, f'616 is HA book ι and the candidates were {got}'
    assert got[0] == 'Ζιι', 'and it should lead, being the form Bonitz writes'


def test_the_page_still_refuses_the_confusion_where_it_cannot_hold():
    """The same misreading appears at 700b, and there it is NOT `Ζιι` — the
    Historia animalium ends at 638. 700 is De motu, so the only candidate is
    `Ζκ`. Three identical tokens, two different errors, decided by the page."""
    got = siglum_candidates('Ζυ', 700, WORKS, SEEN)
    assert 'Ζιι' not in got, f'HA cannot hold 700: {got}'
    assert got == ['Ζκ']


def test_zeta_upsilon_is_never_a_real_siglum():
    """Bonitz's five Ζ-sigla take the initial of the Greek title — ἱστορίαι,
    γενέσεως, κινήσεως, μορίων, πορείας. No zoological work begins with υ, so
    every Ζυ in the corpus is a misreading and none is a citation to preserve."""
    assert 'Ζυ' not in WORKS
    assert {s for s in WORKS if s.startswith('Ζ')} == {'Ζι', 'Ζγ', 'Ζκ', 'Ζμ',
                                                       'Ζπ'}


def test_the_confusion_table_stays_small():
    """Each entry widens every candidate row. A row full of readings nobody
    would see is the same failure as a row with nothing in it, so pairs earn
    their place by being seen in this type — not by being possible in Greek."""
    assert len(CONFUSIONS) <= 4, 'grown without evidence?'
    for a, b in CONFUSIONS:
        assert a != b and a and b


def test_no_candidate_is_offered_that_the_page_cannot_hold():
    """Every offered reading must be one the page can carry — either because it
    NAMES a work containing the page, or because it is a bare book letter of the
    work that owns the page. `κϛ` is the second kind: κ is περὶ Κόσμου and does
    not hold 946, but the citation is book ϛ of the work Bonitz last named."""
    from bonitz_pipeline.siglum_check import by_page
    for s in SS:
        for c in s.sigla:
            named = [w for w in WORKS if c.startswith(w) and WORKS[w].holds(s.page)]
            assert named or by_page(c, s.page, WORKS), (
                f'{s.sid}: {c!r} is neither a work holding {s.page} nor a book '
                f'letter of the work that does')


def test_page_candidates_are_one_digit_edit_away_in_any_direction():
    """`σ9. 73a` against a work running 973-973 is a lost leading 9, not a
    changed digit — so insertion and deletion count, or the one obviously
    repairable citation in the queue arrives with no button."""
    assert 973 in page_candidates(73, 973, 973)
    assert 1135 in page_candidates(1835, 1094, 1181)   # substitution
    assert all(p >= 100 for p in page_candidates(100, 1, 999))


def test_candidates_are_ranked_by_what_bonitz_actually_writes():
    """Alphabetical order put `πκα` ahead of `πκϛ` and then truncated `πκϛ` off
    the end of the row — the right answer, cut for starting with the wrong
    letter."""
    got = siglum_candidates('πκς', 946, WORKS, SEEN)
    assert 'πκϛ' in got, f'the stigma reading was cut: {got}'
