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
one notation over. 18 tagged ranges: PA ×10, Cael ×4, DM ×4 (and the
manifests' expected_line_gaps had been masking the drops as edition
quirks), plus one collateral damaged line — DM 401a3 was never dropped
but survived shorn of its παρ- (εχόμενα).

The shapes that occur in the exports, each covered below:
  - PA prose: plain 12, "13-14" with no internal break marker, plain 15.
    The whole physical line carries the first Bekker number; the second
    number simply has no line of its own (a real, now correctly
    described, numbering gap).
  - DM 391b: "24-25" with an in-line `|` at the internal break, same as
    the comma-compound lines (APo 99b8-14) — split at the bar, one piece
    per number.
  - Cael 294a: the range's FIRST number overlaps a preceding plain line
    (plain 25, then "25-26"): the two flat entries merge into one line.
  - DM 401a: the range's LAST piece ends hyphenated and its number
    overlaps the FOLLOWING plain line ("2-3" ending `παρ-`, then plain
    3): the hyphen rejoin then the merge yield one line 3.
  - Cael 300b: a barless range sandwiched between the plain lines of
    BOTH its numbers (plain 30, "30-31", plain 31): the range merges
    into 30 and plain 31 stands alone.

The merge deliberately also covers comma compounds: at Phys 226b Ross
prints plain 26 ("ἐν ἐλα-") then n="26,27", which used to emit two line-
26 rows (declared in Phys.yaml as a 26→26 "gap"); they now merge into
the one physical Bekker line. Plain+plain duplicates (Phys 205b's two
n="1") stay two rows — the merge requires a compound-derived entry. And
reversed comma compounds (Phys 226b n="27,23", Ross's marginal
renumbering) must keep parsing in document order, so no reversed-range
guard: both locked in below.
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


# --- Cael 300b: barless range sandwiched between both its plain lines ---

SANDWICH_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="30">legei gar ws</l>
<l n="30-31">pollai men korsai anauxenes</l>
<l n="31">tois d apeira</l>
</div>
</body></text></TEI>"""


def test_sandwiched_range_merges_only_with_its_first_number(tmp_path):
    got = _lines(tmp_path, SANDWICH_TEI)
    nums = [n for n, _, _ in got]
    assert nums == [30, 31], f"duplicate or missing lines: {got}"
    by = {n: t for n, _, t in got}
    assert by[30] == "legei gar ws pollai men korsai anauxenes"
    assert by[31] == "tois d apeira"


# --- Phys 226b: the merge covers comma compounds too --------------------

COMMA_OVERLAP_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="26">en ela-</l>
<l n="26,27">xistois d esti to metaxu | esti ths</l>
</div>
</body></text></TEI>"""


def test_comma_compound_merges_with_its_plain_line(tmp_path):
    """Plain 26 (`en ela-`) + n="26,27" is one physical Bekker line of
    Ross's edition, hyphen-split typographically — one row 26, one row 27,
    not the two line-26 rows the old 26→26 gap declaration described."""
    got = _lines(tmp_path, COMMA_OVERLAP_TEI)
    nums = [n for n, _, _ in got]
    assert nums == [26, 27], f"duplicate or missing lines: {got}"
    by = {n: t for n, _, t in got}
    assert by[26] == "en elaxistois d esti to metaxu"
    assert by[27] == "esti ths"


PLAIN_DUP_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="1">first row</l>
<l n="1">second row</l>
</div>
</body></text></TEI>"""


def test_plain_plain_duplicate_stays_two_rows(tmp_path):
    """Phys 205b prints line 1 twice (Ross's doubled line, declared 1→1 in
    the manifest). Neither row is compound-derived, so they must NOT merge —
    a plain duplicate is the validators' business."""
    got = _lines(tmp_path, PLAIN_DUP_TEI)
    assert [(n, t) for n, _, t in got] == [(1, "first row"), (1, "second row")]


REVERSED_COMMA_TEI = """<TEI><text><body>
<div type="Bekker-page" n="689a">
<l n="26,27">xistois men gar | esti ths</l>
<l n="27,23">metabolhs to enantion, | metaxu de eis o</l>
</div>
</body></text></TEI>"""


def test_reversed_comma_compound_parses_in_document_order(tmp_path):
    """Phys 226b n="27,23" runs backwards (Ross's marginal renumbering) and
    must keep working — which is why there is no reversed-range guard."""
    got = _lines(tmp_path, REVERSED_COMMA_TEI)
    assert [(n, t) for n, _, t in got] == [
        (26, "xistois men gar"),
        (27, "esti ths metabolhs to enantion,"),
        (23, "metaxu de eis o"),
    ]


# --- guard: headings keep their behavior --------------------------------

def test_line_no_still_rejects_headings():
    assert stage1_greek._line_no("23t") is None
    assert stage1_greek._line_no("17n") is None
    assert stage1_greek._line_no("5a") == (5, "a")
