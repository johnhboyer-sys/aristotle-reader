"""De Plantis: Forster's translation as printed, without his footnotes, the
book heading or the closing line from the Latin, and with Bekker ticks only
where he prints a margin number.

The text was read from five OCR readings of four scans of the Oxford Works
vol. VI (1913) by tools/build_plant_forster.py, and the doubtful places settled
on the page images on 2026-11-06. This keeps a rebuild or a hand edit from
undoing those readings.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "sources" / "plant-forster"


def _cfg() -> dict:
    return yaml.safe_load((ROOT / "manifests" / "Plant.yaml").read_text(encoding="utf-8"))


def _prose() -> dict:
    return stage1_archive._load_prose(_cfg()["english"]["primary"])


def _text() -> str:
    return re.sub(r"\s+", " ", " ".join(v for _, v in sorted(_prose().items()))).strip()


def test_seventeen_parts_open_as_printed():
    prose = _prose()
    assert sorted(prose) == [(1, c) for c in range(1, 8)] + [(2, c) for c in range(1, 11)]
    openings = {
        (1, 1): "Life is found in animals and plants", (1, 2): "Let us now investigate",
        (1, 3): "Some trees contain a gummy substance", (1, 4): "Some plants produce their fruit",
        (1, 5): "A plant which is fixed in the ground", (1, 6): "In aromatic trees",
        (1, 7): "Again, some plants change", (2, 1): "A plant has three powers",
        (2, 2): "We have set forth the causes", (2, 3): "So too in the case of plants",
        (2, 4): "Plants which grow on the surface", (2, 5): "A plant which grows upon solid rock",
        (2, 6): "Every plant of whatsoever kind", (2, 7): "Trees have three different methods",
        (2, 8): "Greenness must be", (2, 9): "The shedding of leaves",
        (2, 10): "Fruit will be bitter",
    }
    for key, start in openings.items():
        assert prose[key].startswith(start), key


def test_ends_where_forster_ends():
    text = _text()
    assert text.endswith("and the fruit will become bitter.")
    assert "Here ends" not in text


def test_no_note_marks_digits_or_double_quotes():
    text = _text()
    assert not re.findall(r"[\d*®°©¹²³†‡§“”\"<>+]", text)


def test_lines_the_primary_scan_lost_are_restored():
    text = _text()
    for line in (
        "by which it reaches completion are not parts of it; but the",       # 818b20
        "of heat that it causes moisture to rise and makes its way",          # 823a35
        "therefore, will be the basis of sand, and will only become",         # 824a1
        "ground is fresh, water is generally not far away. When,",            # 825b30
        "When these four conditions are fulfilled, a plant will grow",        # 826a40
    ):
        assert line in text, line


def test_readings_settled_on_the_page_image():
    text = _text()
    for good, bad in (
        ("nor desire; for desire", "nor desire for desire"),
        ("and gum-arabic. Some", "gumarabic"),
        ("in ⟨almost⟩ all", "(almost)"),
        ("ducts within will", "ducts Within"),
        ("finally bitter. The reason", "[he reason"),
        ("and intelligence. For nature,", "intelligence For"),
        ("real fruits, as we", "fruits,!"),
        ("desert wind). . .", "wind )"),
        ("called ‘goatberry’.", "called goatberry"),
    ):
        assert good in text, good
        assert bad not in text, bad


def test_anchors_are_forsters_margin_in_order():
    entries = yaml.safe_load((SRC / "anchors.yaml").read_text(encoding="utf-8"))
    assert len(entries) == 264
    text = _text()
    pos, last = -1, (0, "", 0)
    for e in entries:
        m = re.fullmatch(r"(\d+)([ab])(\d+)", e["bekker"])
        assert m, e
        cite = (int(m.group(1)), m.group(2), int(m.group(3)))
        assert cite > last, e
        last = cite
        hits = [h.start() for h in re.finditer(r"\s+".join(map(re.escape, e["at"].split())), text)]
        assert len(hits) == 1, e
        assert hits[0] > pos, e
        pos = hits[0]
    # Forster prints 827a8 and 827a12 around the bracketed 827a9-11, not 827a10.
    cites = [e["bekker"] for e in entries]
    assert "827a8" in cites and "827a12" in cites and "827a10" not in cites
    # Column labels stand as each column's first Berlin line: 815b opens at 10.
    assert cites[:7] == ["815a10", "815a15", "815a20", "815a25", "815a30", "815a35", "815b10"]
