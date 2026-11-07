"""De Spiritu: Dobson's translation carries his footnotes as notes (never as
text), none of the page furniture, and every paragraph of the print.

Built from the Toronto hOCR of the Oxford Works vol. III (1914) by
pipeline/tools/build_spir_dobson.py and checked against a second scan by
verify_spir_dobson.py on 2026-11-06. The first parse dropped two paragraphs
whose words the OCR had tagged with a language; this keeps a rebuild from
losing them again.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]
NOTES = 66    # Dobson's footnotes, counted on the page images by two readers


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


MARKER = re.compile(r"\[\^(\d+)\]")


def _notes() -> dict:
    return json.loads((ROOT / "sources" / "spir-dobson" / "footnotes.json").read_text(encoding="utf-8"))


def test_no_footnotes_or_furniture():
    text = MARKER.sub("", _text())
    for word in ("Reading", "Omitting", "Jaeger", "W. D. R.", "Bonitz", "Didot",
                 "DE SPIRITU", "CHAPTER", "AR. "):
        assert word not in text, word


def test_language_tagged_paragraph_kept():
    text = re.sub(r"\s+", " ", _text())
    assert ("With regard to respiration, some philosophers—such as Empedocles "
            "and Democritus—do not deal with its purpose") in text          # 482a28


def test_no_note_marks_or_figures():
    # the OCR reads Dobson's raised figures as ! ? ® ° * | and digits; only
    # our own [^N] markers may stand for them
    text = MARKER.sub("", _text())
    assert not re.findall(r"[®°©*«†|\d^]", text)


def test_every_note_is_cited_in_order():
    notes = _notes()
    assert list(notes) == [str(n) for n in range(1, len(notes) + 1)]
    assert len(notes) == NOTES
    cited = [int(n) for n in MARKER.findall(_text())]
    first = list(dict.fromkeys(cited))
    assert first == list(range(1, len(notes) + 1))      # each cited, in print order


def test_notes_are_clean():
    for n, note in _notes().items():
        assert note.strip(), n
        assert note == unicodedata.normalize("NFC", note), n
        assert not re.search(r"[®°©|]", note), (n, note)
        assert not re.search(r"<(?!/?(em|sup)>)", note), (n, note)
        assert note.count("<em>") == note.count("</em>"), n


def test_notes_sit_where_dobson_prints_them():
    text = re.sub(r"\s+", " ", _text())
    for printed in ("nutriment[^1] is",              # 452, the first note
                    "difficulty;[^", "Empedocles[^",
                    "[[^", "passage.[^"):          # 461: one note, two figures
        assert printed in text, printed


def test_angle_brackets_are_dobsons():
    # printed ⟨ ⟩ (a supplement), which both OCR readers take for ( )
    assert "for ⟨performing it well.⟩" in MARKER.sub("", _text())


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


def test_note_misprint_corrected():
    # 463 n.2 prints "de Caelo, 239b 30"; the Timaeus is quoted at 293b30
    text = "".join(_notes().values())
    assert "<em>de Caelo</em>, 293<sup>b</sup> 30" in text
    assert "239<sup>b</sup>" not in text


def test_every_printed_paragraph():
    # 72 as printed; a paragraph ending in a note mark once ran into the next
    assert sum(len(v.strip().split("\n")) for v in _prose().values()) == 72


def test_each_figure_cited_as_often_as_printed():
    # 68 figures for 66 notes: 454 prints its 5 twice, 461 its 1 twice
    # (opening and closing a bracketed passage)
    cited = MARKER.findall(_text())
    assert len(cited) == 68
    twice = sorted({n for n in cited if cited.count(n) == 2}, key=int)
    assert twice == ["16", "39"]
    assert all(cited.count(n) <= 2 for n in cited)
    text = _text()
    assert "lungs[^16] that" in text and "lungs[^16] cannot" in text
    assert "[[^39]For" in text and "passage.[^39]]" in text


def test_markers_sit_between_words():
    assert not re.search(r"[^\W\d_]\[\^\d+\][^\W\d_]", _text())
    assert not re.search(r"\]\[\^", _text())          # no doubled marker
