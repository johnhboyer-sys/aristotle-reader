"""build_spir_dobson.number_notes refuses a figure pinned to the wrong note.

Each case was a hole Codex found on 2026-11-06: a lost second citation of a
figure printed twice, and two labels swapped on one page."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_spir_dobson as b  # noqa: E402

NOTES = {"452.1": "a", "452.2": "b", "453.1": "c", "453.2": "d"}


@pytest.fixture(autouse=True)
def _twice(monkeypatch):
    monkeypatch.setattr(b, "TWICE", {"452.2": "", "453.2": ""})


def _words(*labels):
    return [[[f"w[^{k}]" for k in labels]]]


def test_numbers_in_reading_order():
    ch = _words("452.1", "452.2", "452.2", "453.1", "453.2", "453.2")
    assert b.number_notes(ch, NOTES) == {"1": "a", "2": "b", "3": "c", "4": "d"}
    assert ch[0][0] == ["w[^1]", "w[^2]", "w[^2]", "w[^3]", "w[^4]", "w[^4]"]


@pytest.mark.parametrize("labels, says", [
    (("452.2", "452.1", "452.2", "453.1", "453.2", "453.2"), "out of the page's order"),
    (("452.1", "452.2", "452.2", "453.2", "453.1", "453.2"), "out of the page's order"),
    (("452.1", "452.2", "453.1", "453.2", "453.2"), "wrong number of times"),
    (("452.1", "452.1", "452.2", "452.2", "453.1", "453.2", "453.2"), "wrong number of times"),
    (("452.1", "452.2", "452.2", "453.2", "453.2"), "no mark"),
])
def test_refuses(labels, says):
    with pytest.raises(SystemExit, match=says):
        b.number_notes(_words(*labels), NOTES)
