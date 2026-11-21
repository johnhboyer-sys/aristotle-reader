"""The committed line files' format (aristotle_pipeline.greek_lines).

The failing cases come first: what the reader and the writer must refuse, and
what the check for markup and beta code must catch. Then the claim the build
rests on: a line file gives stage 1 the same spine as the XML it was made from.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aristotle_pipeline import greek_lines as gl
from aristotle_pipeline import stage1_greek
from aristotle_pipeline.config import Manifest

TEI = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>{}</body></text></TEI>'
BEKKER = ("Bekker-page",)


def _xml(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "t.xml"
    path.write_text(TEI.format(body), encoding="utf-8")
    return path


# ---- what rows_from_xml refuses -------------------------------------------

def test_a_page_inside_a_page_is_refused(tmp_path):
    body = '<div type="Bekker-page" n="1a"><div type="Bekker-page" n="1b"><l n="1">α</l></div></div>'
    with pytest.raises(ValueError, match="inside another"):
        gl.rows_from_xml(_xml(tmp_path, body), BEKKER)


def test_two_pages_in_a_row_with_one_label_are_refused(tmp_path):
    # The file marks a new page only by a change of label: these two would
    # read back as one.
    body = '<div type="Bekker-page" n="1a"><l n="1">α</l></div><div type="Bekker-page" n="1a"><l n="2">β</l></div>'
    with pytest.raises(ValueError, match="two divisions in a row"):
        gl.rows_from_xml(_xml(tmp_path, body), BEKKER)


def test_a_page_with_no_label_and_a_line_with_an_empty_number_are_refused(tmp_path):
    for page in ('<div type="Bekker-page">', '<div type="Bekker-page" n=" ">'):
        with pytest.raises(ValueError, match="no n"):
            gl.rows_from_xml(_xml(tmp_path, page + '<l n="1">α</l></div>'), BEKKER)
    with pytest.raises(ValueError, match="empty n"):
        gl.rows_from_xml(_xml(tmp_path, '<div type="Bekker-page" n="1a"><l n="">α</l></div>'), BEKKER)


@pytest.mark.parametrize("body", [
    # a wrapper between book and chapter, and one between chapter and section:
    # the old reader skipped such lines without a word
    '<div type="Book" n="1"><div type="wrapper"><div type="chapter" n="1"><div type="section" n="1"><l n="1">α</l></div></div></div></div>',
    '<div type="Book" n="1"><div type="chapter" n="1"><div type="wrapper"><div type="section" n="1"><l n="1">α</l></div></div></div></div>',
    # the levels in another order
    '<div type="chapter" n="1"><div type="Book" n="1"><div type="section" n="1"><l n="1">α</l></div></div></div>',
])
def test_levels_that_do_not_nest_directly_and_in_order_are_refused(tmp_path, body):
    with pytest.raises(ValueError, match="not directly inside"):
        gl.rows_from_xml(_xml(tmp_path, body), gl._LINEATED)


# ---- what the writer and the reader refuse ---------------------------------

@pytest.mark.parametrize("row", [
    gl.Row(("1a",), "1", "α\tβ"),          # a tab would shift the fields
    gl.Row(("1a",), "1", "α\nβ"),          # a line break would make two lines
    gl.Row(("1\ta",), "1", "α"),
    gl.Row(("1a",), "1", "α  β"),          # not flat: would not read back the same
    gl.Row(("1a", "2"), "1", "α"),         # one label too many
])
def test_format_refuses_what_would_not_read_back(row):
    with pytest.raises(ValueError):
        gl.format_tsv([row], BEKKER, "T", "an edition")


@pytest.mark.parametrize("text, message", [
    ("# work: T\n# edition: e\n# columns: page\tn\ttext\n1\t1\tα\n", "expected # work"),   # another scheme's file
    ("# work: T\n1a\t1\tα\n", "expected # work"),                                  # no columns line
    # a fourth heading line is a place to keep anything
    ("# work: T\n# edition: e\n# note: x\n# columns: Bekker-page\tn\ttext\n1a\t1\tα\n", "expected # work"),
    ("# edition: e\n# work: T\n# columns: Bekker-page\tn\ttext\n1a\t1\tα\n", "expected # work"),
    # ... and so is a "# " line among the lines of text: it is not skipped
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n# mh=nin\n1a\t1\tα\n", "tab-separated fields"),
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\n", "tab-separated fields"),
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\tα\tβ\n", "tab-separated fields"),
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n\t1\tα\n", "empty label"),
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\tα\r\n", "tab-separated fields"),
    ("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n", "no lines of text"),     # examined nothing
    ("", "expected # work"),
])
def test_parse_refuses_a_file_of_the_wrong_shape(text, message):
    with pytest.raises(ValueError, match=message):
        gl.parse_tsv(text, BEKKER)


# ---- the check for markup, beta code, and bytes that are not text ----------

CLEAN = "# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\tὉμώνυμα λέγεται ὧν <καὶ> ὄνομα μόνον κοινόν\u0387 τί\u037e\n"   # the Greek dot and question mark, as the editions have them


NOT_GREEK = "characters that are not Greek"


@pytest.mark.parametrize("planted, what", [
    ('1a\t2\t<l n="2">λόγος</l>', "markup"),
    ("1a\t2\tλόγος</div>", "markup"),
    ('1a\t2\t<?xml version="1.0"?>', "markup"),
    ("1a\t2\tλόγος &amp; οὐσία", "markup"),
    ("1a\t2\tλόγος &#955; οὐσία", "markup"),
    ("1a\t2\t<καὶ/>", "markup"),                      # an element with a Greek name
    # beta code: the TLG's own way of writing Greek, in Latin letters
    ("1a\t2\tmh=nin a)/eide qea/", NOT_GREEK),
    ("1a\t2\t*(omw/numa le/getai", NOT_GREEK),
    ("1a\t2\t(mh=nin), (a)/eide), (qea/).", NOT_GREEK),   # punctuation round each word
    ("1a\t2\tλόγος (A) οὐσία", NOT_GREEK),           # one Latin letter is enough
    ("1a\t2\tтекст не греческий", NOT_GREEK),         # another script
    ("1a\t2\tthe account of the essence", NOT_GREEK),
    # Latin in another dress: none of these is a "letter" to str.isalpha
    ("1a\t2\tλόγος ⓗⓔⓛⓛⓞ", NOT_GREEK),               # circled
    ("1a\t2\tλόγος ｈｅｌｌｏ", NOT_GREEK),          # fullwidth
    ("1a\t2\tλόγος\u0363", NOT_GREEK),                # a combining Latin a
    ("1a\t2\tλόγος 𝛼", NOT_GREEK),                    # a mathematical alpha is not a Greek letter
    ("1a\t2\tλόγος \u1d5e", NOT_GREEK),               # MODIFIER LETTER SMALL GREEK GAMMA: Greek in name only
    ("1a\t2\tλόγος 12", NOT_GREEK),                   # digits belong in the number field
    ("1a\t2\tλόγος\rοὐσία", "a control character"),
    ("1a\t1\tm\th\tn\ti\tn\tα", "the wrong number of fields"),   # a word spelled out in spare fields
    ("1a\t2\tλόγος\x00οὐσία", "a control character"),
    ("1a\t2\tλόγος\u2028οὐσία", "a control character"),
    ("mhnin\t2\tλόγος", "a label or line number"),     # text hidden in a label
    ("1a\ta)/eide\tλόγος", "a label or line number"),
    ("# mh=nin a)/eide qea/", "a label or line number"),  # a "heading" below the heading
    ("λόγος", "a label or line number"),
])
def test_forbidden_catches_each_planted_case(planted, what):
    problems = gl.forbidden(CLEAN + planted + "\n")
    assert any(what in p for p in problems), problems


def test_forbidden_catches_one_bad_line_at_the_end_of_a_long_clean_file():
    # No share of the file is allowed to be something else: one line fails it.
    long = CLEAN + "".join(f"1a\t{n}\tλόγος τῆς οὐσίας ἕτερος\n" for n in range(2, 5000))
    assert gl.forbidden(long) == []
    assert any(NOT_GREEK in p for p in gl.forbidden(long + "1a\t5000\t(mh=nin).\n"))


@pytest.mark.parametrize("text", [
    # anything above the three heading lines, in place of them, or between them
    '# <l n="1">mh=nin a)/eide qea/</l>\n' + CLEAN,
    CLEAN.replace("# edition: e\n", "# edition: e\n# mh=nin a)/eide qea/\n"),
    CLEAN.replace("# work: T\n", "# work: mh=nin a)/eide\n"),
    CLEAN.replace("# edition: e\n", "# note: mh=nin a)/eide qea/\n"),
    "# work: T\n# columns: Bekker-page\tn\ttext\n",
    "",
])
def test_forbidden_refuses_a_file_that_does_not_open_with_the_three_heading_lines(text):
    assert any("not a line file" in p for p in gl.forbidden(text))


def test_forbidden_checks_the_heading_lines_too():
    assert any("markup" in p for p in gl.forbidden(CLEAN.replace("# edition: e", "# edition: <TEI>e</TEI>")))
    for columns in ("mh=nin a)/eide", "mhnin\tn\ttext", "Bekker-page\ttext"):
        assert any("not a line file" in p for p in gl.forbidden(CLEAN.replace("Bekker-page\tn\ttext", columns)))


def test_forbidden_passes_greek_with_editorial_brackets():
    assert gl.forbidden(CLEAN) == []
    for scheme_columns, row in (("page\tn\ttext", "1\t1\tγένος"), ("Section\tsubsection\tn\ttext", "1\t2\t1\tδεύ‖τερον"),
                                ("Book\tchapter\tsection\tn\ttext", "t\t1\t1\t\tΗΘΙΚΩΝ ΜΕΓΑΛΩΝ")):
        assert gl.forbidden(f"# work: T\n# edition: e\n# columns: {scheme_columns}\n{row}\n") == []


def test_forbidden_fails_a_file_whose_lines_hold_no_letters():
    assert any("no letters" in p for p in gl.forbidden("# work: T\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\t— 12.\n"))


def test_the_named_exception_is_one_line_of_one_work_and_no_other():
    (work, page, n), text = next(iter(gl.NOT_GREEK_OK.items()))
    head = "# work: {}\n# edition: e\n# columns: Bekker-page\tn\ttext\n1a\t1\tλόγος\n"
    assert gl.forbidden(head.format(work) + f"{page}\t{n}\t{text}\n") == []
    for other in (head.format("T") + f"{page}\t{n}\t{text}\n",            # another work
                  head.format(work) + f"{page}\t10\t{text}\n",            # another line
                  head.format(work) + f"{page}\t{n}\t{text} (p. 1.)\n"):  # other words
        assert any(NOT_GREEK in p for p in gl.forbidden(other))


# ---- a line file gives stage 1 what the XML gives it -----------------------

def _manifest(scheme: str | None = None) -> Manifest:
    data = {"work": {"id": "T", "tlg_author": "9999", "tlg_work": "999", "greek_edition": "e"},
            "books": [{"n": 1, "start": "1a1", "end": "9b99"}]}
    if scheme:
        data["citation"] = {"scheme": scheme}
    return Manifest(data, Path("T.yaml"))


CASES = {
    # a title line, a hyphen across lines, a lettered line, a compound line
    # with its "|", a "|" inside a plain line, a line with no number
    None: '<div type="Bekker-page" n="1a"><l n="1t">ΤΙΤΛΟΣ</l><l n="1">ἀρχὴ λό-</l><l n="2">γου καὶ</l>'
          '<l n="2a">μέσον | μὲν</l><l n="3,4">πρῶ|τον | τέλος</l><l>ἄνευ ἀριθμοῦ</l></div>'
          '<div type="Bekker-page" n="1b"><l n="1">ἕτερον</l></div>',
    "busse": '<div type="page" n="1"><l n="1">εἰσαγωγὴ</l><l n="2">Πορφυρίου</l></div>'
             '<div type="page" n="2"><l n="1">γένος</l></div>',
    "chapter-section": '<div type="Section" n="1"><div type="subsection" n="1"><l n="1">πρῶτον δη-</l>'
                       '<l n="2">μοσίᾳ</l></div><div type="subsection" n="2"><l n="1">δεύ‖τερον</l></div></div>'
                       '<div type="Section" n="2"><div type="subsection" n="1"><l n="1">τρίτον</l></div></div>',
}


R = gl.Row
ROWS = {
    None: [R(("1a",), "1t", "ΤΙΤΛΟΣ"), R(("1a",), "1", "ἀρχὴ λό-"), R(("1a",), "2", "γου καὶ"),
           R(("1a",), "2a", "μέσον | μὲν"), R(("1a",), "3,4", "πρῶ|τον | τέλος"), R(("1a",), None, "ἄνευ ἀριθμοῦ"),
           R(("1b",), "1", "ἕτερον")],
    "busse": [R(("1",), "1", "εἰσαγωγὴ"), R(("1",), "2", "Πορφυρίου"), R(("2",), "1", "γένος")],
    "chapter-section": [R(("1", "1"), "1", "πρῶτον δη-"), R(("1", "1"), "2", "μοσίᾳ"),
                        R(("1", "2"), "1", "δεύ‖τερον"), R(("2", "1"), "1", "τρίτον")],
}
SPINES = {
    None: [("1:1a", [(1, None, "ἀρχὴ λόγου"), (2, None, "καὶ"), (2, "a", "μέσον μὲν"), (3, None, "πρῶτον"), (4, None, "τέλος")]),
           ("1:1b", [(1, None, "ἕτερον")])],
    "busse": [("1:1a", [(1, None, "εἰσαγωγὴ"), (2, None, "Πορφυρίου")]), ("1:2a", [(1, None, "γένος")])],
    "chapter-section": [("1:1a", [(1, None, "πρῶτον δημοσίᾳ"), (2, None, "δεύτερον")]), ("1:2a", [(1, None, "τρίτον")])],
}


@pytest.mark.parametrize("scheme", list(CASES))
def test_the_line_file_reads_back_and_makes_the_same_spine(tmp_path, scheme):
    manifest = _manifest(scheme)
    levels = gl.levels_for(manifest)
    xml = _xml(tmp_path, CASES[scheme])
    rows = gl.rows_from_xml(xml, levels)
    assert len(rows) == CASES[scheme].count("<l")          # every line, none dropped
    assert rows == ROWS[scheme]                            # written out by hand, below
    text = gl.format_tsv(rows, levels, "T", "e")
    assert gl.parse_tsv(text, levels) == rows
    assert gl.forbidden(text) == []
    tsv = tmp_path / "T.tsv"
    tsv.write_text(text, encoding="utf-8")
    spine = stage1_greek.parse_spine(tsv, manifest)
    assert spine == stage1_greek.parse_spine(xml, manifest)
    # ... and both are the spine a reader of the fixture would write by hand
    assert [(s["id"], [(l["n"], l.get("sub"), l["text"]) for l in s["lines"]]) for s in spine["segments"]] == SPINES[scheme]


def test_a_line_outside_the_works_divisions_is_not_a_row(tmp_path):
    body = '<l n="1">ἔξω</l><div type="Bekker-page" n="1a"><l n="1">ἔσω</l></div>'
    assert gl.rows_from_xml(_xml(tmp_path, body), BEKKER) == [gl.Row(("1a",), "1", "ἔσω")]
