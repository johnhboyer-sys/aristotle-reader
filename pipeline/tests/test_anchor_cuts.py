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


def _build(tmp_path, monkeypatch, anchors=ANCHORS, **flags):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    (tmp_path / "tst" / "anchors.yaml").write_text(anchors, encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    cfg = {"id": "tst", "name": "Test", "dir": "tst", "books": 1, "chapter_marker": "part",
           "anchors": "tst/anchors.yaml", **flags}
    chapters = [{"book": 1, "chapter": "1", "column": "1a", "line": 1}]
    eng = stage1_archive.build_english(SimpleNamespace(work_id="TST"), _spine(), chapters, cfg)
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


# De Plantis: Bekker's 815b opens at line 10 (a translator's prologue fills
# lines 1-9 above the work), so the column has no line 1. Its cut is the
# anchor at the column's first spine line.
def test_anchor_cuts_column_whose_first_line_is_not_one(tmp_path, monkeypatch):
    spine = _spine()
    for ln in spine["segments"][1]["lines"]:
        ln["n"] += 9                                   # 1b runs 10..19
    monkeypatch.setattr(globals()["stage1_archive"], "SOURCES_DIR", tmp_path)
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    (tmp_path / "tst" / "anchors.yaml").write_text(
        '- bekker: "1b10"\n  at: "Alpha two is short."\n- bekker: "1b15"\n  at: "Beta three."\n',
        encoding="utf-8")
    cfg = {"id": "tst", "name": "Test", "dir": "tst", "books": 1, "chapter_marker": "part",
           "anchors": "tst/anchors.yaml", "anchor_cuts": True}
    chapters = [{"book": 1, "chapter": "1", "column": "1a", "line": 1}]
    eng = stage1_archive.build_english(SimpleNamespace(work_id="TST"), spine, chapters, cfg)
    chunks = {c["column"]: c for c in eng["chunks"]}
    assert chunks["1a"]["text"] == "Alpha one is the first sentence here."
    assert chunks["1b"]["text"].startswith("Alpha two is short.")


def test_a_mid_column_entry_is_not_a_cut(tmp_path, monkeypatch):
    # 1b5 is not 1b's first line, so it pins a tick but cuts nothing: the
    # column break falls back to the proportional estimate, as without the flag.
    with_flag = _build(tmp_path, monkeypatch, anchors='- bekker: "1b5"\n  at: "Beta three."\n',
                       anchor_cuts=True)
    assert not with_flag["1b"]["text"].startswith("Beta three.")
