"""A primary archive translation can take its column breaks from its anchors.

Without `anchor_cuts`, build_english cuts each chapter across its columns in
proportion to the Greek, and the anchors only pin gutter ticks inside those
proportional chunks. With it, a `{column}1` anchor is where that column's
English begins (Lin: Joachim's printed column marks, checked against the Greek).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from aristotle_pipeline import stage1_archive

PROSE = ("<p>Part 1</p>\n<p>Alpha one is the first sentence here. Alpha two is short. "
         "Beta one opens the second column. Beta two. Beta three. Beta four ends it.</p>\n")
ANCHORS = '- bekker: "1b1"\n  at: "Alpha two is short."\n- bekker: "1b5"\n  at: "Beta three."\n'


def _spine():
    col = lambda c: {"id": f"1:{c}", "book": 1, "column": c,
                     "lines": [{"n": n, "text": "λόγος"} for n in range(1, 11)]}
    return {"segments": [col("1a"), col("1b")]}


def _build(tmp_path, monkeypatch, anchors=ANCHORS, spine=None, **flags):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    (tmp_path / "tst" / "anchors.yaml").write_text(anchors, encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    cfg = {"id": "tst", "name": "Test", "dir": "tst", "books": 1, "chapter_marker": "part",
           "anchors": "tst/anchors.yaml", **flags}
    chapters = [{"book": 1, "chapter": "1", "column": "1a", "line": 1}]
    eng = stage1_archive.build_english(SimpleNamespace(work_id="TST"), spine or _spine(),
                                       chapters, cfg)
    return {c["column"]: c for c in eng["chunks"]}


def test_proportional_without_the_flag(tmp_path, monkeypatch):
    chunks = _build(tmp_path, monkeypatch)
    assert not chunks["1b"]["text"].startswith("Alpha two")


def test_anchor_cuts_column_at_its_line_one(tmp_path, monkeypatch):
    chunks = _build(tmp_path, monkeypatch, anchor_cuts=True)
    assert chunks["1a"]["text"] == "Alpha one is the first sentence here."
    assert chunks["1b"]["text"].startswith("Alpha two is short.")
    # Both anchors resolve to real ticks in their own column.
    ticks = {t["n"]: t for t in chunks["1b"]["bekker"] if t["real"]}
    assert ticks[1]["offset"] == 0
    assert chunks["1b"]["text"][ticks[5]["offset"]:].startswith("Beta three.")


# A column break that cannot be placed where its anchor says must stop the
# build, not fall back to the proportional cut and print a count.
@pytest.mark.parametrize("anchors", [
    '- bekker: "1b1"\n  at: "Beta"\n',                     # four places: ambiguous
    '- bekker: "1b1"\n  at: "Gamma never appears"\n',      # not in the prose
    '- bekker: "1b1"\n  at: "Alpha one is the first"\n',   # at offset 0: no cut there
])
def test_a_break_that_cannot_be_placed_raises(tmp_path, monkeypatch, anchors):
    with pytest.raises(ValueError, match="1b1"):
        _build(tmp_path, monkeypatch, anchors=anchors, anchor_cuts=True)


# Rh. Al. 1420b opens at line 5, under the last lines of the Rhetoric: the
# column has no line 1, so its break is the entry marked `cut: true`.
def _spine_b_from_5():
    s = _spine()
    s["segments"][1]["lines"] = [{"n": n, "text": "λόγος"} for n in range(5, 11)]
    return s


def _build_b5(tmp_path, monkeypatch, anchors):
    return _build(tmp_path, monkeypatch, anchors=anchors, spine=_spine_b_from_5(), anchor_cuts=True)


def test_a_column_opening_below_line_one_cuts_at_its_marked_entry(tmp_path, monkeypatch):
    chunks = _build_b5(tmp_path, monkeypatch,
                       '- bekker: "1b5"\n  at: "Beta one opens"\n  cut: true\n')
    assert chunks["1a"]["text"].endswith("Alpha two is short.")
    assert chunks["1b"]["text"].startswith("Beta one opens the second column.")


def test_an_unmarked_entry_below_line_one_does_not_cut(tmp_path, monkeypatch):
    chunks = _build_b5(tmp_path, monkeypatch, '- bekker: "1b5"\n  at: "Beta one opens"\n')
    assert not chunks["1b"]["text"].startswith("Beta one opens")


# Another work's alignment map may hold a certain anchor on a column's first
# spine line. Only an anchors-file entry marked `cut: true` may cut there, so
# build_chunks must cut such a column as main does (Codex, 2026-11-06).
def test_an_alignment_anchor_below_line_one_does_not_cut():
    from aristotle_pipeline import stage1_ross
    prose = {(1, 1): "Alpha one. Beta one. Beta two. Beta three. Beta four."}
    amap = {"1:1": {"anchors": [{"citation": "1b5", "offset": 11, "confidence": "certain"}]}}
    chapters = [{"book": 1, "chapter": "1", "column": "1a", "line": 1}]
    pieces = stage1_ross.build_chunks(_spine_b_from_5(), chapters, prose, amap)
    assert not pieces["1:1b"][0]["text"].startswith("Beta one.")
