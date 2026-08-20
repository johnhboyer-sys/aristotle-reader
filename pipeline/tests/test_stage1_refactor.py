import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "tests" / "fixtures" / "stage1"))

import generate_stage1_goldens as fixtures  # noqa: E402
from aristotle_pipeline import (  # noqa: E402
    stage1_archive,
    stage1_chapters,
    stage1_english,
    stage1_greek,
    stage1_ostwald,
    stage1_perseus,
    stage1_ross,
)

FIXTURE_DIR = ROOT / "pipeline" / "tests" / "fixtures" / "stage1"


def _json_bytes(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8")


def _golden(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def test_stage1_english_matches_golden(tmp_path):
    path = tmp_path / "english.xml"
    fixtures.write_english_tei(path)
    english = stage1_english.parse_english(path, fixtures.DummyManifest())
    stage1_english.add_bekker_gutter(english, fixtures.spine())
    stage1_english.refine_chapter_lines(english, fixtures.spine())

    assert _json_bytes(english) == _golden("stage1_english_golden.json")
    assert _json_bytes(stage1_english.build_alignment(fixtures.spine(), english)) == _golden(
        "stage1_english_alignment_golden.json"
    )


def test_stage1_perseus_matches_golden(tmp_path):
    path = tmp_path / "perseus.xml"
    fixtures.write_perseus_tei(path)

    assert _json_bytes(
        fixtures.stringify_tuple_keys(stage1_perseus.chapter_prose(path))
    ) == _golden("stage1_perseus_chapter_prose_golden.json")


def test_stage1_chapters_matches_golden(tmp_path):
    path = tmp_path / "chapters.xml"
    fixtures.write_chapter_tei(path)

    assert _json_bytes(
        stage1_chapters.extract_chapters_grc(fixtures.spine(), str(path))
    ) == _golden("stage1_chapters_grc_golden.json")
    assert _json_bytes(
        stage1_chapters.extract_chapters_explicit(
            fixtures.spine(),
            [{"n": 1, "bekker": "1094a1"}, {"n": 2, "bekker": "1094b1", "title": "Second"}],
        )
    ) == _golden("stage1_chapters_explicit_golden.json")


def test_stage1_chapters_clamps_to_spine_book_cut(tmp_path):
    """A grc TEI that divides book 2 earlier than the spine does (Rhet: TEI book
    II opens at 1377b16, spine cuts book 2 at 1378a16). The chapter's opening
    words text-match inside book 1's spine segments; without the clamp the
    chapter is recorded at a (book=2, column-of-book-1) pair no spine segment
    carries, and stage7 silently drops its heading anchor (ch-2-1)."""
    spine = {
        "work": "TST",
        "segments": [
            {
                "id": "1:1377b",
                "book": 1,
                "column": "1377b",
                "lines": [
                    {"n": 1, "text": "Alpha beta."},
                    # TEI book 2 opens here, still inside spine book 1.
                    {"n": 2, "text": "Gamma delta epsilon zeta eta theta."},
                ],
            },
            {
                "id": "2:1378a",
                "book": 2,
                "column": "1378a",
                "lines": [
                    {"n": 16, "text": "Iota kappa."},
                    {"n": 17, "text": "Lambda mu nu xi omicron pi rho sigma."},
                ],
            },
        ],
    }
    path = tmp_path / "chapters.xml"
    path.write_text(
        """<TEI><text><body>
<div subtype="book" n="1">
<milestone unit="page" n="1377b"/><milestone unit="line" n="1"/>
<div subtype="chapter" n="1"><p>Alpha beta.</p></div>
</div>
<div subtype="book" n="2">
<div subtype="chapter" n="1"><p>Gamma delta epsilon zeta eta theta. Iota kappa.</p></div>
<div subtype="chapter" n="2"><p>Lambda mu nu xi omicron pi rho sigma.</p></div>
</div>
</body></text></TEI>""",
        encoding="utf-8",
    )

    chapters = stage1_chapters.extract_chapters_grc(spine, str(path))

    # Book 2 chapter 1 is clamped onto the spine's book-2 cut, not left on the
    # book-1 column its opening words matched in.
    # The clamp is authoritative but replaces the Greek-text match, so stage 6
    # must not treat the resulting wordIndex as token-exact.
    assert chapters[1] == {
        "book": 2, "chapter": "1", "column": "1378a", "line": "16",
        "wordIndex": 0, "bookstart": True,
    }
    # Later chapters still text-align normally after the clamp.
    assert chapters[2]["chapter"] == "2"
    assert (chapters[2]["column"], chapters[2]["line"]) == ("1378a", "17")


def test_stage1_chapter_step_back_does_not_claim_unverified_word_anchor(tmp_path):
    """A suffix match may infer the historical position without proving it.

    Here the TEI has a leading word absent from the spine. The existing
    step-back therefore lands on the preceding token; retain that position for
    compatibility, but do not let stage6 call it exact.
    """
    spine = {
        "work": "TST",
        "segments": [
            {
                "id": "1:1a",
                "book": 1,
                "column": "1a",
                "lines": [
                    {"n": 1, "text": "Alpha beta gamma delta."},
                    {"n": 2, "text": "Epsilon zeta eta theta iota kappa."},
                ],
            },
        ],
    }
    path = tmp_path / "chapters.xml"
    path.write_text(
        """<TEI><text><body><div subtype="book" n="1">
<div subtype="chapter" n="1"><p>Alpha beta.</p></div>
<div subtype="chapter" n="2"><p>Missing epsilon zeta eta theta iota kappa.</p></div>
</div></body></text></TEI>""",
        encoding="utf-8",
    )

    chapters = stage1_chapters.extract_chapters_grc(spine, str(path))

    assert chapters[1]["chapter"] == "2"
    assert (chapters[1]["line"], chapters[1]["wordIndex"]) == ("1", 3)
    assert "wordAnchor" not in chapters[1]


def test_stage1_greek_matches_golden(tmp_path):
    path = tmp_path / "greek.xml"
    fixtures.write_greek_tei(path)

    assert _json_bytes(stage1_greek.parse_spine(path, fixtures.DummyManifest())) == _golden(
        "stage1_greek_spine_golden.json"
    )


def test_stage1_ross_matches_golden(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    fixtures.write_archive_book(archive_dir / "book-01.html")

    prose = stage1_ross.parse_translation(archive_dir, 1, "number")
    assert _json_bytes(fixtures.stringify_tuple_keys(prose)) == _golden(
        "stage1_ross_translation_golden.json"
    )
    assert _json_bytes(stage1_ross.build_chunks(fixtures.spine(), fixtures.chapters(), prose)) == _golden(
        "stage1_ross_chunks_golden.json"
    )


def test_stage1_archive_matches_golden(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    fixtures.write_archive_book(archive_dir / "book-01.html")

    old_sources = stage1_archive.SOURCES_DIR
    try:
        stage1_archive.SOURCES_DIR = tmp_path
        archive_eng = stage1_archive.build_english(
            fixtures.DummyManifest(),
            fixtures.spine(),
            fixtures.chapters(),
            {"dir": "archive", "books": 1, "chapter_marker": "number", "name": "Archive Fixture"},
        )
    finally:
        stage1_archive.SOURCES_DIR = old_sources

    assert _json_bytes(archive_eng) == _golden("stage1_archive_english_golden.json")


def test_stage1_ostwald_matches_golden(tmp_path):
    path = tmp_path / "ostwald.md"
    fixtures.write_ostwald(path)
    prose, align, footnotes, counts, _titles = stage1_ostwald.parse_ostwald(path)

    assert _json_bytes(
        {
            "prose": fixtures.stringify_tuple_keys(prose),
            "align": align,
            "footnotes": footnotes,
            "counts": counts,
        }
    ) == _golden("stage1_ostwald_parse_golden.json")


class TestTickWordSnap:
    """A Bekker tick rebased onto a translation piece is snapped to a word start
    so it never splits a word. The search looked for spaces only, so the "\\n"
    that marks a paragraph break read as mid-word and pushed a tick that landed
    on the first word of a paragraph onto the second word.
    """

    def test_an_offset_after_a_paragraph_break_stays_put(self):
        text = "he lend an ear to Hesiod's words:\nThat man is all-best"
        off = text.index("That")
        assert stage1_ross._snap_word(text, off) == off

    def test_a_mid_word_offset_still_snaps(self):
        text = "he lend an ear to Hesiod's words:\nThat man is all-best"
        assert stage1_ross._snap_word(text, text.index("man") + 1) == text.index("man")


class TestOstwaldQuotedVerse:
    """Ostwald sets quoted verse as a Markdown blockquote, and the transcription
    keeps the printed indent of a runover line as `&nbsp;`. The parser used to
    tokenize both as content words, so the reader showed the markup in the prose
    ("> That man is all-best who himself works out > every problem").
    """

    SRC = """# BOOK I
## 1. Opening
1094a Let him lend an ear to Hesiod's words:

> That man is all-best who himself works out 5
> every problem. . . .
> 10 &nbsp;That man, too, is admirable.

> > A block quotation, doubly marked.

## Footnotes
[^1]: Quoted at 1013a24-35: > We speak of "cause" in one sense.
"""

    def _parse(self, tmp_path):
        path = tmp_path / "ostwald.md"
        path.write_text(self.SRC, encoding="utf-8")
        return stage1_ostwald.parse_ostwald(path)

    def test_blockquote_markers_never_reach_the_prose(self, tmp_path):
        prose, _, footnotes, _, _ = self._parse(tmp_path)
        text = prose[(1, 1)]
        assert ">" not in text and "&nbsp;" not in text
        assert "himself works out every problem" in text
        assert "10 &nbsp;That" not in text
        assert ">" not in footnotes[1] and "&gt;" not in footnotes[1]

    def test_the_bekker_anchors_still_land_on_their_words(self, tmp_path):
        prose, align, _, counts, _ = self._parse(tmp_path)
        text = prose[(1, 1)]
        at = {a["citation"]: a["offset"] for a in align["1:1"]["anchors"]}
        assert text.startswith("Let him lend")
        assert text[at["1094a1"]:].startswith("Let him")
        assert text[at["1094a5"]:].startswith("every problem")
        assert text[at["1094a10"]:].startswith("That man, too")
        assert counts["line_marks"] == 2


class TestOstwaldChapterApparatus:
    """Ostwald heads every chapter with a title of his own, sometimes hanging the
    chapter's footnote off it, and restarts his footnote numbering at each book.
    The parser used to drop heading lines whole — so six notes were defined but
    never cited, unreachable from the page — and numbered the notes straight
    through, so no number on screen matched a number in the printed edition.
    """

    SRC = """# BOOK I
## 1. *The good as the aim of action*
1094a First words.[^1]

## 2. *Politics as the master science*[^2]
More words.[^3]

# BOOK II
## 1. *Moral virtue*[^4]
1103a Formed by habit.[^5]

## Footnotes
[^1]: A note.
[^2]: A note hung on a chapter heading.
[^3]: Another note.
[^4]: A note opening the second book.
[^5]: The last note.
"""

    def _parse(self, tmp_path):
        path = tmp_path / "ostwald.md"
        path.write_text(self.SRC, encoding="utf-8")
        prose, align, footnotes, counts, titles = stage1_ostwald.parse_ostwald(path)
        labels = stage1_ostwald.renumber_by_book(prose, titles, footnotes)
        return prose, footnotes, titles, labels

    def test_the_chapter_titles_are_kept(self, tmp_path):
        _, _, titles, _ = self._parse(tmp_path)
        assert titles[(1, 1)] == "The good as the aim of action"
        assert titles[(2, 1)] == "Moral virtue[^2.1]"

    def test_a_note_hung_on_a_heading_is_still_cited(self, tmp_path):
        _, footnotes, titles, labels = self._parse(tmp_path)
        # [^2] is only ever referenced by chapter 2's heading.
        assert labels[2] == "1.2"
        assert "[^1.2]" in titles[(1, 2)]
        assert footnotes["1.2"] == "A note hung on a chapter heading."

    def test_the_numbering_restarts_at_every_book(self, tmp_path):
        prose, footnotes, _, labels = self._parse(tmp_path)
        assert labels == {1: "1.1", 2: "1.2", 3: "1.3", 4: "2.1", 5: "2.2"}
        assert sorted(footnotes) == ["1.1", "1.2", "1.3", "2.1", "2.2"]
        assert "[^2.2]" in prose[(2, 1)]

    def test_an_uncitable_note_stops_the_build(self, tmp_path):
        path = tmp_path / "ostwald.md"
        path.write_text(self.SRC + "[^6]: A note nothing points at.\n", encoding="utf-8")
        prose, _, footnotes, _, titles = stage1_ostwald.parse_ostwald(path)
        with pytest.raises(ValueError, match="never cited"):
            stage1_ostwald.renumber_by_book(prose, titles, footnotes)


class TestOstwaldFootnoteFigures:
    """Two of Ostwald's notes ARE diagrams. The transcription holds each as a
    `![alt](figure-id)` placeholder, which reached the popup as literal Markdown.
    """

    def test_a_placeholder_resolves_to_the_vetted_figure(self):
        html = stage1_ostwald._render_footnote(
            "See ![Diagram: two crossing lines](page-03-figure) for the pairing.",
            {"page-03-figure": '<figure class="fn-figure"><svg viewBox="0 0 2 2"></svg></figure>'},
        )
        assert html.startswith("See <figure")
        assert "![" not in html and "page-03-figure" not in html
        assert html.endswith("for the pairing.")

    def test_an_unknown_figure_id_stops_the_build(self):
        with pytest.raises(KeyError, match="figures.json"):
            stage1_ostwald._render_footnote("![alt](no-such-figure)", {})

    def test_markup_around_a_figure_is_still_escaped(self):
        html = stage1_ostwald._render_footnote(
            "<b>x</b> ![alt](f) *emphasis*", {"f": "<svg></svg>"})
        assert "&lt;b&gt;x&lt;/b&gt;" in html
        assert "<svg></svg>" in html and "<em>emphasis</em>" in html


class TestArchiveFurniture:
    """The Internet Classics Archive wraps every page in navigation, and a long
    work is served across several pages — so the chrome repeats mid-document.
    It shipped inside the English of 14 works and showed in the reader.
    """

    def test_strips_the_navigation_block_however_the_page_wrapped_it(self):
        from aristotle_pipeline.stage1_ross import _strip_furniture

        # As the page actually serves it: the words of a phrase split across
        # lines, which is why matching them as contiguous strings missed.
        text = (
            "Translated by J. I. Beare\n" + "x " * 150 + "\n"
            "the end in view is the good.\n"
            "THE END\n\n\n   \n\nTable of Contents\n\n\nHome\n\n\n"
            "Browse and\nComment\n\n\nSearch\n\n\nBuy Books and\nCD-ROMs\n\n"
            "Help\n\n\n© 1994-2009\n"
        )
        out = _strip_furniture(text)

        for gone in ("THE END", "Table of Contents", "Browse and", "Buy Books",
                     "CD-ROMs", "1994-2009"):
            assert gone not in out, f"{gone!r} survived"
        # and Aristotle's telos is untouched
        assert "the end in view is the good." in out

    def test_keeps_the_text_after_a_mid_document_page_break(self):
        """Cutting the document at the first nav block threw away the second
        half of De Sensu — the furniture is noise to excise, not an end marker.
        """
        from aristotle_pipeline.stage1_ross import _strip_furniture

        text = (
            "Translated by J. I. Beare\n" + "first half " * 60 + "\n"
            "Table of Contents\nHome\nBrowse and\nComment\nSearch\n"
            "Translated by J. I. Beare\n" + "second half " * 60 + "\n"
        )
        out = _strip_furniture(text)

        assert "first half" in out
        assert "second half" in out, "the page break truncated the work"
        assert "Table of Contents" not in out

    def test_strips_the_weak_trio_across_nbsp_and_blank_spacer_lines(self):
        """In the archive's nav table each of Home/Search/Help is followed by an
        &nbsp; cell (a "\\xa0" line once unescaped) plus the blank lines left
        where the strong items were excised. Requiring the words on immediately
        adjacent lines missed that block, and "Home Search Help" shipped at the
        end of the last chapter of every Metaphysics book (visible in the built
        Meta/book-14.json).
        """
        from aristotle_pipeline.stage1_ross import _strip_furniture

        # The tail of meta-ross book-14 as _book_text renders it.
        text = (
            "Translated by W. D. Ross\n" + "x " * 150 + "\n"
            "they are not the first principles.\n\n\n"
            "THE END\n\n\n\n\xa0\xa0\xa0\n\n\nTable of Contents\n\n\n\xa0\xa0\xa0\n"
            "\n\n\n\nHome\n\xa0\n\n\n\n\n\n\nBrowse and\nComment\n\n\n\n\n\n\n"
            "Search\n\xa0\n\n\n\n\n\n\nBuy Books and\nCD-ROMs\n\n\n\n\n\n\n"
            "Help\n\xa0\n\n\n\n© 1994-2009\n"
        )
        out = _strip_furniture(text)

        for gone in ("Home", "Search", "Help"):
            assert gone not in out, f"{gone!r} survived"
        assert "they are not the first principles." in out

    def test_keeps_a_lone_nav_word_inside_the_prose(self):
        """The weak words are ordinary English — Ogle's PA 3:10 has a sentence
        starting "Search was thereupon made". Only two or more standing together
        on their own lines are furniture.
        """
        from aristotle_pipeline.stage1_ross import _strip_furniture

        text = (
            "Translated by William Ogle\n" + "x " * 150 + "\n"
            "the words, 'Cercidas slew man on man.'\n"
            "Search was thereupon made and a man of that name was found.\n"
        )
        out = _strip_furniture(text)

        assert "Search was thereupon made" in out

    def test_leaves_a_circled_letter_used_as_a_geometry_label(self):
        """The Mechanica uses © to label a point. Matching the rest of the line
        after any © removed 2,845 words of Aristotle.
        """
        from aristotle_pipeline.stage1_ross import _strip_furniture

        text = ("Translated by E. S. Forster\n" + "x " * 150 + "\n"
                "from © let OQ be drawn parallel to AB, and ZY perpendicular.\n")
        out = _strip_furniture(text)

        assert "let OQ be drawn parallel to AB" in out


class TestOstwaldInlineLineNumber:
    """A marginal Bekker number is sometimes OCR'd inside the sentence it
    interrupts, taking that sentence's punctuation with it ("to our standards
    20; but this is"). It was neither recognised as a marker nor removed, so the
    tick stayed interpolated and the digit printed in the reading text.
    """

    SRC = """# BOOK I
## 1. Opening
1094a Refer the gods to our standards 20; but this is precisely what praising them means.
"""

    def test_the_number_anchors_and_its_punctuation_goes_back_to_the_word(self, tmp_path):
        path = tmp_path / "ostwald.md"
        path.write_text(self.SRC, encoding="utf-8")
        prose, align, _, counts, _ = stage1_ostwald.parse_ostwald(path)

        text = prose[(1, 1)]
        assert "standards; but this is" in text
        assert "20" not in text
        at = {a["citation"]: a["offset"] for a in align["1:1"]["anchors"]}
        assert text[at["1094a20"]:].startswith("but this is")
        assert counts["line_marks"] == 1
