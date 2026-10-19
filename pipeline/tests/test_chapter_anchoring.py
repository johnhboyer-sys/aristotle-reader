"""How a chapter division is pinned onto the Greek spine (stage1_chapters).

Two ways the anchor could silently land on the wrong line, both of which the
module's own docstring says must not happen ("the match is monotonic", and a
`wordAnchor` means the position "genuinely matched the chapter opening"):

  1. The spine is flattened to a single space-joined word stream and the
     chapter's opening words are located with `str.find`. A substring search
     has no word boundary, so an opening that begins `alpha beta ...` matches
     INSIDE an earlier `xalpha beta ...` — the chapter is filed on that line,
     and marked wordAnchor, having never matched a word.

  2. When the opening text does not match at all we fall back to the chapter
     div's own Bekker line milestone. That lookup scanned the whole word
     stream from index 0, ignoring the monotonic `after` cursor, so a
     milestone pointing back up the column filed the chapter BEFORE the
     previous one. stage1_ross._chapter_segments then sorts the chapters by
     (column, line) and hands the two chapters each other's prose.

The neighbouring page-only fallback (a few lines below in the same branch)
already respects `after`; the line-milestone branch simply forgot to.
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline import stage1_chapters


def _chapters(tmp_path, spine, tei):
    path = tmp_path / "chapters.xml"
    path.write_text(tei, encoding="utf-8")
    return stage1_chapters.extract_chapters_grc(spine, str(path))


# --- 1. the opening words must match at a word boundary ---------------------

MIDWORD_SPINE = {
    "work": "TST",
    "segments": [
        {
            "id": "1:1a",
            "book": 1,
            "column": "1a",
            "lines": [
                # `xalpha` ends in the whole of chapter 2's opening run.
                {"n": 1, "text": "prooimion xalpha beta gamma delta epsilon zeta"},
                {"n": 2, "text": "alpha beta gamma delta epsilon zeta eta"},
            ],
        }
    ],
}

MIDWORD_TEI = """<TEI><text><body><div subtype="book" n="1">
<div subtype="chapter" n="1"><p>prooimion xalpha beta gamma delta epsilon zeta</p></div>
<div subtype="chapter" n="2"><p>alpha beta gamma delta epsilon zeta eta</p></div>
</div></body></text></TEI>"""


def test_opening_does_not_match_inside_a_longer_word(tmp_path):
    chapters = _chapters(tmp_path, MIDWORD_SPINE, MIDWORD_TEI)

    assert chapters[1]["chapter"] == "2"
    # Line 2 word 0 is where `alpha beta gamma delta` actually begins; the
    # substring hit was line 1 word 1, the tail of `xalpha`.
    assert (chapters[1]["line"], chapters[1]["wordIndex"]) == ("2", 0)


def test_a_midword_hit_is_never_reported_as_a_word_anchor(tmp_path):
    """Whatever position we end up with, `wordAnchor` must mean a real match:
    stage 6 reads it as licence to claim token precision."""
    chapters = _chapters(tmp_path, MIDWORD_SPINE, MIDWORD_TEI)
    col, line, wi = (chapters[1]["column"], chapters[1]["line"],
                     chapters[1]["wordIndex"])
    joined, owner, _wstart, _bs = stage1_chapters._spine_words(MIDWORD_SPINE)
    words = joined.split()
    at = owner.index((col, int(line), wi))
    assert not chapters[1].get("wordAnchor") or words[at] == "alpha"


def test_the_short_window_fallback_also_needs_a_word_boundary(tmp_path):
    """The (4, 3)-word step-back search used for TEIs with no Bekker milestones
    runs the same bare `find`, on shorter windows — where a mid-word hit is far
    likelier."""
    spine = {
        "work": "TST",
        "segments": [
            {
                "id": "1:1a",
                "book": 1,
                "column": "1a",
                "lines": [
                    {"n": 1, "text": "prooimion xdelta epsilon zeta"},
                    {"n": 2, "text": "delta epsilon zeta eta"},
                ],
            }
        ],
    }
    tei = """<TEI><text><body><div subtype="book" n="1">
<div subtype="chapter" n="1"><p>prooimion xdelta epsilon zeta</p></div>
<div subtype="chapter" n="2"><p>delta epsilon zeta</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, spine, tei)
    assert chapters[1]["chapter"] == "2"
    assert chapters[1]["line"] == "2"


# --- 2. the milestone fallback must not walk backwards ----------------------

BACKWARD_SPINE = {
    "work": "TST",
    "segments": [
        {
            "id": "1:1a",
            "book": 1,
            "column": "1a",
            "lines": [
                {"n": 1, "text": "alpha beta gamma delta"},
                {"n": 5, "text": "epsilon zeta eta theta"},
                {"n": 10, "text": "iota kappa lambda mu"},
            ],
        }
    ],
}

# ch3's opening shares no word with the spine, so it falls back to its own line
# milestone — which points at line 5, above ch2's line 10.
BACKWARD_TEI = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/><milestone unit="line" n="1"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta</p></div>
<div subtype="chapter" n="2"><milestone unit="line" n="10"/><p>iota kappa lambda mu</p></div>
<div subtype="chapter" n="3"><milestone unit="line" n="5"/><p>xxxx yyyy zzzz wwww vvvv</p></div>
</div></body></text></TEI>"""


def test_chapters_come_out_in_document_order(tmp_path):
    chapters = _chapters(tmp_path, BACKWARD_SPINE, BACKWARD_TEI)
    positions = [(c["column"], int(c["line"]), c["wordIndex"]) for c in chapters]
    assert positions == sorted(positions), f"chapters out of order: {chapters}"


def test_a_backward_milestone_reports_unresolved_rather_than_regressing(tmp_path):
    """Better a gap the caller can see than a chapter filed above the previous
    one, where _chapter_segments would hand the two each other's prose."""
    chapters = _chapters(tmp_path, BACKWARD_SPINE, BACKWARD_TEI)
    by_n = {c["chapter"]: c for c in chapters}
    assert by_n["2"]["line"] == "10"
    assert "3" not in by_n or int(by_n["3"]["line"]) >= 10


def test_a_forward_milestone_fallback_still_resolves(tmp_path):
    """The guard must only bite backwards: a milestone below the previous
    chapter is still the authoritative position it always was."""
    tei = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/><milestone unit="line" n="1"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta</p></div>
<div subtype="chapter" n="2"><milestone unit="line" n="5"/><p>qqq www eee rrr ttt</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, BACKWARD_SPINE, tei)
    assert len(chapters) == 2
    assert chapters[1]["line"] == "5"
    # An authoritative milestone is not a word match.
    assert "wordAnchor" not in chapters[1]


# --- 3. a page-only milestone must not outrank the chapter's own words -------

# De Mirabilibus 123: the TEI misspells the opening (`Ἤλδι` for `Ἤλιδι`), so no
# window from word 0 matches, and the div's only milestone is the page that
# begins inside it (842b). The page-only fallback filed the chapter at that
# page's first word — the tail of chapter 124's predecessor — and 123 and 124
# then shared one start. Bekker has 123 at 842a25, 124 at 842b3.
PAGE_ONLY_SPINE = {
    "work": "TST",
    "segments": [
        {"id": "1:1a", "book": 1, "column": "1a", "lines": [
            {"n": 1, "text": "alpha beta gamma delta epsilon"},
            {"n": 2, "text": "en elidi legousin einai ti oikema"},
        ]},
        {"id": "1:1b", "book": 1, "column": "1b", "lines": [
            {"n": 1, "text": "agoras ta krea pherontwn"},
            {"n": 2, "text": "en korwneia de tes boiwtias legetai"},
        ]},
    ],
}

PAGE_ONLY_TEI = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta epsilon</p></div>
<div subtype="chapter" n="2"><p>en eldi legousin einai ti oikema</p>
<milestone unit="page" n="1b"/><p>agoras ta krea pherontwn</p></div>
<div subtype="chapter" n="3"><p>eu korwneia de tes boiwtias legetai</p></div>
</div></body></text></TEI>"""


def test_a_misspelled_opening_is_found_past_its_typo_before_the_page_fallback(tmp_path):
    chapters = _chapters(tmp_path, PAGE_ONLY_SPINE, PAGE_ONLY_TEI)
    starts = [(c["chapter"], c["column"], c["line"], c["wordIndex"]) for c in chapters]
    assert starts == [("1", "1a", "1", 0), ("2", "1a", "2", 0), ("3", "1b", "2", 0)]
    # The skipped words differ from the spine's, so neither is word-exact.
    assert not any(c.get("wordAnchor") for c in chapters[1:])


def test_a_step_back_match_past_the_milestone_page_is_refused(tmp_path):
    """A three-word window can match far downstream; the page milestone bounds
    it, or the monotonic cursor would carry every later chapter past its text."""
    tei = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta epsilon</p></div>
<div subtype="chapter" n="2"><p>xx yy tes boiwtias legetai</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, PAGE_ONLY_SPINE, tei)
    # `tes boiwtias legetai` sits on 1b; the page is 1a, so the page fallback
    # stands: the first word on 1a after chapter 1's start.
    assert (chapters[1]["column"], chapters[1]["line"]) == ("1a", "1")


def test_a_step_back_never_lands_before_the_previous_chapter(tmp_path):
    """The cursor bounds where the window matches, not where the stepped-back
    start lands: skipping two words back from chapter 3's window would file it
    on chapter 2's line, above chapter 2's start."""
    spine = {"work": "TST", "segments": [{"id": "1:1a", "book": 1, "column": "1a", "lines": [
        {"n": 1, "text": "alpha beta gamma delta"},
        {"n": 2, "text": "aa bb"},
        {"n": 3, "text": "cc dd ee ff"},
    ]}]}
    tei = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta</p></div>
<div subtype="chapter" n="2"><p>xq cc dd ee ff</p></div>
<div subtype="chapter" n="3"><p>yq zq cc dd ee</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, spine, tei)
    positions = [(int(c["line"]), c["wordIndex"]) for c in chapters]
    assert positions == sorted(positions) and len(set(positions)) == len(positions), chapters


def test_the_page_bound_stops_at_the_book_break(tmp_path):
    """A Bekker column can hold the end of one book and the start of the next;
    a book-1 chapter must not be found in book 2's half of it."""
    spine = {"work": "TST", "segments": [
        {"id": "1:1a", "book": 1, "column": "1a", "lines": [
            {"n": 1, "text": "alpha beta gamma delta"},
            {"n": 2, "text": "epsilon zeta eta theta"},
        ]},
        {"id": "2:1a", "book": 2, "column": "1a", "lines": [
            {"n": 3, "text": "kappa lambda mu nu"},
        ]},
    ]}
    tei = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta</p></div>
<div subtype="chapter" n="2"><p>xq lambda mu nu</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, spine, tei)
    # Without the bound the window matched book 2's line 3 and stepped back
    # into it under book 1's number.
    assert chapters[1]["book"] == 1 and chapters[1]["line"] in ("1", "2"), chapters


def test_a_rejected_step_back_tries_the_window_again_further_on(tmp_path):
    """Chapter 3's `cc dd ee` first matches inside chapter 2's opening, where
    stepping back lands above chapter 2; the same window's next occurrence is
    chapter 3's own text, and the chapter must not vanish for want of it."""
    spine = {"work": "TST", "segments": [{"id": "1:1a", "book": 1, "column": "1a", "lines": [
        {"n": 1, "text": "alpha beta gamma delta"},
        {"n": 2, "text": "aa bb"},
        {"n": 3, "text": "cc dd ee ff"},
        {"n": 4, "text": "yq zq cc dd ee"},
    ]}]}
    tei = """<TEI><text><body><div subtype="book" n="1">
<milestone unit="page" n="1a"/>
<div subtype="chapter" n="1"><p>alpha beta gamma delta</p></div>
<div subtype="chapter" n="2"><p>xq cc dd ee ff</p></div>
<div subtype="chapter" n="3"><p>yq zz cc dd ee</p></div>
</div></body></text></TEI>"""
    chapters = _chapters(tmp_path, spine, tei)
    assert [(c["chapter"], c["line"], c["wordIndex"]) for c in chapters] == [
        ("1", "1", 0), ("2", "2", 1), ("3", "4", 0)]
