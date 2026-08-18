"""Hyphen-range line numbers (n="13-14") are real text, not headings.

Found 2026-08-18 by the text-quality gate. The Louis Budé PA prints a
physical line that straddles two Bekker numbers, and the export tags it
with both: 689a runs 12, 13-14, 15, splitting a word across the seam —
`ὑπο-` ends 12 and `κείσθω` opens 13-14. _line_no() returned None for
"13-14", so the line was filed as a heading and dropped from the text
flow; the hyphen rejoin then took its continuation from the next
SURVIVING line, fusing `ὑπο-` with 15's `ὑγρὰ` into ὑποὑγρὰ (the
internal rough breathing proves the fusion — a real compound aspirates
to ὑφ-). The same failure mode as the lettered-lines drop of 2026-07-26,
one notation over. 19 such lines: PA ×10, Cael ×4, DM ×4 (and the
manifests' expected_line_gaps had been masking the drops as edition
quirks).

Three shapes occur in the exports:
  - PA prose: plain 12, "13-14" with no internal break marker, plain 15.
    The whole physical line carries the first Bekker number; the second
    number simply has no line of its own (a real, now correctly
    described, numbering gap).
  - DM: "24-25" with an in-line `|` at the internal break, same as the
    comma-compound lines (APo 99b8-14) — split at the bar, one piece per
    number.
  - Cael 294a / DM 401a: the range OVERLAPS a flanking plain line
    (plain 25, then "25-26"; or "2-3" ending `παρ-`, then plain 3). The
    two flat entries for one Bekker number merge into one line.
"""

from aristotle_pipeline import stage1_greek


class Manifest:
    work_id = "TST"
    first_column = "689a"
    data = {
        "work": {"id": "TST", "english_translation": "x", "greek_edition": "y"},
        "books": [{"n": 4, "start": "689a1", "end": "689a35"}],
    }

    def book_for_line(self, column, line):
        return 4 if column == "689a" else None


def _lines(tmp_path, tei):
    p = tmp_path / "greek.xml"
    p.write_text(tei, encoding="utf-8")
    spine = stage1_greek.parse_spine(p, Manifest())
    return [(g["n"], g.get("sub"), g["text"])
            for seg in spine["segments"] for g in seg["lines"]]


# --- PA 689a: prose range, no internal break marker ---------------------

PA_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="12">nun de upo-</l>
<l n="13-14">keisthw monon oti perittwma</l>
<l n="15">ugra de thn fusin</l>
</div>
</body></text></TEI>"""


def test_range_line_is_kept_as_text(tmp_path):
    got = {(n, s): t for n, s, t in _lines(tmp_path, PA_TEI)}
    assert (13, None) in got, f"range line lost: {got}"
    assert "monon" in got[(13, None)]


def test_hyphen_rejoins_across_a_range_line(tmp_path):
    """The continuation of `upo-` is on 13-14, not on 15."""
    got = {(n, s): t for n, s, t in _lines(tmp_path, PA_TEI)}
    assert got[(12, None)] == "nun de upokeisthw"
    assert got[(15, None)] == "ugra de thn fusin"  # not fused with upo-


def test_no_text_is_dropped(tmp_path):
    words = " ".join(t for _, _, t in _lines(tmp_path, PA_TEI)).split()
    for w in ("upokeisthw", "monon", "oti", "perittwma"):
        assert w in words, f"{w} missing: {words}"


# --- DM 391b: range with in-line bars, mid-word and word-boundary -------

BAR_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="23">peri a o pas ogkos</l>
<l n="24-25">kuklw strefetai kaloun|tai de outoi poloi</l>
<l n="25-26">nohsaimen euqeian, | hn tines axona</l>
</div>
</body></text></TEI>"""


def test_bars_split_a_range_onto_its_numbers(tmp_path):
    got = {(n, s): t for n, s, t in _lines(tmp_path, BAR_TEI)}
    # 24-25's only bar is mid-word, so (per the compound convention) the
    # rejoined word and the line's remainder stay whole on the earlier number
    assert got[(24, None)] == "kuklw strefetai kalountai de outoi poloi"
    # 25-26's word-boundary bar splits it onto its two numbers
    assert got[(25, None)] == "nohsaimen euqeian,"
    assert got[(26, None)] == "hn tines axona"


# --- Cael 294a: range overlapping a flanking plain line -----------------

OVERLAP_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="25">eipwn ws</l>
<l n="25-26">ei per apeirona ghs te baqh</l>
<l n="26-27">ws dia pollwn dh glwsshs</l>
<l n="27-28">ekkexutai stomatwn</l>
<l n="28">oi d ef udatos keisqai</l>
</div>
</body></text></TEI>"""


def test_overlapping_range_merges_with_plain_line(tmp_path):
    got = _lines(tmp_path, OVERLAP_TEI)
    nums = [n for n, _, _ in got]
    assert nums == [25, 26, 27, 28], f"duplicate or missing lines: {got}"
    by = {n: t for n, _, t in got}
    assert by[25] == "eipwn ws ei per apeirona ghs te baqh"
    assert by[28] == "oi d ef udatos keisqai"


# --- DM 401a: range piece ends hyphenated, plain line completes it ------

HYPHEN_OVERLAP_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="1">peloi kai foinikes</l>
<l n="1-2">sukeai te glukerai kai | elaiai,</l>
<l n="2-3">ws fhsin o poihths, allas de | par-</l>
<l n="3">exomena xreias, platanoi</l>
</div>
</body></text></TEI>"""


def test_hyphenated_range_piece_merges_with_its_plain_line(tmp_path):
    got = _lines(tmp_path, HYPHEN_OVERLAP_TEI)
    nums = [n for n, _, _ in got]
    assert nums == [1, 2, 3], f"duplicate or missing lines: {got}"
    by = {n: t for n, _, t in got}
    assert by[1] == "peloi kai foinikes sukeai te glukerai kai"
    assert by[2] == "elaiai, ws fhsin o poihths, allas de"
    assert by[3] == "parexomena xreias, platanoi"


# --- guard: comma compounds and headings keep their behavior ------------

def test_line_no_still_rejects_headings():
    assert stage1_greek._line_no("23t") is None
    assert stage1_greek._line_no("17n") is None
    assert stage1_greek._line_no("5a") == (5, "a")
