"""sources/<dir>/paragraphs.yaml becomes paragraph markers in the primary English.

The positions are chapter-relative and the chunks are per column, so the offsets
must be rebased across column cuts. The text itself never changes. An entry whose
words are not at its offset, or which lands in no chunk, must stop the build:
quietly dropping it would render as a flat wall of text with every gate green.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from aristotle_pipeline import stage1_archive

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import place_paragraphs  # noqa: E402

PROSE = ("<p>Part 1</p>\n<p>Alpha one is the first sentence here. Alpha two is short. "
         "Beta one opens the second column. Beta two. Beta three. Beta four ends it.</p>\n"
         "<p>Part 2</p>\n<p>Gamma one opens chapter two. Gamma two is the next one.</p>\n")
BETA_FOUR = PROSE.index("Beta four") - len("<p>Part 1</p>\n<p>")
GAMMA_TWO = len("Gamma one opens chapter two. ")


def _spine():
    col = lambda c: {"id": f"1:{c}", "book": 1, "column": c,
                     "lines": [{"n": n, "text": "λόγος"} for n in range(1, 11)]}
    return {"segments": [col("1a"), col("1b")]}


def _build(tmp_path, monkeypatch, paragraphs=None, chapters=None):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "book-01.html").write_text(PROSE, encoding="utf-8")
    if paragraphs is not None:
        (tmp_path / "tst" / "paragraphs.yaml").write_text(paragraphs, encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    cfg = {"id": "tst", "name": "Test", "dir": "tst", "books": 1, "chapter_marker": "part"}
    chapters = chapters or [{"book": 1, "chapter": "1", "column": "1a", "line": 1},
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


def test_empty_file_stops_the_build(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="no entries"):
        _build(tmp_path, monkeypatch, "# header only\n")


def test_entry_with_prose_but_no_piece_stops_the_build(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="landed in no chunk"):
        _build(tmp_path, monkeypatch, f'- {{book: 1, chapter: 2, offset: {GAMMA_TWO}, at: "Gamma two is"}}\n',
               chapters=[{"book": 1, "chapter": "1", "column": "1a", "line": 1}])


def _offsets(result):
    return [e["offset"] for e in result["entries"]]


def test_exact_match_respects_word_boundaries():
    prose = {(1, 1): "Start here. Nowhere is the point made clear. Then now here is the point made clear."}
    r = place_paragraphs.place(prose, ["Now here is the point made clear"])
    # Not "Nowhere", nor the lower-case occurrence reached through it by accident.
    assert _offsets(r) == [prose[(1, 1)].index("now here")]


def test_rejected_hit_does_not_lose_earlier_paragraphs():
    prose = {(1, 1): "First. Early real paragraph starts here. Later we discuss spurious opening words again."}
    r = place_paragraphs.place(prose, ["spurious opening words", "Early real paragraph starts here"],
                               sentence_only=True)
    assert _offsets(r) == [prose[(1, 1)].index("Early")]


def test_exact_hit_past_the_window_is_not_taken():
    far = " ".join(f"w{i}." for i in range(place_paragraphs.WINDOW_WORDS + 50))
    prose = {(1, 1): f"Opening here. {far} Wanted paragraph opens right at this place."}
    r = place_paragraphs.place(prose, ["Wanted paragraph opens right at this place"])
    assert not r["entries"] and r["unmatched"]


@pytest.mark.parametrize("at, offset", [
    ("lpha one is", 1),      # starts inside 'Alpha'
    ("Alpha one i", 0),      # ends inside 'is'
    ("", 3),                 # no words: matches anywhere
    ("   ", 3),
])
def test_entry_that_is_not_whole_words_at_its_offset_stops_the_build(tmp_path, monkeypatch, at, offset):
    with pytest.raises(ValueError, match="paragraphs.yaml"):
        _build(tmp_path, monkeypatch, f'- {{book: 1, chapter: 1, offset: {offset}, at: "{at}"}}\n')


def test_duplicate_entry_stops_the_build(tmp_path, monkeypatch):
    entry = f'- {{book: 1, chapter: 1, offset: {BETA_FOUR}, at: "Beta four"}}\n'
    with pytest.raises(ValueError, match="duplicate"):
        _build(tmp_path, monkeypatch, entry * 2)


def test_every_shipped_paragraphs_file_loads():
    # The checks above must not reject a real entry; an empty glob would pass, so count them.
    root = Path(__file__).resolve().parents[2]
    slots = {}
    for path in sorted((root / "manifests").glob("*.yaml"), key=lambda p: "-public" not in p.name):
        eng = (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("english") or {}
        for cfg in eng.values():
            for c in cfg if isinstance(cfg, list) else [cfg]:
                if isinstance(c, dict) and c.get("dir"):
                    slots.setdefault(c["dir"], c)
    files = sorted((root / "sources").glob("*/paragraphs.yaml"))
    assert len(files) == 6
    total = 0
    for f in files:
        cfg = slots[f.parent.name]
        cfg = dict(cfg, books=cfg.get("books", 1))
        loaded = stage1_archive._load_paragraphs(cfg, stage1_archive._load_prose(cfg))
        total += sum(len(v) for v in loaded.values())
    assert total == 468


@pytest.mark.parametrize("entry, text", [
    ("{book: 1, chapter: 1, offset: 0, at: 123}", "123 things"),    # not a string: str() would match
    ("{book: 1, chapter: 1, offset: 0, at: null}", "None things"),
    ("{book: 1, chapter: 1, offset: -1, at: Alpha}", "Alpha one"),  # re clamps a negative position to 0
    ("{book: 1, chapter: 1, offset: false, at: Alpha}", "Alpha one"),
])
def test_malformed_entry_stops_the_build(tmp_path, monkeypatch, entry, text):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "paragraphs.yaml").write_text(f"- {entry}\n", encoding="utf-8")
    monkeypatch.setattr(stage1_archive, "SOURCES_DIR", tmp_path)
    with pytest.raises(ValueError, match="paragraphs.yaml"):
        stage1_archive._load_paragraphs({"dir": "tst"}, {(1, 1): text})
