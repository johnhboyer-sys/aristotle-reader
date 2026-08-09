"""The book-level review page: every site decidable, nothing silently lost.

The rule this file exists to keep is John's: an "unsure" click is a defect in
the tool, not indecision in the reader.  So a site is only fit to be shown when
the crop is placed by matching the line's TEXT — a geometric guess can put the
reader on the wrong line, and being on the wrong line is indistinguishable from
being unsure.

The second rule is dearer: a ruling that is not written down did not happen.
"""

import json
import re

import pytest

from bonitz_pipeline.book_review import (MAX_PAGE_CANDIDATES, findings, html,
                                         page_candidates)

FS = findings()


def test_there_is_a_site_for_every_finding():
    """⚠ THIS TEST USED TO PIN THE NUMBER 27, and 27 stopped being true the
    moment John's six fixes went into the corpus — the remaining 21 are the ones
    he preserved as Bonitz's own errors, and they will disagree with the book
    table for as long as the transcription is diplomatic.

    A count is not the invariant. The invariant is that the page shows every
    finding there is: a finding with no card cannot be ruled on, and would sit
    in the corpus unexamined while the report claimed it had been seen."""
    import json

    from bonitz_pipeline.book_spans import OUT as SPANS, check as book_check
    from bonitz_pipeline.siglum_check import inventory, read, resolve

    cites = read()
    resolve(cites, inventory())
    assert len(FS) == len(book_check(cites, json.loads(
        SPANS.read_text(encoding='utf-8')))), (
        'the page and the check disagree about how many findings there are')


def test_every_crop_is_placed_by_matching_the_line_text():
    """A crop placed by geometry can be the wrong line entirely, and a reader
    cannot tell. Those are the sites that produced 'unsure' clicks before."""
    weak = [(f.col, f.line, f.how) for f in FS if f.how != 'text']
    assert not weak, f'crops not text-matched: {weak}'


def test_every_site_carries_ink_to_rule_on():
    for f in FS:
        assert f.crop, f'{f.col}:{f.line} has no crop'
        assert f.whole, f'{f.col}:{f.line} has no whole-line crop'


def test_every_site_offers_at_least_one_concrete_repair():
    """A button that needs typing is a button John cannot use, so the alternative
    reading has to be named on its face."""
    for f in FS:
        assert f.owner and f.owner != '?', (
            f'{f.col}:{f.line} offers no letter to fix to')


def test_page_candidates_stay_in_the_named_book_and_are_one_digit_away():
    for f in FS:
        for p in f.pages:
            assert f.lo <= p <= f.hi, f'{p} is outside {f.stem}{f.book}'
            a, b = str(f.page), str(p)
            assert len(a) == len(b) and sum(x != y for x, y in zip(a, b)) == 1, (
                f'{p} is not one digit from {f.page}')
        assert len(f.pages) <= MAX_PAGE_CANDIDATES


def test_a_page_candidate_never_changes_the_number_of_digits():
    """`page_candidates` builds strings, so a leading zero would silently make
    1031 into 031 and offer a page that cannot be printed."""
    assert all(len(str(p)) == 4 for p in page_candidates(1031, 1000, 1099))
    assert all(p >= 100 for p in page_candidates(100, 1, 999))


def test_site_ids_are_unique_so_one_click_cannot_overwrite_another():
    ids = [f.sid for f in FS]
    assert len(set(ids)) == len(ids), 'two sites share an id'


def test_the_page_warns_when_it_is_not_being_saved():
    """The POST fails silently on file://. Twenty-seven rulings could be made and
    lost, which is how two finished reviews were lost to a reboot."""
    src = html(FS).read_text(encoding='utf-8')
    assert "location.protocol==='file:'" in src
    assert 'Not being saved' in src


def test_the_page_states_the_conflict_in_words_on_every_card():
    """The crop alone does not say what is wrong with it."""
    src = html(FS).read_text(encoding='utf-8')
    for f in FS[:6]:
        assert f'{f.lo}–{f.hi}' in src, f'{f.col}:{f.line} does not state the span'
    assert src.count('is in book') >= len(FS)
