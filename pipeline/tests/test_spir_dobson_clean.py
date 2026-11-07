"""De Spiritu: Dobson's translation carries none of his footnotes, none of the
page furniture, and every paragraph of the print.

Built from the Toronto hOCR of the Oxford Works vol. III (1914) by
pipeline/tools/build_spir_dobson.py and checked against a second scan by
verify_spir_dobson.py on 2026-11-06. The first parse dropped two paragraphs
whose words the OCR had tagged with a language; this keeps a rebuild from
losing them again.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _cfg() -> dict:
    return yaml.safe_load((ROOT / "manifests" / "Spir.yaml").read_text(encoding="utf-8"))


def _prose() -> dict:
    return stage1_archive._load_prose(_cfg()["english"]["primary"])


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def test_nine_parts():
    assert sorted(_prose()) == [(1, n) for n in range(1, 10)]


def test_opens_and_ends_where_dobson_does():
    parts = sorted(_prose().items())
    assert parts[0][1].startswith("What is the mode of growth of the natural breath")
    assert parts[-1][1].rstrip().endswith("stated in terms of hardness, density, and their opposites.")


def test_no_footnotes_or_furniture():
    text = _text()
    for word in ("Reading", "Omitting", "Jaeger", "W. D. R.", "Bonitz", "Didot",
                 "DE SPIRITU", "CHAPTER", "AR. "):
        assert word not in text, word


def test_language_tagged_paragraph_kept():
    text = re.sub(r"\s+", " ", _text())
    assert ("With regard to respiration, some philosophers—such as Empedocles "
            "and Democritus—do not deal with its purpose") in text          # 482a28


def test_no_note_marks_or_figures():
    text = _text()
    assert not re.findall(r"[®°©*«†|\d]", text)


def test_angle_brackets_are_dobsons():
    # printed ⟨ ⟩ (a supplement), which both OCR readers take for ( )
    assert "for ⟨performing it well.⟩" in _text()


def test_every_column_has_its_first_line():
    anchors = yaml.safe_load((ROOT / "sources" / "spir-dobson" / "anchors.yaml").read_text(encoding="utf-8"))
    refs = [a["bekker"] for a in anchors]
    assert len(refs) == len(set(refs)) == 80
    cols = [f"{n}{c}" for n in range(481, 487) for c in "ab"]
    for col in cols:
        assert f"{col}1" in refs, col
    text = _text()
    for a in anchors:
        assert text.count(a["at"]) == 1, a
