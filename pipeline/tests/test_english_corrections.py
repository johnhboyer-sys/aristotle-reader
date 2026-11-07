"""Print-checked corrections to the English sources stay made.

The corrections themselves are edits to `sources/<dir>/book-NN.html`; the list in
`sources/english-corrections.json` records each one (work, book, column, the
text before and after, and the scan it was checked against). The first 62 came
from the Lyceum reader, which mounts this repo's build and had been correcting
the same misprints downstream (John's ruling of 2026-09-29: a fix made there is
made here too). The rest, the entries that name a `dir`, came from the 2026-11
sweep of every public English translation against scans of the printed books.

A re-fetch of a source from the MIT archive or a scan would silently undo them.
This test parses each entry's translation the way stage 1 does (the work's public
primary English, or the slot whose `dir` the entry names) and fails if any
`find` is back or any `replace` is missing. Where the find is part of the
replace (an append: text restored where the archive serves a page cut off), the
find is meant to stay inside the replace, so only a copy outside it counts.
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
def _slots() -> dict[str, dict]:
    """{dir: slot config} over every manifest's English slots (primary,
    secondary, third, overlays); a -public manifest's slot wins."""
    out: dict[str, dict] = {}
    paths = sorted((ROOT / "manifests").glob("*.yaml"), key=lambda p: "-public" not in p.name)
    for path in paths:
        eng = (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("english") or {}
        for cfg in eng.values():
            for c in cfg if isinstance(cfg, list) else [cfg]:
                if isinstance(c, dict) and c.get("dir"):
                    out.setdefault(c["dir"], c)
    return out


def _dir(c: dict) -> str:
    return c.get("dir") or _primary(c["work"])["dir"]


@functools.cache
def _prose(d: str) -> dict:
    cfg = _slots()[d]
    return stage1_archive._load_prose(dict(cfg, books=cfg.get("books", 1)))


@functools.cache
def _book_text(d: str, book: int) -> str:
    chapters = sorted((k, v) for k, v in _prose(d).items() if k[0] == book)
    return re.sub(r"\s+", " ", " ".join(v for _, v in chapters))


def _stray(find: str, replace: str, text: str) -> bool:
    """Whether `find` occurs in `text` anywhere but inside an occurrence of `replace`."""
    # Overlapping occurrences of replace count too, so no finditer.
    spans, j = [], text.find(replace)
    while j != -1:
        spans.append((j, j + len(replace)))
        j = text.find(replace, j + 1)
    i = text.find(find)
    while i != -1:
        if not any(s <= i and i + len(find) <= e for s, e in spans):
            return True
        i = text.find(find, i + 1)
    return False


def _problems(c: dict, text: str) -> list[str]:
    if not text:
        return [f"{_dir(c)} book {c['book']} parsed to nothing"]
    out = []
    if _stray(c["find"], c["replace"], text):
        out.append(f"uncorrected text is back: {c['find']!r}")
    if c["replace"] not in text:
        out.append(f"corrected text is missing: {c['replace']!r}")
    return out


def test_the_list_is_read():
    # An empty or misread list would pass every parametrized case below.
    # 3,070 less the 30 for Taylor's Cat/Int, retired 2026-11-07 when the modernised
    # text they corrected was replaced by his 1812 print (test_taylor_1812.py).
    assert len(CORRECTIONS) == 3040
    old = [c for c in CORRECTIONS if not c.get("dir")]
    assert len(old) == 62
    assert {c["work"] for c in old} == {
        "Cael", "DA", "GC", "Lin", "Meta", "Mete", "Phys", "SE", "PA", "Sens"}
    swept = {c["dir"] for c in CORRECTIONS if c.get("dir")}
    assert len(swept) == 50 and "ostwald" not in swept
    assert swept <= set(_slots())
    assert all(c["find"] != c["replace"] for c in CORRECTIONS)


def test_the_check_fails_when_a_correction_is_undone():
    # Ross, EN 1137b: the dropped 'not' that reversed the sense.
    c = next(c for c in CORRECTIONS if c.get("dir") == "ross" and c["replace"] == "the error is not in the law")
    text = _book_text("ross", c["book"])
    assert _problems(c, text) == []
    assert len(_problems(c, text.replace(c["replace"], c["find"]))) == 2


def test_the_check_fails_when_a_restored_page_is_cut_again():
    # Politics V: the archive's page stops at 'let it b'; the entry appends the rest.
    c = next(c for c in CORRECTIONS if c.get("dir") == "pol-jowett" and c["book"] == 5
             and c["find"] in c["replace"])
    text = _book_text("pol-jowett", 5)
    assert _problems(c, text) == []
    cut = text[: text.index(c["replace"]) + len(c["find"])]
    # The cut page is the uncorrected text: its find now stands outside any replace.
    assert _problems(c, cut) == [f"uncorrected text is back: {c['find']!r}",
                                 f"corrected text is missing: {c['replace']!r}"]


def test_the_check_fails_on_a_stray_copy_of_an_appended_find():
    # The find of an append sits inside its replace; a copy outside it is the old text back.
    c = next(c for c in CORRECTIONS if c.get("dir") == "pol-jowett" and c["book"] == 5
             and c["find"] in c["replace"])
    text = _book_text("pol-jowett", 5)
    assert _problems(c, f"{c['find']} {text}") == [f"uncorrected text is back: {c['find']!r}"]


def test_a_find_inside_overlapping_replaces_is_not_stray():
    # Both "ababa" occurrences (at 0 and 2) overlap; every "aba" lies inside one.
    assert not _stray("aba", "ababa", "abababa")
    assert _stray("aba", "ababa", "aba ababa")


def test_the_check_fails_on_an_empty_parse():
    assert _problems(CORRECTIONS[0], "")


@pytest.mark.parametrize(
    "c", CORRECTIONS, ids=[f"{_dir(c)}-{c['column']}-{i}" for i, c in enumerate(CORRECTIONS)])
def test_correction_is_in_the_source(c):
    assert _problems(c, _book_text(_dir(c), c["book"])) == []
