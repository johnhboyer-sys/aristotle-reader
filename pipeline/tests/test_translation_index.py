"""The English indexes for the translations beyond the primary.

shared/lib/search.ts reads english-<slot>.json exactly as it reads english.json
— a posting is (seg_idx, word_pos) — and then maps word_pos back to a place in
the slices it fetched with the book, counting words through them in order. So
these tests pin both halves: which file a slot lands in, and that the word count
runs through a segment's slices the way the reader walks them.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

import pytest  # noqa: E402

from aristotle_pipeline import preflight  # noqa: E402
from aristotle_pipeline.stage6_search import (  # noqa: E402
    emit_translation_indexes,
    english_words,
    segment_translations,
)

FIXTURE = json.loads(
    (ROOT / "pipeline" / "tests" / "fixtures" / "english_words.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["text"][:24] or "empty")
def test_english_words_matches_the_shared_fixture(case):
    assert english_words(case["text"]) == case["words"]


def _piece(chapter, text, cont=False):
    return {"chapter": chapter, "text": text, "cont": cont}


def _work(tmp_path, segments, meta_ids=None):
    work = tmp_path / "W"
    (work / "search").mkdir(parents=True)
    (work / "book-01.json").write_text(json.dumps({"book": 1, "segments": segments}))
    ids = meta_ids or [s["id"] for s in segments]
    (work / "search" / "meta.json").write_text(json.dumps(
        [{"id": i, "book": 1, "column": i.split(":")[1], "greek_head": "", "english_head": ""}
         for i in ids]))
    return work


def _seg(sid, **slots):
    return {"id": sid, "column": sid.split(":")[1], "greek": [], "english": None, **slots}


def _load(work, slot):
    return json.loads((work / "search" / f"english-{slot}.json").read_text(encoding="utf-8"))


def test_each_slot_gets_its_own_index(tmp_path):
    work = _work(tmp_path, [
        _seg("1:1a",
             ross=[_piece("1", "Virtue is a mean.")],
             third=[_piece("1", "Excellence is a mean.")],
             overlays={"peters": [_piece("1", "Virtue, then, is a mean.")]}),
    ])
    summary = emit_translation_indexes(work)
    assert set(summary) == {"secondary", "third", "overlay-peters"}
    assert _load(work, "secondary")["virtue"] == [[0, 0]]
    assert "virtue" not in _load(work, "third")
    assert _load(work, "third")["excellence"] == [[0, 0]]
    assert _load(work, "overlay-peters")["then"] == [[0, 1]]


def test_the_renamed_secondary_field_is_read_too(tmp_path):
    work = _work(tmp_path, [_seg("1:1a", secondary=[_piece("1", "Soul")])])
    emit_translation_indexes(work)
    assert _load(work, "secondary") == {"soul": [[0, 0]]}


def test_word_pos_runs_through_a_segments_slices_in_order(tmp_path):
    """The tail of chapter 3 and the head of chapter 4 sit in one column; the
    reader lays them out in that order and counts words the same way."""
    work = _work(tmp_path, [
        _seg("1:1a"),  # no overlay here: seg_idx is still its meta position
        _seg("1:1b", ross=[_piece("3", "end of three", cont=True), _piece("4", "four begins")]),
    ])
    emit_translation_indexes(work)
    idx = _load(work, "secondary")
    assert idx["end"] == [[1, 0]]
    assert idx["four"] == [[1, 3]]
    assert idx["begins"] == [[1, 4]]


def test_seg_idx_is_the_meta_position_not_the_book_position(tmp_path):
    work = _work(tmp_path, [_seg("1:1b", third=[_piece("1", "late")])],
                 meta_ids=["1:1a", "1:1b"])
    emit_translation_indexes(work)
    assert _load(work, "third") == {"late": [[1, 0]]}


def test_a_segment_meta_does_not_know_is_an_error(tmp_path):
    work = _work(tmp_path, [_seg("1:9z", third=[_piece("1", "lost")])], meta_ids=["1:1a"])
    with pytest.raises(ValueError, match="1:9z"):
        emit_translation_indexes(work)


def test_a_stale_index_is_removed_with_its_translation(tmp_path):
    work = _work(tmp_path, [_seg("1:1a", third=[_piece("1", "old")])])
    emit_translation_indexes(work)
    book = json.loads((work / "book-01.json").read_text())
    del book["segments"][0]["third"]
    (work / "book-01.json").write_text(json.dumps(book))
    assert emit_translation_indexes(work) == {}
    assert not list((work / "search").glob("english-*.json"))
    assert (work / "search" / "meta.json").exists()


def test_an_overlay_id_that_cannot_name_a_file_is_refused():
    with pytest.raises(ValueError):
        segment_translations({"overlays": {"../x": [_piece("1", "a")]}})


# -- The preflight gate ------------------------------------------------------
#
# Written failing-case first: each test breaks one thing and expects the gate
# to name it, and the valid case asserts the gate actually examined an index.

def _manifest(work_id="W"):
    return preflight.WorkManifest(work_id=work_id, path=Path("W.yaml"), data={})


def _gate(work):
    loaded = {p.name: json.loads(p.read_text()) for p in work.glob("book-*.json")}
    problems: list = []
    preflight._validate_translation_indexes(_manifest(), work, loaded, problems)
    return [p[2] for p in problems]


def _overlay_work(tmp_path):
    return _work(tmp_path, [
        _seg("1:1a", ross=[_piece("1", "Every art and every inquiry")]),
        _seg("1:1b", ross=[_piece("1", "aims at some good")]),
    ])


def test_gate_passes_a_fresh_index_and_has_something_to_check(tmp_path):
    work = _overlay_work(tmp_path)
    emit_translation_indexes(work)
    assert _gate(work) == []
    # It did look: break one posting and it must notice.
    idx = _load(work, "secondary")
    idx["good"] = []
    (work / "search" / "english-secondary.json").write_text(json.dumps(idx))
    assert any("stale" in p and "1:1b" in p for p in _gate(work))


def test_gate_reports_a_translation_with_no_index(tmp_path):
    work = _overlay_work(tmp_path)
    problems = _gate(work)
    assert len(problems) == 1 and "missing" in problems[0] and "secondary" in problems[0]


def test_gate_reports_an_index_shifted_off_its_segments(tmp_path):
    work = _overlay_work(tmp_path)
    emit_translation_indexes(work)
    # meta.json reordered after the index was built: every seg_idx now names
    # the other segment.
    meta = json.loads((work / "search" / "meta.json").read_text())
    (work / "search" / "meta.json").write_text(json.dumps(meta[::-1]))
    assert any("stale" in p for p in _gate(work))


def test_gate_reports_an_index_for_a_translation_the_books_lack(tmp_path):
    work = _overlay_work(tmp_path)
    emit_translation_indexes(work)
    (work / "search" / "english-third.json").write_text(json.dumps({"ackrill": [[0, 0]]}))
    assert any("do not carry" in p for p in _gate(work))


def test_gate_is_silent_for_a_work_with_one_translation(tmp_path):
    work = _work(tmp_path, [_seg("1:1a")])
    assert _gate(work) == []
