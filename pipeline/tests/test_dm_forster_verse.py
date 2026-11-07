"""De Mundo's verse quotations are set line by line, as Forster's print sets
them (Oxford vol. III, 1931): each line opens with the print's capital, with no
quote marks added, and each opens on a break the reader draws. A line break is
either a `\\n` in the parsed prose (a <p> after a sentence end) or an entry in
sources/dm-forster/paragraphs.yaml."""

from __future__ import annotations

import yaml

from aristotle_pipeline import stage1_archive

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

VERSE = [
    "Taken his seat in heaven's topmost height;",
    "Whatsoever hath been and is now and shall be hereafter,",
    "All alike hath its birth—men, women, trees of the forest,",
    "Beasts of the field and fowls of the air and fish in the water.",
    "Unto Olympus' height, where men say that the gods have their dwelling,",
    "Alway safe and secure; no wind ever shaketh its stillness,",
    "Nor is it wet with the rain; no snow draweth nigh; but unclouded,",
    "Ever the air is outspread, and a white sheen floateth about it.",
    "Heaven belongeth to Zeus, wide spread mid the clouds and the ether.",
    "And all the town is full of incense smoke,",
    "And full of cries for aid and loud laments.",
    "Alder and poplar-tree and cypress breathing sweet odours,",
    "Pear-trees and pomegranate-trees and apple-trees glorious-fruited,",
    "Zeus of the flashing bolt was the first to be born and the latest,",
    "Zeus is the head and the middle; of Zeus were all things created;",
    "Zeus is the stay of the earth and the stay of the star-spangled heaven;",
    "Zeus is male and female of sex, the bride everlasting;",
    "Zeus is the breath of all and the rush of unwearying fire;",
    "Zeus is the root of the sea, and the sun and the moon in the heavens;",
    "Zeus of the flashing bolt is the king and the ruler of all men,",
    "Hiding them all away, and again to the glad light of heaven",
    "Bringing them back at his will, performing terrible marvels.",
]
# the prose that resumes after a verse line ending in ',' or ';'
RESUMED = ["and the heavenly body", "and trees which produce autumn", "and animals, both wild"]


def _cfg() -> dict:
    m = yaml.safe_load((ROOT / "manifests" / "DM.yaml").read_text(encoding="utf-8"))
    return m["english"]["primary"]


def _breaks() -> tuple[dict, dict]:
    cfg = _cfg()
    prose = stage1_archive._load_prose(cfg)
    paras = stage1_archive._load_paragraphs(cfg, prose)
    at = {k: {i + 1 for i, ch in enumerate(t) if ch == "\n"} | {e["offset"] for e in paras.get(k, [])}
          for k, t in prose.items()}
    return prose, at


def test_each_verse_line_opens_on_a_break():
    prose, at = _breaks()
    for line in VERSE + RESUMED:
        hits = [(k, t.find(line)) for k, t in prose.items() if line in t]
        assert len(hits) == 1, line
        k, i = hits[0]
        assert prose[k].count(line) == 1 and i in at[k], line


def test_no_run_in_quote_marks_on_the_verse():
    text = " ".join(stage1_archive._load_prose(_cfg()).values())
    for gone in ("'Whatsoever", "'Taken", "height';", "Homer—'Unto", "'Heaven", "'And all",
                 "'Alder", "odours,'", "'Pear-trees", "fruited,'", "'Zeus", "marvels.'",
                 "water.'", "laments.'", "about it.'", "ether.'"):
        assert gone not in text, gone


def test_breaks_are_not_doubled():
    # The reader draws a paragraph entry and a "\n" at one place as two gaps.
    cfg = _cfg()
    prose = stage1_archive._load_prose(cfg)
    for k, es in stage1_archive._load_paragraphs(cfg, prose).items():
        for e in es:
            assert e["offset"] > 0 and prose[k][e["offset"] - 1] != "\n", e
