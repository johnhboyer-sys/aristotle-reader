"""A line the segmenter never found — in the corpus, never in the reader.

John, 2026-08-28: "Add the 215L line to the corpus, but not to Kraken."

A reader's file is testimony: what that engine saw. Typing a line into it makes
kraken appear to have read something it did not, and the panel counts a vote
that does not exist — the two LlamaParse variants manufactured a majority out
of one opinion once already. The corpus is the edited text, and a line Bonitz
printed belongs there whoever noticed it, so long as the record says who.
"""

from __future__ import annotations

import json

import pytest

from bonitz_pipeline import segmenter_gaps as sg


def _rec(tmp_path, stem, **body):
    (tmp_path / f'{stem}.json').write_text(
        json.dumps({'column': stem, **body}, ensure_ascii=False),
        encoding='utf-8')
    return tmp_path


def test_the_missing_line_goes_back_where_it_was(tmp_path):
    root = _rec(tmp_path, 'page-215-L', gaps=[
        {'before_line': 60, 'text': 'δολοφονία Ηε5. 1131a7.'}])
    lines = [f'line {i}' for i in range(1, 61)]
    out = sg.apply_gaps('page-215-L', lines, root)
    assert len(out) == 61
    assert out[59] == 'δολοφονία Ηε5. 1131a7.'
    assert out[58] == 'line 59' and out[60] == 'line 60'


def test_two_gaps_land_on_their_final_line_numbers(tmp_path):
    """`before_line` is the line number the text will HAVE once filled, so the
    inserts run top down. Bottom-up looks like the safe direction and lands the
    second gap past the end."""
    root = _rec(tmp_path, 'page-001-L', gaps=[
        {'before_line': 2, 'text': 'B'}, {'before_line': 5, 'text': 'E'}])
    out = sg.apply_gaps('page-001-L', ['A', 'C', 'D', 'F'], root)
    assert out == ['A', 'B', 'C', 'D', 'E', 'F']


def test_a_record_that_has_drifted_from_the_text_refuses(tmp_path):
    root = _rec(tmp_path, 'page-001-L', gaps=[
        {'before_line': 99, 'text': 'x'}])
    with pytest.raises(ValueError, match='drifted apart'):
        sg.apply_gaps('page-001-L', ['A', 'B'], root)


def test_a_short_column_with_nothing_recorded_is_named(tmp_path):
    """An unapplied note is worthless — a short column shifts every position
    after it against every other reader, and nothing downstream says so."""
    txt = tmp_path / 'txt'; txt.mkdir()
    (txt / 'page-215-L.txt').write_text('x\n' * 60, encoding='utf-8')
    bad = sg.check(['page-215-L'], txt, 61, tmp_path / 'gaps')
    assert bad and '1 short' in bad[0]


def test_a_recorded_gap_explains_the_short_column(tmp_path):
    txt = tmp_path / 'txt'; txt.mkdir()
    (txt / 'page-215-L.txt').write_text('x\n' * 60, encoding='utf-8')
    root = _rec(tmp_path, 'page-215-L', gaps=[
        {'before_line': 60, 'text': 'δολοφονία Ηε5. 1131a7.'}])
    assert sg.check(['page-215-L'], txt, 61, root) == []


def test_short_and_correct_is_a_thing_the_check_can_be_told(tmp_path):
    """Four pages of 118-281 open a letter section: the display capital stands
    in a band with no body text in EITHER column. 134 is simply a 60-line page.
    Without a way to say so the check cries wolf on ten columns forever and the
    eleventh stops being visible."""
    txt = tmp_path / 'txt'; txt.mkdir()
    (txt / 'page-144-L.txt').write_text('x\n' * 57, encoding='utf-8')
    root = _rec(tmp_path, 'page-144-L', gaps=[], short_by_design=57)
    assert sg.check(['page-144-L'], txt, 61, root) == []
    # and it is the COUNT that is blessed, not the column
    (txt / 'page-144-L.txt').write_text('x\n' * 55, encoding='utf-8')
    assert sg.check(['page-144-L'], txt, 61, root)


def test_the_recorded_215L_gap_is_real_and_carries_its_provenance():
    """The one line in 118-281 that kraken missed. It names who read it,
    because an Opus reading of a cold tranche is not a blind one."""
    gaps = sg.gaps_for('page-215-L')
    assert len(gaps) == 1
    g = gaps[0]
    assert g['before_line'] == 60
    assert g['text'] == 'δολοφονία Ηε5. 1131a7.'
    assert 'Opus' in g['read_by'] and 'John' in g['authorised_by']
    assert 'OPUS HAS NOW SEEN THIS LINE' in g['note']


def test_the_reader_file_still_says_what_kraken_saw():
    """The whole point of the split: 215-L's kraken text stays at 60 lines."""
    from pathlib import Path
    p = (sg.ROOT / 'work' / 'kraken15-102' / 'txt118-281' / 'page-215-L.txt')
    if not p.exists():
        pytest.skip('tranche not read here')
    lines = p.read_text(encoding='utf-8').splitlines()
    assert len(lines) == 60
    assert 'δολοφονία' not in '\n'.join(lines)
