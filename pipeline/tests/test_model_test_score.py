"""Mutation tests for tools/model_test.py's scorer: known placements, moved by
known amounts, must move each metric the way it claims to measure — and a run
that placed nothing must say so instead of scoring."""
import sys
from pathlib import Path

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
