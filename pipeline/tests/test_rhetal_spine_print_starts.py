"""Rhetorica ad Alexandrum: the Bekker-lined spine against Bekker's page.

pipeline/tools/build_rhetal_spine.py places each printed line on Fuhrmann's
words by fuzzy OCR matching. A second scan of the same pages (archive.org
b33521311_0002) disagreed with the first by two words or more on 78 lines;
each was read on the page image, and where the build was wrong the reading is
in PRINT_STARTS. These pin those readings in the vendored spine.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
NS = {"t": "http://www.tei-c.org/ns/1.0"}


def _tool():
    path = ROOT / "pipeline" / "tools" / "build_rhetal_spine.py"
    spec = importlib.util.spec_from_file_location("build_rhetal_spine", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _lines() -> dict[str, str]:
    tree = etree.parse(str(ROOT / "sources" / "rhetal-greek" / "rhetal-bekker-grc.xml"))
    return {d.get("n") + l.get("n"): l.text or ""
            for d in tree.iterfind(".//t:div", NS) for l in d.iterfind("t:l", NS)}


def test_every_print_start_opens_its_line():
    starts = _tool().PRINT_STARTS
    assert len(starts) == 29   # an empty table would pass the loop below
    lines = _lines()
    for (col, n), opening in starts.items():
        assert lines[f"{col}{n}"].split()[:len(opening.split())] == opening.split(), (col, n)


def test_only_the_printed_blank_rows_are_empty():
    # 1437a9 was empty: both its words and 1437a10's sat on a10.
    assert [k for k, v in _lines().items() if not v.strip()] == ["1432b10", "1438b13", "1439b2"]


def test_1437a9_and_a10_as_printed():
    lines = _lines()
    assert lines["1437a9"] == "ἢ μέλλειν γενήσεσθαι ἢ μὴ βούλεσθαι τοὺς τὴν αἰτίαν"
    assert lines["1437a10"].startswith("ἐπενεγκόντας λαβεῖν κρίσιν.")
