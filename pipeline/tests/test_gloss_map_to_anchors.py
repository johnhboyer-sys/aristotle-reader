"""gloss_map_to_anchors reads the translation the map was built on: the slot
whose id is the map's vid, parsed with that slot's options. Meta's Ross strips
the archive's repeated quotation marks (strip_quote_repeats), and its map's
offsets were moved onto that text; parsed without it every chapter is a few
characters long and the build aborts."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import gloss_map_to_anchors as g  # noqa: E402
from aristotle_pipeline.config import SOURCES_DIR, Manifest  # noqa: E402
from aristotle_pipeline.stage1_ross import parse_translation  # noqa: E402


def test_meta_anchors_are_phrases_of_the_stripped_text():
    entries = g.build("Meta", "ross")
    sec = Manifest.for_work("Meta").data["english"]["secondary"]
    prose = parse_translation(SOURCES_DIR / sec["dir"], sec["books"], sec["marker"],
                              strip_quote_repeats=True)
    flat = " ".join(" ".join(t.split()) for t in prose.values())
    gmap = json.loads((SOURCES_DIR.parent / "alignment-results/ross/Meta_ross_gloss_map.json").read_text())
    real = {a["citation"] for e in gmap.values() for a in e["anchors"] if a["tier"] in g.REAL_TIERS}
    assert len(entries) == len(real)
    assert all(e["at"] in flat for e in entries)
