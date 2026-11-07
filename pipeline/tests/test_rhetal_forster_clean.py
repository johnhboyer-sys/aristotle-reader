"""Rhetorica ad Alexandrum: Forster's translation as built from three OCR
scans of the 1924 Oxford volume (pipeline/tools/build_rhetal_forster.py),
with none of his footnotes, and the readings settled from the page images.

These pin what the scans got wrong and the page images settled, so a rebuild
that loses one of them fails here. The full check against the scans is
pipeline/tools/verify_rhetal_forster.py (it needs the OCR, kept out of git).
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _prose() -> dict:
    cfg = yaml.safe_load((ROOT / "manifests" / "RhetAl.yaml").read_text(encoding="utf-8"))
    return stage1_archive._load_prose(cfg["english"]["primary"])


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def test_the_letter_and_38_chapters():
    prose = _prose()
    assert sorted(prose) == [(1, n) for n in range(1, 40)]
    assert prose[(1, 1)].startswith("[Aristotle to Alexander. Salutation. You write that")
    assert prose[(1, 1)].rstrip().endswith("these two treatises. Farewell.]")
    assert prose[(1, 2)].startswith("Public speeches fall into three classes")


def test_ends_where_forster_ends():
    last = sorted(_prose().items())[-1][1]
    assert last.rstrip().endswith("To a state a multitude of good citizens is an advantage.]")


def test_no_footnotes():
    text = _text()
    for word in ("Reading with", "Spengel", "Hammer", "Wendland", "MSS", "Cp. ", "CFOP",
                 "Hibeh", "Rhys Roberts", "RHETORICA AD ALEXANDRUM", "CHAPTER"):
        assert word not in text, word


def test_no_note_marks_or_ocr_debris():
    text = _text()
    assert not re.findall(r"[®°©*«»^|_§¹²³]|\d", text)
    assert not re.search(r"\s[;:,.?!]", text)  # a stop set apart from its word


def test_quotes_and_brackets_balance():
    for key, p in _prose().items():
        for o, c in ("()", "[]", "⟨⟩"):
            assert p.count(o) == p.count(c), (key, o)
        depth = 0
        for m in re.finditer(r"[‘’]", p):
            i = m.start()
            if m.group() == "’" and p[i - 1:i].isalpha() and p[i + 1:i + 2].isalpha():
                continue  # an apostrophe
            if m.group() == "‘":
                assert depth == 0, (key, p[i - 60:i + 20])
                depth = 1
            elif depth:
                depth = 0
        assert depth == 0, key


def test_readings_from_the_page_images():
    text = re.sub(r"\s+", " ", _text())
    for s in (
        "‘I indeed (μέν) came to the place", "but (δέ) you, though you promised",
        "both (καί) the cause of that and (καί) the cause of this",
        "this man (τοῦτον ὑπὸ τούτου τύπτεσθαι).’ This is an example",
        "threshold (ὀδός) of a door and of a way (ὁδός)",
        "defence, [which are concerned with forensic business,] and the elements",
        "while examples ⟨are supplied from our own experience",
        "‘Parisosis’ takes a form", "using ‘irony’ in the following way",
        "the figure of ‘pretended omission’, and promise",
        "‘Did you kill my son?’—‘Yes, I did kill him",
        "our benefactors’. You will discover",
        # leaf 50 ends with "proem." alone on its last line, over a footnote
        "narratives of facts in our proem. Next comes",
    ):
        assert s in text, s


def test_readings_found_against_genie():
    # A diff against Genie's OCR (a fourth witness) found these, which all
    # three scans misread alike; each was read on the page image. The pair is
    # (what the print has, what the scans gave).
    text = re.sub(r"\s+", " ", _text())
    pairs = [
        ("contrary case: ‘As it is just to punish", "contrary case: it is just"),
        ("for a long time’", "for along time"),
        ("Let us now deal with", "Let us new deal"),
        ("top of another: ‘If", "another!:"),
        ("whether he is poor. For such", "poor, For"),
        ("confusion or transposition. The following", "transposition, The"),
        ("to good luck, ⟨you must", "luck, (you"),
        ("his earliest years⟩, observing", "years), observing"),
        ("oratory of accusation and inquiry", "accusation? and"),
    ]
    assert len(pairs) == 9
    for printed, misread in pairs:
        assert text.count(printed) == 1, printed
        assert misread not in text, misread


def test_line_end_hyphens():
    text = _text()
    for joined in ("commission", "discreditable peace", "rateable property"):
        assert joined in text, joined
    for kept in ("council-chamber", "breathing-space", "self-control"):
        assert kept in text, kept


def test_paragraph_openings_and_anchors_fall_on_words():
    # A page-image reading that drops a call-out at a paragraph's head once
    # moved that opening back past the stop (". [Sacrifices", Part 39).
    cfg = yaml.safe_load((ROOT / "manifests" / "RhetAl.yaml").read_text(encoding="utf-8"))
    eng = cfg["english"]["primary"]
    paras = stage1_archive._load_paragraphs(eng, _prose())
    assert sum(len(v) for v in paras.values()) > 100
    for es in paras.values():
        for e in es:
            assert e["at"][0].isupper() or e["at"][0] in "[‘(⟨", e
    anchors = yaml.safe_load((ROOT / "sources" / eng["anchors"]).read_text(encoding="utf-8"))
    assert len(anchors) == 472   # an empty file would pass the loop below
    text = re.sub(r"\s+", " ", _text())
    for a in anchors:
        assert re.search(r"(?:^| )" + re.escape(a["at"]), text), a


def test_anchors_run_in_bekker_order_and_name_distinct_places():
    cfg = yaml.safe_load((ROOT / "manifests" / "RhetAl.yaml").read_text(encoding="utf-8"))
    anchors = yaml.safe_load((ROOT / "sources" / cfg["english"]["primary"]["anchors"]).read_text(encoding="utf-8"))
    keys = [(int(m[1]), m[2], int(m[3])) for m in
            (re.fullmatch(r"(\d{4})([ab])(\d+)", a["bekker"]) for a in anchors)]
    assert keys == sorted(keys) and len(set(keys)) == len(keys)
    assert len({a["at"] for a in anchors}) == len(anchors)
    # 1426a35 opens on words that recur three lines on ("…a great good")
    assert any(a["bekker"] == "1426a35" and a["at"].endswith("a great evil,") for a in anchors)
