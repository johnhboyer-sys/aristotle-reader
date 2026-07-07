import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.refs import column_key, column_range, line_key, ref_key


def test_column_and_ref_keys_round_trip_to_normalized_strings():
    page, side = column_key("1094a")
    assert f"{page}{side}" == "1094a"

    page, side, line = ref_key("1094a1")
    assert f"{page}{side}{line}" == "1094a1"

    assert line_key("1094a", 1) == ref_key("1094a1")


def test_bekker_sort_order_places_columns_before_lines_before_next_side():
    refs = ["1094b", "1094a1", "1094a", "1095a1", "1094b1"]

    assert sorted(refs, key=lambda r: (*column_key(r), -1) if r[-1] in "ab" else ref_key(r)) == [
        "1094a",
        "1094a1",
        "1094b",
        "1094b1",
        "1095a1",
    ]


def test_column_range_includes_both_sides_and_honors_boundaries():
    assert column_range("1094b", "1096a") == ["1094b", "1095a", "1095b", "1096a"]


@pytest.mark.parametrize("value", ["1094", "1094c", "1094a1", "a1094"])
def test_column_key_rejects_malformed_columns(value):
    with pytest.raises(ValueError, match="not a Bekker column"):
        column_key(value)


@pytest.mark.parametrize("value", ["1094a", "1094", "1094c1", "1094aX"])
def test_ref_key_rejects_malformed_refs(value):
    with pytest.raises(ValueError, match="not a Bekker ref"):
        ref_key(value)
