"""Problemata: Forster's translation as the print has it, not as either scan read it.

The source is rebuilt from two archive.org OCR scans of the Oxford Works vol.
VII (1927) by pipeline/tools/build_prob_forster.py, which has its own --verify
against both scans. This test pins what that work settled (2026-11-06, Codex
review 7 clean) so a rebuild with a looser rule cannot quietly undo it.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _prose() -> dict:
    cfg = yaml.safe_load((ROOT / "manifests" / "Prob.yaml").read_text(encoding="utf-8"))
    return stage1_archive._load_prose(cfg["english"]["primary"])


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def test_every_part_is_there():
    prose = _prose()
    assert len(prose) == 889
    assert {book for book, _ in prose} == set(range(1, 39))


def test_starts_and_ends_where_forster_does():
    prose = sorted(_prose().items())
    assert prose[0][1].startswith("Why is it that great excesses cause disease?")
    assert prose[-1][1].rstrip().endswith("for that which is earthy always becomes black when burnt.")


def test_no_note_marks():
    text = _text()
    assert not re.findall(r"[®°©*«}]", text)
    # Forster's own square brackets (Books 19, 20) open and close; a stray one is a speck.
    assert text.count("[") == text.count("]")


def test_no_scan_punctuation_specks():
    # Each of these stood in the text once (Opus review 5); none is in the print.
    text = _text()
    for bad in (",?", "?;", "?:", "?.", ",}", ".}", "‘),", "colour. than", "Is. it"):
        assert bad not in text, bad
    # "?)" stands only where the print has it (3.25, 21.22, 25.13; image-checked in round 5).
    assert len(re.findall(r"\?\)", text)) == 3


def test_no_small_caps_misreads():
    text = _text()
    for bad in ("Wuy", "Whuy", "OVer", "OWing", "SO that"):
        assert bad not in text, bad


def test_case_as_printed():
    text = re.sub(r"\s+", " ", _text())
    assert "as Chaeremon says, that Wine mingles" in text      # 3.16, verse capital (A58)
    assert "Diluted wine on the other hand" in text             # 3.14, lower case (A58)
    assert "in the new locality, whereas with other" in text    # 10.7 (A119)
    assert "the sea extends over open spaces" in text           # 23.16 (A260)


def test_stray_full_stop_before_lower_case_is_gone():
    # A full stop then a lower-case word mid-sentence is a scan speck; the
    # print has none in this translation.
    hits = re.findall(r"\b[a-z]+\. [a-z]+\b", _text())
    allowed = {"viz. that"}
    assert [h for h in hits if h not in allowed] == []
