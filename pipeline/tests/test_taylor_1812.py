"""Taylor's Categories and On Interpretation are his own 1812 print, not the modernised text.

Until 2026-11-07 sources/cat-taylor and int-taylor held a reworked edition ("CLAA", modernizer
unknown) under Taylor's name: essence became Substance, a Latin/Greek list of the categories was
added to Cat. 4, Int. 2 lost Taylor's gloss on καλὸς ἵππος, Int. 5 lost words, and his notes were
dropped. The text is now built from page images of the 1812 volume (archive.org works00taylgoog)
by pipeline/tools/build_taylor_1812.py; these checks fail on the old text.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _prose(work: str) -> dict[int, str]:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    return {c: re.sub(r"\s+", " ", t) for (_, c), t in
            stage1_archive._load_prose(cfg["english"]["secondary"]).items()}


def _notes(d: str) -> dict[str, str]:
    return json.loads((ROOT / "sources" / d / "footnotes.json").read_text(encoding="utf-8"))


def test_cat_1_says_essence():
    ch1 = _prose("Cat")[1]
    assert ch1.startswith("Things are said to be homonymous of which the name alone is common, "
                          "but the definition of essence according to the name is different")
    assert "Substance" not in ch1


def test_cat_4_has_no_latin_list():
    ch4 = _prose("Cat")[4]
    assert "substantiam" not in ch4 and "οὐσία" not in ch4
    assert ch4.startswith("Of the things which are enunciated without any connection, each of them "
                          "either signifies essence, or a quantity")


def test_int_2_kalos_ippos():
    assert "kalos ippos (i. e. a beautiful horse)" in _prose("Int")[2]


def test_int_5_or_not():
    # The old text: "either when he is interrogated by someone or speaks from himself".
    assert "interrogated by any one or not, but that he speaks from" in _prose("Int")[5]


def test_chapters_are_taylors():
    assert sorted(_prose("Cat")) == list(range(1, 16))
    assert sorted(_prose("Int")) == list(range(1, 15))


def test_notes_pair_with_markers():
    for work, d in (("Cat", "cat-taylor"), ("Int", "int-taylor")):
        text = " ".join(_prose(work).values())
        cited = re.findall(r"\[\^(\d+)\]", text)
        notes = _notes(d)
        assert cited == [str(i) for i in range(1, len(notes) + 1)], work
        assert all(v.startswith("<p>") and v.strip() for v in notes.values()), work


def test_sources_are_what_the_transcripts_build():
    r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "tools" / "build_taylor_1812.py"),
                        "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
