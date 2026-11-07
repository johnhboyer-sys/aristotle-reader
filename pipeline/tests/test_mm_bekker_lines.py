"""Magna Moralia: the Bekker line map and the spine it makes.

TLG's Magna Moralia has no Bekker numbers; sources/mm-bekker/bekker-lines.yaml
names the TLG word that opens each line of Bekker's 1831 page, read from the
scan by tools/mm_bekker_lines.py. These tests hold the map to its shape (every
column, consecutive lines, no word lost) and the manifest's chapter list to the
map. The relineation tests need the cached TLG export; without it they skip,
and say so.
"""

from __future__ import annotations

import copy
import re
import sys
import unicodedata
from pathlib import Path

import pytest
import yaml

from aristotle_pipeline import stage1_relineate as rl
from aristotle_pipeline.refs import column_range, ref_key

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "sources" / "mm-bekker" / "bekker-lines.yaml"
XML = ROOT / "build" / "export" / "Diogenes-Resources" / "xml" / "tlg" / "tlg0086022.xml"
MANIFEST = yaml.safe_load((ROOT / "manifests" / "MM.yaml").read_text(encoding="utf-8"))

needs_export = pytest.mark.skipif(not XML.exists(), reason=f"TLG export not cached: {XML}")


def _entries():
    return rl.load_map(MAP)


def test_every_column_and_consecutive_lines():
    by_col: dict[str, list[int]] = {}
    for e in _entries():
        m = re.match(r"^(\d+[ab])(\d+)$", str(e["bekker"]))
        by_col.setdefault(m.group(1), []).append(int(m.group(2)))
    assert list(by_col) == column_range("1181a", "1213b")
    for col, ns in by_col.items():
        first = 24 if col in ("1181a", "1181b") else 1
        assert ns[0] == first, col
        expect = list(range(first, ns[-1] + 1))
        if col == "1198b":   # Book II's title fills rows 21-23 of this column
            expect = [n for n in expect if n not in (21, 22, 23)]
        assert ns == expect, col
        if col in ("1181a", "1181b"):   # five lines under the title, then the notes
            assert ns[-1] == 28, col
        else:
            assert 30 <= ns[-1] <= 41, (col, ns[-1])
    assert by_col["1213b"][-1] == 30
    # the two columns of a page are printed to the same row
    for page in range(1181, 1214):
        assert by_col[f"{page}a"][-1] == by_col[f"{page}b"][-1], page


# Openings read off Bekker's page images (2026-11-06): five random windows
# (seed 7), the windows that tuned the tool, and every line an override or a
# doubt sent to the image. The word is the TLG word that opens the printed
# line; a word Bekker split goes to the line where it starts. Any map that
# moves one of these openings is wrong against the print.
READ_ON_THE_PAGE = {
    "1182b5": "καὶ", "1183a5": "τούτῳ", "1184a28": "ἐστὶν", "1184a29": "εὐδαιμονία,",
    "1184a30": "ὀρθῶς", "1184a31": "τὴν", "1184a32": "ἃ", "1184a33": "ἂν", "1184a34": "οἷον",
    "1184a35": "ἀγαθῶν", "1184a36": "ἐστὶν", "1184a37": "δὲ", "1185b14": "ὑπὸ", "1185b15": "καὶ",
    "1185b16": "(δεῖ", "1185b17": "εὐθέως", "1185b18": "φθείρεται", "1185b19": "καὶ",
    "1185b20": "φθείρεται", "1185b21": "γινομένων", "1186b10": "εἶναι", "1186b11": "ὑπερβολή.",
    "1186b12": "ὑπερβολὴ", "1186b13": "ἐνδεέστερον,", "1186b14": "ἄσωτοι", "1186b15": "τοὺς",
    "1186b16": "προπετεῖς", "1186b17": "προπετεῖς", "1186b18": "ἂν", "1188a24": "ὁμοίως·",
    "1188a25": "ἁρμόττουσιν,", "1188a26": "καὶ", "1188a27": "διειλόμεθα", "1188a28": "ἀλλὰ",
    "1188a29": "τέως", "1188a38": "Πρότερον", "1188b1": "ἀνάγκης.", "1188b14": "οὐ",
    "1189b1": "οὐκ", "1189b13": "ἔλαβον", "1189b14": "οὐχ", "1189b15": "ἀπαιτῇ",
    "1189b16": "βέλτιον", "1189b17": "βελτίω", "1189b18": "διὸ", "1189b19": "δὲ", "1189b20": "τὸ",
    "1190b9": "Ἐπεὶ", "1190b12": "δέ", "1190b13": "φοβεῖται", "1190b14": "οὔτ'",
    "1190b15": "τοιούτοις", "1190b16": "οὐδ'", "1190b17": "ἀστραπὰς", "1190b18": "ἀλλὰ",
    "1190b19": "ἐστιν", "1192b34": "τις", "1192b35": "τοιοῦτος", "1192b36": "δὴ", "1192b37": "ὢν",
    "1194b9": "γὰρ", "1195b17": "εἰ", "1196a26": "οἰκονομικόν.", "1196a27": "αὑτῆς",
    "1197a1": "λόγου", "1197a2": "αἵρεσις", "1200b14": "ἀρετή·", "1201b7": "τῆς",
    "1201b8": "δοξάζουσιν,", "1201b9": "ὑπὲρ", "1201b10": "οὔτ'", "1201b11": "τι", "1201b12": "τὴν",
    "1201b13": "ἐπιστήμην", "1201b14": "ἀκρατὴς", "1202b26": "ἀκρασίας.", "1205b1": "Ὁμοίως",
    "1206a4": "μέντοι", "1206a5": "ἐστι", "1206a6": "ἐμπόδιον", "1206a7": "ἀλλὰ", "1206a8": "τῆς",
    "1206a9": "μᾶλλον", "1206a10": "πράττειν", "1206a11": "πράττειν", "1211a5": "τὸ",
    "1213a30": "ἀναγκαῖον.", "1213b1": "ταῦτα",
}


def _nfc(s):   # the raised stop is U+0387 in TLG, U+00B7 when typed
    return unicodedata.normalize("NFC", s or "")


def test_openings_read_on_the_page():
    at = {str(e["bekker"]): _nfc(e["at"]) for e in _entries()}
    assert {r: at.get(r) for r in READ_ON_THE_PAGE} == {r: _nfc(w) for r, w in READ_ON_THE_PAGE.items()}


@needs_export
def test_openings_read_on_the_page_are_where_the_map_says():
    # `at` is checked against the export by relineate(); this guards the
    # golden list itself against an `at` that names the word at another place
    flat = {f"{l['column']}{l['n']}": l["text"] for l in rl.relineate(XML, MAP)}
    assert [r for r, w in READ_ON_THE_PAGE.items() if _nfc(flat[r].split()[0]) != _nfc(w)] == []


def test_refs_strictly_increase():
    refs = [ref_key(str(e["bekker"])) for e in _entries()]
    assert refs == sorted(refs) and len(set(refs)) == len(refs)


@needs_export
def test_spine_keeps_every_word_once():
    tokens = rl.tlg_tokens(XML)
    flat = rl.relineate(XML, MAP)
    assert len(flat) == len(_entries())
    assert " ".join(l["text"] for l in flat).split() == [t["text"] for t in tokens]
    assert all(l["text"] for l in flat)


@needs_export
def test_books_meet_at_the_map():
    tokens = rl.tlg_tokens(XML)
    index = {(t["loc"], t["w"]): i for i, t in enumerate(tokens)}
    book2 = next(i for i, t in enumerate(tokens) if t["book"] == 2)
    opener = {index[(e["loc"], e["w"])]: str(e["bekker"]) for e in _entries()}
    assert opener[book2] == MANIFEST["books"][1]["start"]


@needs_export
def test_manifest_chapters_follow_the_map():
    sys.path.insert(0, str(ROOT / "pipeline" / "tools"))
    import mm_bekker_lines as tool
    tokens = rl.tlg_tokens(XML)
    index = {(t["loc"], t["w"]): i for i, t in enumerate(tokens)}
    starts = [(str(e["bekker"]), index[(e["loc"], e["w"])]) for e in _entries()]
    want = tool.chapter_list(tokens, starts)
    got = [{"book": c["book"], "n": c["n"], "bekker": str(c["bekker"]), "word": c["word"]}
           for c in MANIFEST["chapters"]["list"]]
    assert got == want
    assert [c["n"] for c in got if c["book"] == 1] == list(range(1, 35))
    assert [c["n"] for c in got if c["book"] == 2] == list(range(1, 18))


@needs_export
@pytest.mark.parametrize("defect", ["wrong word", "moved word", "out of order", "late start"])
def test_a_map_that_no_longer_fits_stops_the_build(tmp_path, defect):
    entries = copy.deepcopy(_entries())
    if defect == "wrong word":
        entries[100]["at"] = entries[100]["at"] + "ς"
    elif defect == "moved word":
        entries[100]["w"] = int(entries[100]["w"]) + 1
    elif defect == "out of order":
        entries[100], entries[101] = entries[101], entries[100]
    else:
        entries = entries[1:]
    bad = tmp_path / "map.yaml"
    bad.write_text(yaml.safe_dump(entries, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ValueError):
        rl.relineate(XML, bad)
