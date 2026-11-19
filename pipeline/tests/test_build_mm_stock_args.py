"""tools/build_mm_stock.py reads its arguments before it builds anything.

It once took every argument but --fetch-images as a plain run, so asking it
for --help rebuilt and overwrote sources/mm-stock/book-01.html, book-02.html,
and anchors.yaml. The build itself is replaced here by a stub that records it
was reached.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import build_mm_stock as mm  # noqa: E402


class Reached(Exception):
    pass


@pytest.fixture
def calls(monkeypatch):
    seen: list[str] = []

    def book():
        seen.append("build")
        raise Reached

    monkeypatch.setattr(mm, "Book", book)
    monkeypatch.setattr(mm, "fetch_images", lambda: seen.append("fetch"))
    return seen


@pytest.mark.parametrize("flag", ["--help", "-h"])
def test_help_prints_usage_and_builds_nothing(flag, calls, capsys):
    with pytest.raises(SystemExit) as stop:
        mm.main([flag])
    assert stop.value.code == 0
    assert calls == []
    assert "--fetch-images" in capsys.readouterr().out


def test_an_unknown_flag_stops_before_the_build(calls):
    with pytest.raises(SystemExit) as stop:
        mm.main(["--dry-run"])
    assert stop.value.code == 2
    assert calls == []


def test_fetch_images_then_builds(calls):
    with pytest.raises(Reached):
        mm.main(["--fetch-images"])
    assert calls == ["fetch", "build"]


def test_no_arguments_builds(calls):
    with pytest.raises(Reached):
        mm.main([])
    assert calls == ["build"]
