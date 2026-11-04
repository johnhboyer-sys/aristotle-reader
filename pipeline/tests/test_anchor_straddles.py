"""An anchor whose phrase the proportional column cut moved out of its column.

_resolve_anchors looks for each phrase in the chunk of its own Bekker column.
When a text edit shifts the proportional cuts, a phrase can straddle a cut or
slip wholly into the neighbouring column (DA 410b30, Mirab 844b5, Phgn 814a5,
Pol 1314a1 after the 2026-11-03 English corrections). A tick always lands in
its own column, and only where the line truly is: inside it, at its start for
line 1, at its end for a line spilled forward.
"""

from __future__ import annotations

import pytest

from aristotle_pipeline import stage1_archive, stage1_english


def _chunks(*texts):
    cols = ["1a", "1b", "2a"]
    return [{"id": f"1:{c}", "book": 1, "column": c, "text": t} for c, t in zip(cols, texts)]


def _resolve(tmp_path, monkeypatch, chunks, bekker, at, *more):
    pairs = [(bekker, at), *zip(more[::2], more[1::2])]
    (tmp_path / "anchors.yaml").write_text(
        "".join(f'- bekker: "{b}"\n  at: "{a}"\n' for b, a in pairs), encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    return stage1_archive._resolve_anchors("anchors.yaml", chunks)


def test_phrase_inside_its_column(tmp_path, monkeypatch):
    chunks = _chunks("One two. Three four.", "Five six seven eight. Nine ten.", "Eleven.")
    assert _resolve(tmp_path, monkeypatch, chunks, "1b5", "Nine ten.") == {"1:1b": [(5, 22)]}


def test_line_one_slipped_into_the_previous_column(tmp_path, monkeypatch):
    # Pol 1314a1: the cut put the words that open 1b at the end of 1a. Line 1
    # is the column's start, not its end (where the old fallback put it).
    chunks = _chunks("Alpha one. Beta two three four five six.", "Gamma seven eight.", "Delta.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1b1", "Beta two three four five six.")
    assert got == {"1:1b": [(1, 0)]}


def test_line_one_straddling_the_cut_before_its_column(tmp_path, monkeypatch):
    chunks = _chunks("Alpha one. Beta two three four.", "[Five six seven.] Eight.", "Delta.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1b1", "Beta two three four. [Five six")
    assert got == {"1:1b": [(1, 0)]}


@pytest.mark.parametrize("at", ["Beta two three four five six.",     # Phgn 814a5
                                "Beta two three four five six. Gamma"])  # Mirab 844b5
def test_later_line_in_the_previous_column_stays_unresolved(tmp_path, monkeypatch, capsys, at):
    # Pinned at offset 0 it would land on line 1's tick and vanish; unresolved,
    # it keeps its interpolated tick.
    chunks = _chunks("Alpha one. Beta two three four five six.", "Gamma seven eight.", "Delta.")
    assert _resolve(tmp_path, monkeypatch, chunks, "1b5", at) == {}
    assert "1 unresolved: ['1b5']" in capsys.readouterr().out


def test_phrase_straddling_the_cut_after_it_starts(tmp_path, monkeypatch):
    # DA 410b30: the phrase starts in its own column, and even its first four
    # words run past the cut, so no prefix is found in either chunk alone.
    chunks = _chunks("Alpha one. Beta the winds.", "Now this cannot happen. Gamma.", "Delta.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1a30", "the winds. Now this cannot happen.")
    assert got == {"1:1a": [(30, 16)]}


def test_phrase_slipped_into_the_next_column(tmp_path, monkeypatch):
    # An end-of-column line whose sentence the cut spilled forward keeps the
    # old rule: the last sentence boundary of its own column.
    chunks = _chunks("Alpha one. Beta two.", "Gamma three four five six. Delta.", "Eps.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1a38", "Gamma three four five six.")
    assert got == {"1:1a": [(38, 11)]}


def test_neighbours_in_another_book_are_not_searched(tmp_path, monkeypatch):
    chunks = _chunks("Alpha one. Beta two three four five.", "Gamma.", "Delta.")
    chunks[1]["book"] = 2
    chunks[1]["id"] = "2:1b"
    got = _resolve(tmp_path, monkeypatch, chunks, "1b5", "Beta two three four five.")
    assert got == {}


def test_a_pin_yields_to_a_tick_found_at_its_offset(tmp_path, monkeypatch, capsys):
    # Pol 1257b: the column opens with line 5's own words. Line 1's pin at
    # offset 0 would take that place in the gutter and hide line 5.
    chunks = _chunks("Alpha one. Beta two three four.", "Gamma five six. Delta.", "Eps.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1b1", "Beta two three four.",
                   "1b5", "Gamma five six.")
    assert got == {"1:1b": [(5, 0)]}
    assert "1 unresolved: ['1b1']" in capsys.readouterr().out


def test_a_pin_yields_to_line_order(tmp_path, monkeypatch, capsys):
    # Pol 1282a: the last sentence boundary falls before line 35's own words,
    # so pinning line 40 there would read 35 after 40.
    chunks = _chunks("Alpha one. Beta two three four.", "Gamma five six seven.", "Eps.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1a35", "two three four.",
                   "1a40", "Gamma five six seven.")
    assert got == {"1:1a": [(35, 16)]}
    assert "1 unresolved: ['1a40']" in capsys.readouterr().out


def test_a_pin_yields_to_a_found_tick_for_its_own_line(tmp_path, monkeypatch, capsys):
    # Two anchors for one line: the one found in place wins.
    chunks = _chunks("Alpha one. Beta two three four.", "Gamma five six seven.", "Eps.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1a40", "two three four.",
                   "1a40", "Gamma five six seven.")
    assert got == {"1:1a": [(40, 16)]}
    assert "1 unresolved: ['1a40']" in capsys.readouterr().out


def test_a_pin_yields_to_an_earlier_pin(tmp_path, monkeypatch, capsys):
    # Two lines spilled into the next column would claim one sentence boundary.
    chunks = _chunks("Alpha one. Beta two.", "Gamma three four five. Delta six seven eight.", "Eps.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1a35", "Gamma three four five.",
                   "1a40", "Delta six seven eight.")
    assert got == {"1:1a": [(35, 11)]}
    assert "1 unresolved: ['1a40']" in capsys.readouterr().out


def test_the_gutter_keeps_a_found_tick_at_the_column_start():
    # Pol 1257b: the column opens with line 5's words. The gutter's default
    # line-1 tick at offset 0 must not hide it.
    english = {"chunks": [{"id": "1:1b", "text": "Gamma five six. " * 40}],
               "_line_ms": {"1:1b": [(5, 0)]}}
    spine = {"segments": [{"id": "1:1b", "lines": [{"n": n} for n in range(1, 41)]}]}
    stage1_english.add_bekker_gutter(english, spine, dense=True)
    first = english["chunks"][0]["bekker"][0]
    assert first == {"n": 5, "offset": 0, "real": True}


def test_the_gutter_keeps_a_mid_column_start_line():
    # Rhet 1404a: the book begins at line 6 and a milestone gives line 1 at
    # offset 0. Line 6 still anchors the column's start for the estimates.
    english = {"chunks": [{"id": "3:1404a", "text": "word " * 600}],
               "_line_ms": {"3:1404a": [(1, 0), (20, 1400)]}}
    spine = {"segments": [{"id": "3:1404a", "lines": [{"n": n} for n in range(6, 40)]}]}
    stage1_english.add_bekker_gutter(english, spine)
    ten = next(t for t in english["chunks"][0]["bekker"] if t["n"] == 10)
    assert ten["offset"] == 400  # 4/14 of the way from line 6 at 0 to line 20 at 1400


def test_across_a_cut_the_whole_phrase_must_match(tmp_path, monkeypatch):
    # A four-word prefix repeated in the previous column must not stand in for
    # a phrase the text no longer has.
    chunks = _chunks("Alpha beta gamma delta unrelated.", "Start. Alpha beta",
                     "gamma delta missing ending.")
    got = _resolve(tmp_path, monkeypatch, chunks, "1b1", "Alpha beta gamma delta expected ending.")
    assert got == {}


@pytest.mark.parametrize("at", ["Nowhere in the text at all.", "Delta."])
def test_phrase_absent_or_beyond_the_neighbours(tmp_path, monkeypatch, capsys, at):
    # "Delta." is two columns away from 1a: too far to be a cut's doing.
    chunks = _chunks("Alpha one. Beta two.", "Gamma three.", "Delta.")
    assert _resolve(tmp_path, monkeypatch, chunks, "1a5", at) == {}
    assert "1 unresolved: ['1a5']" in capsys.readouterr().out
