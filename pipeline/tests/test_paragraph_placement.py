"""sources/<dir>/paragraphs.yaml becomes paragraph markers in the primary English.

The positions are chapter-relative and the chunks are per column, so the offsets
must be rebased across column cuts. The text itself never changes. An entry whose
words are not at its offset, or which lands in no chunk, must stop the build:
quietly dropping it would render as a flat wall of text with every gate green.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from aristotle_pipeline import stage1_archive

PROSE = ("<p>Part 1</p>\n<p>Alpha one is the first sentence here. Alpha two is short. "
         "Beta one opens the second column. Beta two. Beta three. Beta four ends it.</p>\n"
         "<p>Part 2</p>\n<p>Gamma one opens chapter two. Gamma two is the next one.</p>\n")
BETA_FOUR = PROSE.index("Beta four") - len("<p>Part 1</p>\n<p>")
GAMMA_TWO = len("Gamma one opens chapter two. ")


def _spine():
    col = lambda c: {"id": f"1:{c}", "book": 1, "column": c,
                     "lines": [{"n": n, "text": "λόγος"} for n in range(1, 11)]}
    return {"segments": [col("1a"), col("1b")]}


def _build(tmp_path, monkeypatch, paragraphs=None):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    if paragraphs is not None:
        (tmp_path / "tst" / "paragraphs.yaml").write_text(paragraphs, encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    cfg = {"id": "tst", "name": "Test", "dir": "tst", "books": 1, "chapter_marker": "part"}
    chapters = [{"book": 1, "chapter": "1", "column": "1a", "line": 1},
                {"book": 1, "chapter": "2", "column": "1b", "line": 6}]
    eng = stage1_archive.build_english(SimpleNamespace(work_id="TST"), _spine(), chapters, cfg)
    return {c["column"]: c for c in eng["chunks"]}


def _paras(chunk):
    return [m["offset"] for m in chunk["markers"] if m["kind"] == "paragraph"]


def test_no_file_no_markers(tmp_path, monkeypatch):
    chunks = _build(tmp_path, monkeypatch)
    assert not any(_paras(c) for c in chunks.values())


def test_offsets_rebase_across_columns_and_chapters(tmp_path, monkeypatch):
    (tmp_path / "bare").mkdir()
    bare = {k: c["text"] for k, c in _build(tmp_path / "bare", monkeypatch).items()}
    chunks = _build(tmp_path, monkeypatch, (
        f'- {{book: 1, chapter: 1, offset: {BETA_FOUR}, at: "Beta four"}}\n'
        f'- {{book: 1, chapter: 2, offset: {GAMMA_TWO}, at: "Gamma two is"}}\n'))
    assert {c: chunks[c]["text"] for c in chunks} == bare  # not one byte moves
    found = {chunks[c]["text"][o:o + 5] for c in chunks for o in _paras(chunks[c])}
    assert found == {"Beta ", "Gamma"}
    assert sum(len(_paras(c)) for c in chunks.values()) == 2


def test_words_not_at_offset_stop_the_build(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="paragraphs.yaml"):
        _build(tmp_path, monkeypatch, f'- {{book: 1, chapter: 1, offset: {BETA_FOUR + 1}, at: "Beta four"}}\n')


def test_entry_for_a_chapter_with_no_chunk_stops_the_build(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="paragraphs.yaml"):
        _build(tmp_path, monkeypatch, '- {book: 1, chapter: 9, offset: 4, at: "Beta"}\n')
