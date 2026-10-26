"""Mutation tests for tools/model_test.py's scorer: known placements, moved by
known amounts, must move each metric the way it claims to measure — and a run
that placed nothing must say so instead of scoring."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import model_test as mt  # noqa: E402

TEXT = "Alpha beta gamma delta. Epsilon zeta eta theta iota. Kappa lambda mu."
SECOND = TEXT.index("Epsilon")
THIRD = TEXT.index("Kappa")
FX = [{"work": "T", "book": 1, "chapters": [{
    "book": 1, "chapter": 1, "text": TEXT,
    "windows": [{"tick": "1a1"}, {"tick": "1a5"}, {"tick": "1a10"}],
    "gold": [
        {"citation": "1a1", "off": 0, "tier": "column"},
        {"citation": "1a5", "off": SECOND - 1, "tier": "half_column"},  # on the space, as Perseus puts it
        {"citation": "1a10", "off": THIRD + 6, "tier": "half_column"},  # mid-sentence
        {"citation": "1a12", "off": THIRD + 13, "tier": "half_column"},  # not a glossed tick
    ]}]}]
KEY = ("T", 1, 1)


def score(placed):
    return mt.score({KEY: placed}, FX)


def test_placing_on_the_gold_scores_perfect():
    r = score({"1a1": 0, "1a5": SECOND, "1a10": THIRD + 6})
    assert (r["n"], r["missing"]) == (3, 0)          # 1a12 is not a tick: never scored
    assert r["same_sentence_pct"] == 100.0
    assert r["within_30_pct"] == 100.0
    assert r["median_chars"] == 0


def test_a_small_shift_inside_the_sentence_costs_distance_not_sentence():
    r = score({"1a1": 3, "1a5": SECOND + 3, "1a10": THIRD + 3})
    assert r["same_sentence_pct"] == 100.0
    assert r["median_chars"] == 3


def test_a_shift_into_the_next_sentence_is_a_sentence_miss():
    r = score({"1a1": SECOND, "1a5": SECOND, "1a10": THIRD + 6})
    assert r["same_sentence_pct"] == round(100 * 2 / 3, 1)
    assert r["column_same_sentence_pct"] == 0.0


def test_a_far_shift_drops_within_30():
    r = score({"1a1": 0, "1a5": THIRD + 10, "1a10": THIRD + 6})
    assert r["within_30_pct"] == round(100 * 2 / 3, 1)


def test_a_missing_placement_counts_as_a_miss():
    r = score({"1a1": 0, "1a5": SECOND})
    assert (r["n"], r["missing"]) == (2, 1)
    assert r["same_sentence_pct"] == round(100 * 2 / 3, 1)


def test_a_missing_column_tick_counts_against_the_column_score():
    r = score({"1a5": SECOND, "1a10": THIRD + 6})
    assert r["column_same_sentence_pct"] == 0.0


def test_nothing_placed_reports_no_score():
    r = score({})
    assert r == {"n": 0, "missing": 3}


# ---- interval gold (Ostwald: the printed line a margin number labels) -----
LINE_TEXT = "first printed line here second printed line here third line"
LSTART = LINE_TEXT.index("second")
LEND = LINE_TEXT.index("third")
IFX = [{"work": "I", "book": 1, "chapters": [{
    "book": 1, "chapter": 1, "text": LINE_TEXT, "windows": [{"tick": "1a5"}],
    "gold": [{"citation": "1a5", "start": LSTART, "end": LEND, "tier": "five_line"}]}]}]


def iscore(p):
    return mt.score({("I", 1, 1): {} if p is None else {"1a5": p}}, IFX)


def test_inside_the_printed_line_is_right():
    r = iscore(LSTART + 3)
    assert (r["in_line_pct"], r["median_dist"]) == (100.0, 0)


def test_before_the_line_is_early_and_its_end_is_late():
    assert iscore(LSTART - 5)["early_pct"] == 100.0
    assert iscore(LSTART - 5)["median_dist"] == 5
    r = iscore(LEND)                       # the start of the NEXT printed line
    assert (r["late_pct"], r["in_line_pct"], r["median_dist"]) == (100.0, 0.0, 1)


def test_interval_missing_reports_no_score():
    assert iscore(None) == {"n": 0, "missing": 1}


# ---- Ostwald gold extraction: the printed line a right-margin number labels --
def test_a_right_margin_line_runs_up_to_the_next_printed_line():
    text = "first line here then the labelled line next line"
    off = text.index("next")
    assert mt.line_interval(text, "right", off, "then the labelled line") == (
        text.index("then"), off)


def test_a_right_margin_line_ending_its_paragraph_keeps_its_first_letter():
    # Codex: NE 1096a10 ends I.5 with a newline, not a space, before the margin
    # number's offset; the old arithmetic started the line one character early.
    text = "earlier text. we may dismiss them.\n"
    off = len(text) - 1
    start, _ = mt.line_interval(text, "right", off, "we may dismiss them.")
    assert text[start:].startswith("we may")


def test_a_left_margin_line_starts_at_its_number():
    text = "before the number the line itself"
    off = text.index("the line")
    assert mt.line_interval(text, "left", off, "the line itself") == (off, len(text))


def test_correction_refuses_the_bulk_rule():
    # the correction stage reads, prompts and snapshots first-word answers only
    with pytest.raises(SystemExit, match="first"):
        mt.submit("correct", "haiku", ["opus"], rule="bulk")
