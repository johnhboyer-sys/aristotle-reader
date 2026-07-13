"""Unit tests for chapter English-offset resolution and the stage2 coverage
check — the de-collision that keeps a missing/colliding section marker from
blanking the preceding chapter (see stage7_emit.resolve_chapter_offsets)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage7_emit import resolve_chapter_offsets
from aristotle_pipeline.stage2_validate import validate


def _chunk(text, markers=None, ticks=None):
    return {
        "text": text,
        "markers": [{"kind": "section", "n": n, "offset": o} for n, o in (markers or [])],
        "bekker": [{"n": n, "offset": o, "real": True} for n, o in (ticks or [])],
    }


def _chs(*specs):
    # specs: (chapter, line) tuples in reading order
    return [{"chapter": c, "line": str(l), "wordIndex": 0} for c, l in specs]


def test_all_real_markers_unchanged():
    # Every chapter has its own marker, already strictly increasing -> untouched.
    eng = _chunk("x" * 1000, markers=[("1", 0), ("2", 400), ("3", 700)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 10), ("3", 20)))
    assert offs == [0, 400, 700]


def test_missing_marker_interpolated_from_line():
    # ch2 has no marker; its offset is interpolated from its Greek line via the
    # gutter ticks (line 10 -> ~offset 500), strictly after ch1.
    eng = _chunk("x" * 1000, markers=[("1", 0)],
                 ticks=[(1, 0), (10, 500), (20, 1000)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 10)))
    assert offs[0] == 0
    assert 0 < offs[1] <= 1000
    assert offs[1] > offs[0]


def test_colliding_zero_offsets_are_distributed():
    # The EN 6:1 bug shape: ch1 real marker at 0, ch2 missing -> both would be 0.
    # De-collision must separate them so neither slices to empty.
    eng = _chunk("x" * 1000, markers=[("1", 0)])  # no ticks -> ch2 raw 0
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 5)))
    assert offs[0] == 0
    assert offs[1] > offs[0]
    assert offs[1] < 1000


def test_three_colocated_chapters_strictly_increasing():
    # De Mirabilibus shape: three chapters aligned to the same Greek word, only
    # the last carrying a real marker. All three must get distinct, ordered slots.
    eng = _chunk("x" * 900, markers=[("155", 300)])
    offs = resolve_chapter_offsets(eng, _chs(("153", 6), ("154", 6), ("155", 6)))
    assert offs == sorted(offs)
    assert len(set(offs)) == 3  # strictly increasing, no ties
    assert all(o < 900 for o in offs[:2])


def test_empty_chunk_does_not_crash():
    offs = resolve_chapter_offsets(None, _chs(("1", 1)))
    assert offs == [0]


def _in_range(offs, text_len):
    return all(0 <= o <= text_len for o in offs)


def test_span_starved_run_stays_in_range():
    # Codex adversarial case: a real marker at 9 then two colliding chapters in a
    # 10-char chunk. Offsets must stay within [0, text_len] (never 10, 11) even
    # though they cannot all be made strictly increasing.
    eng = _chunk("x" * 10, markers=[("1", 9)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 2), ("3", 3)))
    assert _in_range(offs, 10)
    assert offs[0] == 9
    assert offs == sorted(offs)  # non-decreasing


def test_many_chapters_in_one_char_span():
    eng = _chunk("x", markers=[])  # text_len 1, three chapters
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 1), ("3", 1)))
    assert _in_range(offs, 1)
    assert offs == sorted(offs)


def test_collision_right_before_fixed_marker_stays_below_it():
    # Two colliding chapters then a fixed marker at 5 in a 100-char chunk: the
    # repaired offsets must not reach or pass the fixed marker.
    eng = _chunk("x" * 100, markers=[("1", 0), ("3", 5)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 1), ("3", 3)))
    assert offs[0] == 0 and offs[2] == 5
    assert 0 < offs[1] < 5
    assert offs == sorted(offs) and _in_range(offs, 100)


def test_zero_length_text_multiple_chapters():
    eng = _chunk("", markers=[])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 1)))
    assert _in_range(offs, 0)  # all clamped to 0


def test_span_starved_run_never_touches_following_fixed_marker():
    # A crowded collision run immediately before a real marker must not clamp
    # onto that marker's offset (which would blank the validly-marked chapter).
    # markers 1@0 and 4@2 in a 100-char chunk; chapters 2 and 3 collide with only
    # 2 chars of room before the fixed marker at 2.
    eng = _chunk("x" * 100, markers=[("1", 0), ("4", 2)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 1), ("3", 1), ("4", 3)))
    assert offs[-1] == 2  # the fixed marker survives, distinct
    assert all(o < 2 for o in offs[:-1])  # synthesized starts stay strictly below it
    assert _in_range(offs, 100)


def test_trailing_span_starved_never_lands_on_eof():
    # Codex final case: a fixed marker near the end (offset 9 of a 10-char chunk)
    # then a trailing colliding chapter. The synthesized offset must NOT become
    # text_len (which would be an empty end-of-book slice masquerading as an
    # untranslated gap); it stays below the text end so the tie fails validation.
    eng = _chunk("x" * 10, markers=[("1", 9)])
    offs = resolve_chapter_offsets(eng, _chs(("1", 1), ("2", 2)))
    assert all(o < 10 for o in offs)  # nothing at EOF
    assert _in_range(offs, 10)


class _Manifest:
    first_column = "1094a"
    last_column = "1094b"
    books = [{"n": 1, "start": "1094a1", "end": "1094b2"}]
    data = {
        "work": {"id": "TST"},
        "bekker_range": {"first_column": "1094a", "last_column": "1094b"},
        "books": books,
        "proper_names": [],
    }


def test_validator_flags_trailing_whitespace_collision_as_collapsed():
    # Codex final finding: a collision whose remaining suffix is whitespace must
    # still be a build-failing `collapsed`, not a masked `untranslated`. Two
    # chapters resolve onto the same offset inside the first column, which ends in
    # "\n"; real English still follows in 1094b, so this is a mid-book mis-slice.
    spine = {
        "work": "TST",
        "segments": [
            {"id": "1:1094a", "book": 1, "column": "1094a",
             "lines": [{"n": 1, "text": "αβ"}, {"n": 2, "text": "γδ"}]},
            {"id": "1:1094b", "book": 1, "column": "1094b",
             "lines": [{"n": 1, "text": "εζ"}, {"n": 2, "text": "ηθ"}]},
        ],
    }
    english = {
        "chunks": [
            {"id": "1:1094a", "book": 1, "column": "1094a",
             "text": "xxxxxxxxx\n",  # 10 chars, trailing newline
             "markers": [{"kind": "section", "n": "1", "offset": 9}], "bekker": []},
            {"id": "1:1094b", "book": 1, "column": "1094b",
             "text": "yyyyyyyyyy",
             "markers": [{"kind": "section", "n": "3", "offset": 0}], "bekker": []},
        ],
        "chapters": [
            {"book": 1, "chapter": "1", "column": "1094a", "line": "1", "wordIndex": 0},
            {"book": 1, "chapter": "2", "column": "1094a", "line": "2", "wordIndex": 0},
            {"book": 1, "chapter": "3", "column": "1094b", "line": "1", "wordIndex": 0},
        ],
    }
    alignment = {
        "pairs": [{"segment": "1:1094a", "english": "1:1094a"},
                  {"segment": "1:1094b", "english": "1:1094b"}],
        "english_only": [],
    }
    report = validate(_Manifest(), spine, english, alignment)
    co = report["checks"]["chapter_offsets"]
    assert co["ok"] is False
    assert {"book": 1, "chapter": "1", "column": "1094a"} in co["collapsed"]
    assert co["untranslated"] == []


def test_validator_fails_on_chapter_in_nonexistent_spine_column():
    # A chapter pinned to a (book, column) the spine never carries can't render;
    # stage7 drops its heading. The check must fail, not silently skip it.
    spine = {
        "work": "TST",
        "segments": [
            {"id": "1:1094a", "book": 1, "column": "1094a",
             "lines": [{"n": 1, "text": "αβ"}, {"n": 2, "text": "γδ"}]},
            {"id": "1:1094b", "book": 1, "column": "1094b",
             "lines": [{"n": 1, "text": "εζ"}, {"n": 2, "text": "ηθ"}]},
        ],
    }
    english = {
        "chunks": [
            {"id": "1:1094a", "book": 1, "column": "1094a", "text": "x" * 20,
             "markers": [{"kind": "section", "n": "1", "offset": 0}], "bekker": []},
            {"id": "1:1094b", "book": 1, "column": "1094b", "text": "y" * 20,
             "markers": [{"kind": "section", "n": "2", "offset": 0}], "bekker": []},
        ],
        "chapters": [
            {"book": 1, "chapter": "1", "column": "1094a", "line": "1", "wordIndex": 0},
            {"book": 1, "chapter": "2", "column": "1094b", "line": "1", "wordIndex": 0},
            # ch3 references 1099z, which no spine segment carries.
            {"book": 1, "chapter": "3", "column": "1099z", "line": "1", "wordIndex": 0},
        ],
    }
    alignment = {
        "pairs": [{"segment": "1:1094a", "english": "1:1094a"},
                  {"segment": "1:1094b", "english": "1:1094b"}],
        "english_only": [],
    }
    report = validate(_Manifest(), spine, english, alignment)
    co = report["checks"]["chapter_offsets"]
    assert co["ok"] is False
    assert {"book": 1, "chapter": "3", "column": "1099z"} in co["collapsed"]
