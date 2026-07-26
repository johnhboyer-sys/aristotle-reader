"""Bekker's lettered lines (5a, 5b …) are real text, not headings.

Found 2026-07-26 via the Bonitz index. Ross prints Physics 244b as
1-5, 5a, 5b, 5c, 5d, 6-15, and splits a word across the seam: `ἀλλοιού-`
ends line 5 and `μενον` opens 5a. Our deployed data held 244b as 1-15 with
no lettered lines anywhere in Physics VII, and line 5 read

    τὸ πρῶτον ἀλλοιούμενον· <ὑπόκειται γὰρ ἡμῖν τὸ τὰ ἀλλοιούεἰρημένων

`ἀλλοιούεἰρημένων` is not a word. _line_no() returns None for "5a", so the
line was filed as a heading and dropped from the text flow; the hyphen rejoin
then took its continuation from the next SURVIVING line instead. So the column
lost ~57 words and gained a fused non-word, silently.
"""

from aristotle_pipeline import stage1_greek


class Manifest:
    work_id = "TST"
    first_column = "244b"
    data = {
        "work": {"id": "TST", "english_translation": "x", "greek_edition": "y"},
        "books": [{"n": 7, "start": "244b1", "end": "244b9"}],
    }

    def book_for_line(self, column, line):
        return 7 if column == "244b" else None


TEI = """<TEI><text><body>
<div type="Bekker-page" n="244b">
<l n="4">hapasi gar</l>
<l n="5">to prwton alloiou-</l>
<l n="5a">menon upokeitai</l>
<l n="5b">gar hmin</l>
<l n="6">eirhmenwn tauta</l>
<l n="7">gar esti</l>
</div>
</body></text></TEI>"""


def _lines(tmp_path):
    p = tmp_path / "greek.xml"
    p.write_text(TEI, encoding="utf-8")
    spine = stage1_greek.parse_spine(p, Manifest())
    out = []
    for seg in spine["segments"]:
        for g in seg["lines"]:
            out.append((g["n"], g.get("sub"), g["text"]))
    return out


def test_lettered_lines_are_kept_as_text(tmp_path):
    got = _lines(tmp_path)
    subs = [(n, s) for n, s, _ in got if s]
    assert subs == [(5, "a"), (5, "b")], f"lettered lines lost: {got}"


def test_hyphen_rejoins_across_a_lettered_line(tmp_path):
    """The continuation of `alloiou-` is on 5a, not on 6."""
    got = {(n, s): t for n, s, t in _lines(tmp_path)}
    assert got[(5, None)] == "to prwton alloioumenon"
    # and line 6 keeps its own first word
    assert got[(6, None)].startswith("eirhmenwn")


def test_no_text_is_dropped(tmp_path):
    words = " ".join(t for _, _, t in _lines(tmp_path)).split()
    assert "upokeitai" in words and "gar" in words and "hmin" in words


def test_tokenizer_gives_each_lettered_line_its_own_tokens():
    """Keying tokens by line number alone hands 5 and 5a the same tokens."""
    from aristotle_pipeline import stage3_tokenize

    spine = {"work": "TST", "edition": "y", "segments": [{
        "id": "7:244b", "book": 7, "column": "244b",
        "lines": [
            {"n": 5, "text": "to prwton"},
            {"n": 5, "sub": "a", "text": "menon upokeitai"},
            {"n": 6, "text": "eirhmenwn"},
        ],
    }]}
    out, _, _ = stage3_tokenize.tokenize(spine)
    lines = out["segments"][0]["lines"]
    got = {(l["n"], l.get("sub")): [t["t"] for t in l["tokens"]] for l in lines}
    assert got[(5, None)] == ["to", "prwton"]
    assert got[(5, "a")] == ["menon", "upokeitai"]
    assert got[(6, None)] == ["eirhmenwn"]
    # three distinct lines survived, none overwritten
    assert len(got) == 3
