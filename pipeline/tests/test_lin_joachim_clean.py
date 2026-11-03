"""De Lineis Insecabilibus: Joachim's translation carries none of his commentary.

The source OCR (Joachim, Oxford 1908; archive.org delineisinsecabi00arisrich)
ran the continuation halves of his footnotes into the translation, and dropped
the page holding 969a26-b3. Both were separated against the scan on
2026-09-29; this keeps a re-fetch of the source from undoing it.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _text() -> str:
    cfg = yaml.safe_load((ROOT / "manifests" / "Lin.yaml").read_text(encoding="utf-8"))
    prose = stage1_archive._load_prose(cfg["english"]["primary"])
    return "\n".join(v for _, v in sorted(prose.items()))


def test_translation_is_whole():
    text = _text()
    # The printed translation is ~5,100 words; with the commentary in, 9,400.
    words = len(re.findall(r"[A-Za-z]+", text))
    assert 4800 < words < 5600, words
    assert "counting is movement combined with pausing" in text  # 969b2-3, lost page


def test_no_commentary():
    text = _text()
    for word in ("Apelt", "MSS", "Hayduck", "Theaetetus", "Bonitz", "I adopt", "I read"):
        assert word not in text, word


def test_every_margin_anchor_is_found_once():
    # anchors.yaml is Joachim's margin numbers, read from the scan; a phrase that
    # stops matching after an edit to the source silently loses its real tick
    # (or, for a {column}1 entry, its column break).
    text = re.sub(r"\s+", " ", _text())
    entries = yaml.safe_load(
        (ROOT / "sources" / "lin-joachim" / "anchors.yaml").read_text(encoding="utf-8"))
    assert len(entries) == 80
    for e in entries:
        assert text.count(e["at"]) == 1, e["bekker"]
    # In the text they run in citation order (a swapped bekker value breaks it).
    key = lambda ref: (int(ref[:3]), ref[3], int(ref[4:]))
    by_text = sorted(entries, key=lambda e: text.index(e["at"]))
    assert [e["bekker"] for e in by_text] == sorted((e["bekker"] for e in entries), key=key)


def test_no_note_marks_or_margin_numbers():
    text = _text()
    # (Joachim's own "!" at 969b16 is real; these never are.)
    assert not re.findall(r"[®°©*᾿]", text)
    # Joachim's margin Bekker line numbers, run in at a paragraph's start.
    assert not re.findall(r"(?m)^\s*(?:\d+|Io|wo)\.?\s+[(§]", text)
