"""Print-checked corrections to the English sources stay made.

The corrections themselves are edits to `sources/<dir>/book-NN.html`; the list in
`sources/english-corrections.json` records each one (work, book, column, the
text before and after, and the scan it was checked against). They came from the
Lyceum reader, which mounts this repo's build and had been correcting the same
misprints downstream (John's ruling of 2026-09-29: a fix made there is made
here too).

A re-fetch of a source from the MIT archive or a scan would silently undo them.
This test parses each work's public primary English the way stage 1 does and
fails if any `find` is back or any `replace` is missing.
"""

from __future__ import annotations

import functools
import json
import re
from pathlib import Path

import pytest
import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]
CORRECTIONS = json.loads(
    (ROOT / "sources" / "english-corrections.json").read_text(encoding="utf-8")
)["corrections"]


def _primary(work: str) -> dict:
    path = ROOT / "manifests" / f"{work}-public.yaml"
    if not path.exists():
        path = ROOT / "manifests" / f"{work}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))["english"]["primary"]


@functools.cache
def _prose(work: str) -> dict:
    return stage1_archive._load_prose(_primary(work))


def _book_text(work: str, book: int) -> str:
    chapters = sorted((k, v) for k, v in _prose(work).items() if k[0] == book)
    return re.sub(r"\s+", " ", " ".join(v for _, v in chapters))


def test_the_list_is_read():
    # An empty or misread list would pass every parametrized case below.
    assert len(CORRECTIONS) == 62
    assert {c["work"] for c in CORRECTIONS} == {
        "Cael", "DA", "GC", "Lin", "Meta", "Mete", "Phys", "SE", "PA", "Sens"}


@pytest.mark.parametrize(
    "c", CORRECTIONS, ids=[f"{c['work']}-{c['column']}-{i}" for i, c in enumerate(CORRECTIONS)])
def test_correction_is_in_the_source(c):
    text = _book_text(c["work"], c["book"])
    assert text, f"{c['work']} book {c['book']} parsed to nothing"
    assert c["find"] not in text, f"uncorrected text is back: {c['find']!r}"
    assert c["replace"] in text, f"corrected text is missing: {c['replace']!r}"
