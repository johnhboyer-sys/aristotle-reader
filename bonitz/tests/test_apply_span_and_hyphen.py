"""Two rehearsal skips that were the applier's fault, not the rulings'.

John ruled all 21 cards of the script sitting `accept`. The rehearsal wrote 17
and refused 4, and every one of the four was a defect here.

A SPAN IS MEASURED IN THE FOLD, BECAUSE THE OFFSETS ARE. `_overlapping` fell
back to `len(step['printed'])` — the RAW length, spaces and all — while
`word_off` counts the whitespace-free `canonical` stream. `I ερὶ πνεύματος`
is 15 raw and 13 folded, so its span ran 755..770 and collided with the card
at 768, which merely ABUTS it. Both rulings were thrown away to protect an
overlap that does not exist. The same mistake has been fixed once before, at
the write, where the comment reads "span measured in the fold".

THE COLUMN FOLD DROPS A LINE-FINAL HYPHEN. `canonical` joins a word broken at
the measure, so page-114-L holds `Sοp…` where the printed line ends `Sο-`.
Hunting the raw `Sο-` in that stream finds nothing and `_anchor` answers
`no_anchor` — which is why `site_queue.anchor` matches through the PRINTED
LINE instead. The search must drop the hyphen exactly as the stream did; the
WRITE still puts down the ruled spelling, hyphen and all, as it always has.
"""

import pytest

from bonitz_pipeline import settle_apply as sa
from bonitz_pipeline.normalize import canonical


def _step(off, printed, becomes):
    return {'verdict': 'accept', 'word_off': off, 'printed': printed,
            'becomes': becomes, 'member': f'page-111-R:0:{off}'}


def test_abutting_spans_do_not_collide():
    """755+13 == 768: the two touch, and touching is not overlapping."""
    a = _step(755, 'I ερὶ πνεύματος', 'Περὶ πνεύματος')
    b = _step(768, 'coHIenettt o br', 'commentatio libri')
    assert sa._overlapping([a, b]) == []


def test_a_span_still_collides_when_it_genuinely_does():
    a = _step(755, 'I ερὶ πνεύματος', 'Περὶ πνεύματος')
    b = _step(760, 'πνεύματος', 'πνεύματος!')
    assert len(sa._overlapping([a, b])) == 2


def test_the_raw_length_is_what_made_them_collide():
    """Guards the fix: 15 raw against 13 folded is the whole difference."""
    printed = 'I ερὶ πνεύματος'
    assert len(printed) == 15
    assert len(canonical(printed)[0]) == 13


def test_a_target_ending_in_a_line_division_hyphen_still_anchors():
    """The stream joined the word; the search must join it too."""
    stream = 'xxxSοphisticosyyy'
    assert sa._anchor(stream, 3, 'Sο-', 3) == 3


def test_the_recorded_offset_is_still_trusted_when_it_holds():
    """Uniqueness governs the DRIFT SEARCH, not an offset that still matches.

    That is the pre-existing contract and the hyphen drop must not change it:
    the offset came from a queue whose anchor was verified against the printed
    line.
    """
    stream = 'Sοa' * 2
    assert sa._anchor(stream, 0, 'Sο-', 3) == 0
    assert sa._anchor(stream, 3, 'Sο-', 3) == 3


def test_dropping_the_hyphen_must_not_make_a_DRIFTED_match_ambiguous():
    """Two candidates in the window is not an anchor, it is a guess."""
    stream = 'zzSοaSοazz'
    # nothing at the recorded offset, and two candidates once the hyphen goes
    assert sa._anchor(stream, 0, 'Sο-', 10) is None


def test_a_hyphen_inside_a_word_is_not_a_line_division():
    """`a10-13` is one printed token; nothing here may join it up."""
    stream = 'xxa10-13yy'
    assert sa._anchor(stream, 2, 'a10-13', 6) == 2


def test_the_write_leaves_the_line_division_hyphen_where_it_is():
    """`Sο-` → `So-` changes one letter; the hyphen is not ours to move.

    The stream dropped the hyphen when it joined the broken word, so the span
    the applier measures must drop it too — and then what is written must drop
    it as well, or `So-` lands on `Sο` and the raw text ends up `So--`.
    """
    assert sa._hyphen_pair('Sο-', 'So-') == ('Sο', 'So')
    assert sa._hyphen_pair('De1on-', 'De lon-') == ('De1on', 'De lon')


def test_a_pair_that_does_not_both_end_in_a_hyphen_is_left_alone():
    """A ruling that DELETES the hyphen is a real edit and must still happen."""
    assert sa._hyphen_pair('foo-', 'foo') == ('foo-', 'foo')
    assert sa._hyphen_pair('foo', 'foo-') == ('foo', 'foo-')


def test_a_ruling_that_changes_the_line_final_hyphen_covers_it():
    """`διαιρέσεσιν-` → `διαιρέσεσιν·` must write OVER the hyphen, not beside it.

    The two hyphen cases pull in opposite directions and the applier needs
    both. When printed and becomes BOTH end in one — `Sο-` → `So-` — the mark
    is not part of the edit and `_hyphen_pair` drops it from each side, so the
    span stops short of it and it stays put. When only PRINTED ends in one,
    the mark IS the edit: an ano teleia was read as a hyphen, and the span has
    to reach it or the write lands one character short and the base check
    refuses the whole ruling.
    """
    assert sa._covers_hyphen('διαιρέσεσιν-', 'διαιρέσεσιν·') is True
    assert sa._covers_hyphen('Sο-', 'So-') is False        # _hyphen_pair's case
    assert sa._covers_hyphen('foo', 'foo!') is False        # no hyphen at all


def test_a_finished_edit_with_a_space_in_it_reports_already():
    """The bug that ate a hyphen: rerunning `— Po--` → `— Po-` gave `— Po`.

    `_is_already` compared `stream[pos:pos + len(surf)]` — a RAW length — with
    the FOLDED `surf`. `canonical` drops the space, so a target containing one
    is shorter folded than raw, the slice never matches, the guard says "not
    done", and the edit runs a second time on its own output. Third instance
    of this exact confusion after `_overlapping` and the write span.
    """
    text = 'x (?). — Po-\nlitica y'
    out, status = sa._apply_one(
        {'verdict': 'accept', 'printed': '— Po--', 'becomes': '— Po-',
         'word_off': 5, 'member': 'page-115-R:52:0'}, text, len(text), {})
    assert status == 'already', status
    assert out == text
