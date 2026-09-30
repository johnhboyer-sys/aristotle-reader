"""A primary archive translation can take its column breaks from its anchors.

Without `anchor_cuts`, build_english cuts each chapter across its columns in
proportion to the Greek, and the anchors only pin gutter ticks inside those
proportional chunks. With it, a `{column}1` anchor is where that column's
English begins (Lin: Joachim's printed column marks, checked against the Greek).
"""

from __future__ import annotations

from types import SimpleNamespace

from aristotle_pipeline import stage1_archive

PROSE = ("<p>Part 1</p>\n<p>Alpha one is the first sentence here. Alpha two is short. "
         "Beta one opens the second column. Beta two. Beta three. Beta four ends it.</p>\n")
ANCHORS = '- bekker: "1b1"\n  at: "Alpha two is short."\n- bekker: "1b5"\n  at: "Beta three."\n'


def _spine():
    col = lambda c: {"id": f"1:{c}", "book": 1, "column": c,
                     "lines": [{"n": n, "text": "λόγος"} for n in range(1, 11)]}
    return {"segments": [col("1a"), col("1b")]}


def _build(tmp_path, monkeypatch, **flags):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    (tmp_path / "tst" / "anchors.yaml").write_text(ANCHORS, encoding="utf-8")
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
