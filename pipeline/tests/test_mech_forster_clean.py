"""Mechanica: Forster's translation carries none of his footnotes, and nothing
from the book that follows it in the volume.

The source OCR (Oxford Works vol. VI, 1913; archive.org works0006aris) ran
footnotes into the text at a dozen places, dropped or displaced printed lines
beside the figures, and ended the last Part with the 1908 imprint and
Joachim's preface to De Lineis Insecabilibus. Separated against the scan on
2026-09-29; this keeps a re-fetch of the source from undoing it.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _prose() -> dict:
    cfg = yaml.safe_load((ROOT / "manifests" / "Mech.yaml").read_text(encoding="utf-8"))
    return stage1_archive._load_prose(cfg["english"]["primary"])


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def test_ends_where_forster_ends():
    last = sorted(_prose().items())[-1][1]
    assert last.rstrip().endswith("all objects must necessarily collect there.")


def test_no_footnotes_or_lin_preface():
    text = _text()
    for word in ("HENRY FROWDE", "Hayduck", "Apelt", "Capelle", "Leid. MS",
                 "Tenendum", "should probably be read", "Reading with"):
        assert word not in text, word


def test_dropped_lines_restored():
    text = re.sub(r"\s+", " ", _text())
    assert "Let ABΓ be a circle, and let the point B at the summit" in text     # 849a
    assert "Now the radius AΘ describes the arc XΘ in the same time" in text   # 849b
    assert "estimate of its size. Let ABΓ be the wedge, and ΔEHZ" in text      # 853a


def test_part_4_opens_with_its_question():
    part4 = _prose()[(1, 4)]
    assert part4.startswith("Why is it that, as has been remarked at the beginning of this treatise")


def test_no_note_marks():
    assert not re.findall(r"[®°©*«]", _text())
