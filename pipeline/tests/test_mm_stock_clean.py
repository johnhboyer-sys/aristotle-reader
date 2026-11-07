"""Magna Moralia: Stock's translation carries none of his footnotes, none of
the parallel-passage notes, and none of the print's furniture.

The source is Wikisource's unproofread transcription of Oxford Works vol. IX
(1915), set right word by word against two archive.org scans of the same
printing (tools/build_mm_stock.py). It ran margin numbers into the text
("others to have said"), dropped marks (the colon in "exists in all:"), put
stray full stops where a margin number stood, and left Book II's chapter
number 1 in as the word "I". This keeps a re-fetch of the source from undoing
the fixes.
"""

from __future__ import annotations

import re

import yaml

from aristotle_pipeline import stage1_archive
from aristotle_pipeline.config import SOURCES_DIR

CFG = {"dir": "mm-stock", "books": 2, "chapter_marker": "part"}


def _prose() -> dict:
    return stage1_archive._load_prose(CFG)


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def _flat() -> str:
    return re.sub(r"\s+", " ", _text())


def test_thirty_four_plus_seventeen_chapters():
    keys = sorted(_prose())
    assert keys == [(1, n) for n in range(1, 35)] + [(2, n) for n in range(1, 18)]


def test_starts_and_ends_where_stock_does():
    prose = _prose()
    assert prose[(1, 1)].startswith("Since our purpose is to speak about ethics,")
    assert prose[(2, 1)].startswith("After this we must inquire into equity. What is it? And what")
    assert prose[(2, 17)].rstrip().endswith(
        "friendship between friends who are on a footing of equality.")


def test_no_footnotes_or_parallel_notes():
    text = _text()
    for word in ("Casaubon", "Susemihl", "Bonitz", "Spengel", "Rassow", "Reading ", "Printing thus",
                 "addenda", "Omitting", "E. N.", "E.N.", "E. E.", "E.E.", "Eur. Orest",
                 "verbal agreement", "quo fit ut omnis"):
        assert word not in text, word


def test_no_running_heads_margin_numbers_or_note_marks():
    text = _text()
    assert "MAGNA" not in text and "MORALIA" not in text
    assert not re.search(r"BOOK I", text)
    assert not re.search(r"\d", text), re.findall(r".{20}\d.{20}", text)[:3]
    assert not re.findall(r"[®°©*«»|¦†‡§¶]", text)
    assert not re.search(r"[α-ωΑ-Ω]", text)           # no Greek: the footnotes carried it all


def test_quotes_are_typographic():
    text = _text()
    assert "'" not in text and '"' not in text
    assert "‘good’ itself" in text
    assert "what’s more" in text                       # an apostrophe


def test_no_line_end_hyphens_or_stray_spaces():
    text = _text()
    assert not re.search(r"\w- \w", text)
    assert not re.search(r"\w-$", text, flags=re.M)
    assert not re.search(r"[ \t]{2,}", text)
    for joined in ("twofold", "blameworthy", "mentioned", "cannot be", "shoemaker",
                   "uniformity", "accomplishing", "appearance"):
        assert joined in text, joined
    assert "above-mentioned" in text and "self-control" in text and "well-being" in text


def test_ocr_errors_stay_fixed():
    flat = _flat()
    # a margin number read as a word
    assert "what others have said before us on this subject" in flat          # B298: 10
    assert "the quadrilateral has its angles equal to four right angles" in flat   # B320: 10
    assert "pretends to have more than he has" in flat                          # B331
    assert "he does have and does know" in flat                                 # B331
    assert "gives the housebuilder food" in flat                                # B333: 10
    assert "What is it? And what is its field" in flat                          # B347: chapter 1
    # a misread word, and a word Wikisource dropped
    assert "to four, then according as the triangle" in flat                    # 'hen'
    assert "the subject of our inquiry is how the truth stands" in flat
    # marks the scans agree on and Wikisource lost
    assert "exists in all: it therefore is not identical" in flat
    assert "the soul is not: but the soul also exists" in flat
    assert "it will be one): so that when it has become one" in flat
    assert "a vice of brutality." in flat
    # full stops and commas that were a margin number
    assert "owing to pain that we abstain from noble ones" in flat
    assert "does no one blame us for things" in flat
    assert "the malicious man will be pleased at ill-fortune" in flat
    assert "(but his name seems to be given to him" in flat
    assert "but a son as against his father" in flat
    assert "left in doubt about all things" in flat
    assert "the like behaviour in accordance with virtue" in flat
    assert "view of this point as follows" in flat
    assert "common to all is not good" in flat
    assert "her appearance before which she was acquitted" in flat
    # print's own spellings and signs
    assert "no way co-operates towards happiness" in flat
    assert "From ĕthos comes ēthos" in flat
    assert "A : B : : C : D." in flat
    assert "⟨or he who has some good⟩" in flat
    assert "∴ I know how to cure this man." in flat
    assert "‘Well, you have nothing in your soul of a kind which will enable you to hold office " \
           "or steer the ship.’ In the case of the body" in flat


def test_ellipses_are_one_character_spaced():
    flat = _flat()
    assert flat.count(" … ") == 4
    assert "has been spoken of … we must next inquire" in flat
    assert "nothing else. … For whoever abstains" in flat


def test_quotation_marks_balance_but_for_the_print_own():
    for key, text in sorted(_prose().items()):
        depth = 0
        for i, c in enumerate(text):
            if c == "‘":
                depth += 1
            elif c == "’" and not (text[i - 1].isalpha() and text[i + 1:i + 2].isalpha()):
                depth -= 1
        # Book II ch. 10 prints one closing quote with no opener ("when he is pale?’")
        assert depth == (-1 if key == (2, 10) else 0), key


def test_anchors_cover_every_column_in_order():
    entries = yaml.safe_load((SOURCES_DIR / "mm-stock" / "anchors.yaml").read_text(encoding="utf-8"))
    cols = []
    for e in entries:
        col, line = e["bekker"][:5], int(e["bekker"][5:])
        if not cols or cols[-1][0] != col:
            cols.append((col, []))
        cols[-1][1].append(line)
    names = [c for c, _ in cols]
    assert names == [f"{n}{s}" for n in range(1181, 1214) for s in "ab"]      # 66 columns
    for col, lines in cols:
        assert lines == sorted(set(lines)), (col, lines)
    assert entries[0]["bekker"] == "1181a24" and entries[-1]["bekker"] == "1213b30"
    prose = _prose()
    books = {1: "\n".join(v for (b, _), v in sorted(prose.items()) if b == 1),
             2: "\n".join(v for (b, _), v in sorted(prose.items()) if b == 2)}
    for e in entries:
        book = 1 if (e["bekker"][:5], int(e["bekker"][5:])) < ("1198b", 24) else 2
        pat = r"(?<!\S)" + r"\s+".join(re.escape(w) for w in e["at"].split()) + r"(?!\S)"
        assert len(re.findall(pat, books[book])) == 1, e


def test_builder_keeps_one_letter_words_both_scans_have():
    # Codex review 2026-11-06: the restore step took only words of 2+ letters,
    # so "is a good" in both scans, "is good" in Wikisource, lost the "a".
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
    from build_mm_stock import _gap_word
    assert all(_gap_word(w) for w in ("a", "A", "I", "O", "good.", "virtue,"))
    assert not any(_gap_word(w) for w in ("E.", "N.", "1", "§", "x"))
