"""John's review rulings (alignment-results/<vid>/rulings/<WORK>.json) pin
ticks word-exact on every pass 2. A ruling must land exactly where he clicked,
never be dragged by a machine neighbour (the June Poetics pins "snapped back"),
and never touch a chapter-start tick, which the Greek fixes."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import model_test as mt  # noqa: E402
from aristotle_pipeline.align import rulings  # noqa: E402
from aristotle_pipeline.align.aligner import align_chapter  # noqa: E402

TEXT = ("First comes a sentence about art. Then one about inquiry and choice. "
        "A third concerns the good. A fourth concerns ends. A fifth concerns crafts.")


def test_locate_matches_across_line_breaks_and_prefers_the_nearest_copy():
    text = "the good is aimed at.\nAnd again the good\nis aimed at."
    assert rulings.locate(text, "the good is aimed at.", 0) == 0
    assert rulings.locate(text, "the good is aimed at.", 30) == text.index("good\nis") - 4
    assert rulings.locate(text, "nowhere in it", 0) is None


def test_a_ruling_whose_phrase_left_the_text_fails_by_name():
    with pytest.raises(ValueError, match="1094a5"):
        rulings.offsets({"1:1": {"1094a5": {"verdict": "late", "phrase": "not here", "near": 0}}},
                        {(1, 1): TEXT})


def test_a_ruling_without_a_phrase_places_nothing():
    assert rulings.offsets({"1:1": {"1094a5": {"verdict": "early"}}}, {(1, 1): TEXT}) == {}


def chapter():
    lines = [{"citation": f"1094a{n}", "greek": f"λέξις{n} ἄλλη{n}"} for n in range(1, 13)]
    ch = {"book": 1, "chapter": 1, "lines": lines, "text": TEXT,
          "windows": [{"tick": "1094a5", "is_column_start": False, "lines": ["1094a4", "1094a5", "1094a6"]},
                      {"tick": "1094a10", "is_column_start": False, "lines": ["1094a9", "1094a10", "1094a11"]}]}
    gloss = {f"1094a{n}": g for n, g in [(1, "art"), (4, "then inquiry"), (5, "and choice"), (6, "the good"),
                                         (9, "ends"), (10, "a fifth"), (11, "crafts")]}
    return mt.chapter_ref(ch, gloss)


def by_cit(anchors):
    return {a.citation: a for a in anchors}


def test_a_ruling_lands_exactly_and_is_marked():
    off = TEXT.index("inquiry and choice")
    a = by_cit(align_chapter(chapter(), "lexical", None, {"1094a5": off}))["1094a5"]
    assert (a.offset, a.confidence) == (off, "confirmed") and "ruled" in a.flags


def test_a_machine_neighbour_gives_way_to_a_ruling():
    # rule 1094a10 earlier than the machine placed 1094a5: 1094a5 is pulled
    # back to it; the ruling does not move
    first = by_cit(align_chapter(chapter(), "lexical"))
    target = max(0, first["1094a5"].offset - 5)
    got = by_cit(align_chapter(chapter(), "lexical", None, {"1094a10": target}))
    assert got["1094a10"].offset == target
    assert got["1094a5"].offset <= target and "clamped_by_ruling" in got["1094a5"].flags


def test_rulings_out_of_order_with_each_other_fail():
    with pytest.raises(ValueError, match="out of order"):
        align_chapter(chapter(), "lexical", None, {"1094a5": 60, "1094a10": 10})


def test_nothing_moves_a_chapter_start_tick():
    for ovr, ruled in (({"1094a1": 40}, None), (None, {"1094a1": 40})):
        a = by_cit(align_chapter(chapter(), "lexical", ovr, ruled))["1094a1"]
        assert (a.offset, a.tier) == (0, "chapter")


def test_a_click_is_placed_inside_the_passage_the_page_showed():
    # The export carries the clicked text, not its position (Codex). The page
    # shows a fixed window around the tick, so the click is the copy inside it;
    # none there, or two, is refused rather than guessed.
    text = "alpha beta. " * 3 + "the good is aimed at. " + "gamma delta. " * 40 + "the good is aimed at. "
    first = text.index("the good")
    assert rulings.place_click(text, "the good is aimed at.", 0, 300) == first
    with pytest.raises(ValueError, match="0 times"):
        rulings.place_click(text, "the good is aimed at.", 100, 300)
    with pytest.raises(ValueError, match="2 times"):
        rulings.place_click(text, "the good is aimed at.", 0, len(text))
