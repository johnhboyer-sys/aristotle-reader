"""citation.scheme: chapter-section — a work cited by chapter.section (the
Athenian Constitution), carried on synthetic columns: chapter N is column "Na",
section S is line S, and each section is one Greek spine line.

Pinned here, each with its failing case:
- the Greek loader reads the TLG export's Section/subsection divs and joins a
  subsection's printed lines into one spine line, rejoining hyphenated words;
- stage 2 keeps the strict line-gap check (a missing section is an error, not
  the Isagoge's benign heading gap) and checks the section inventory: spine
  against the pinned Greek inventory, Greek against Kenyon's printed English
  inventory with only the declared merges between them, each section's opening
  words against a recorded witness, and every section's English anchor real;
- preflight keeps its ordering checks for the scheme;
- LSJ links a chapter.section citation only through the same guards as a
  Bekker one (map entry, manifest, inventory).
"""

import sys
from pathlib import Path

import pytest
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline import lsj_citation_map, preflight, stage1_greek, stage5_lsj
from aristotle_pipeline.stage2_validate import check_sections, validate


# --------------------------------------------------------------- Greek loader

TEI = """<TEI><text><body>
<div type="Section" n="1">
<div type="subsection" n="1">
<l n="1">alpha beta</l>
<l n="2">gamma del-</l>
<l n="3">ta epsilon</l>
</div>
</div>
<div type="Section" n="2">
<div type="subsection" n="1">
<l n="1">zeta eta theta io-</l>
</div>
<div type="subsection" n="2">
<l n="1">ta kappa</l>
<l n="2">lambda mu</l>
</div>
</div>
</body></text></TEI>"""


class _SpineManifest:
    work_id = "TST"
    first_column = "1a"
    last_column = "2a"
    data = {
        "work": {"id": "TST", "greek_edition": "y"},
        "citation": {"scheme": "chapter-section"},
        "books": [{"n": 1, "start": "1a1", "end": "2a2"}],
    }

    def book_for_line(self, column, line):
        return 1


def _spine(tmp_path, tei=TEI):
    p = tmp_path / "greek.xml"
    p.write_text(tei, encoding="utf-8")
    return stage1_greek.parse_spine(p, _SpineManifest())


def test_each_subsection_is_one_spine_line_on_a_synthetic_column(tmp_path):
    spine = _spine(tmp_path)
    got = [(s["column"], [(l["n"], l["text"]) for l in s["lines"]]) for s in spine["segments"]]
    assert got == [
        ("1a", [(1, "alpha beta gamma delta epsilon")]),
        ("2a", [(1, "zeta eta theta iota"), (2, "kappa lambda mu")]),
    ]


def test_a_word_hyphenated_across_a_section_break_stays_in_the_earlier_section(tmp_path):
    spine = _spine(tmp_path)
    s2 = spine["segments"][1]["lines"]
    assert s2[0]["text"].endswith("iota")
    assert s2[0].get("joined") is True
    assert s2[1]["text"] == "kappa lambda mu"
    assert "joined" not in spine["segments"][0]["lines"][0], "a join inside a section is not a cross-line join"


def test_a_bekker_export_is_not_read_as_sections(tmp_path):
    """The branch is keyed on the manifest scheme, not on what the file holds:
    a Bekker-page export under a chapter-section manifest yields no segments
    (and so fails stage 2's column check) rather than being read some other way."""
    tei = '<TEI><text><body><div type="Bekker-page" n="1a"><l n="1">x</l></div></body></text></TEI>'
    assert _spine(tmp_path, tei)["segments"] == []


# ------------------------------------------------------------------- stage 2

class _CSManifest:
    """Two chapters: ch. 1 has 2 sections; ch. 2 has 3 in Kenyon's English, of
    which the Greek prints 2.3 inside 2.2 (one declared merge), so 2 in Greek."""
    first_column = "1a"
    last_column = "2a"
    books = [{"n": 1, "start": "1a1", "end": "2a2"}]

    def __init__(self, **over):
        cit = {
            "scheme": "chapter-section",
            "english_sections": [2, 3],
            "greek_sections": [2, 2],
            "merges": [{"chapter": 2, "english": 3, "into": 2}],
            "starts": {"1a1": "αλφα", "1a2": "γαμμα", "2a1": "εψιλον", "2a2": "ζητα"},
        }
        cit.update(over)
        self.data = {
            "work": {"id": "TST"},
            "citation": cit,
            "bekker_range": {"first_column": "1a", "last_column": "2a"},
            "books": self.books,
            "proper_names": [],
        }


GREEK = {"1a": ["αλφα βητα", "γαμμα δελτα"], "2a": ["εψιλον", "ζητα ητα θητα"]}


def _segs(greek=GREEK):
    return [{"id": f"1:{c}", "book": 1, "column": c,
             "lines": [{"n": i + 1, "text": t} for i, t in enumerate(ls)]}
            for c, ls in greek.items()]


def _eng(ticks=None):
    ticks = ticks or {"1a": [1, 2], "2a": [1, 2]}
    return {"chunks": [{"id": f"1:{c}", "book": 1, "column": c,
                        "text": "english prose for the chapter, long enough",
                        "markers": [],
                        "bekker": [{"n": n, "offset": 5 * i, "real": True}
                                   for i, n in enumerate(ns)]}
                       for c, ns in ticks.items()],
            "chapters": []}


def _check(manifest=None, greek=GREEK, ticks=None):
    return check_sections(manifest or _CSManifest(), {"segments": _segs(greek)}, _eng(ticks))


def test_a_matching_inventory_passes_and_says_what_it_examined():
    r = _check()
    assert r["ok"] is True, r
    assert (r["chapters"], r["english_sections"], r["greek_sections"],
            r["anchors"], r["merges"]) == (2, 5, 4, 4, 1)


def test_a_shifted_boundary_fails_the_witness():
    greek = {"1a": ["αλφα βητα γαμμα", "δελτα"], "2a": GREEK["2a"]}
    r = _check(greek=greek)
    assert r["ok"] is False
    assert r["witness_mismatch"] == ["1a2"]


def test_a_missing_first_section_fails():
    greek = {"1a": ["γαμμα δελτα"], "2a": GREEK["2a"]}
    r = _check(greek=greek)
    assert r["ok"] is False
    assert r["spine_vs_greek"] == [{"chapter": 1, "spine": 1, "greek": 2}]


def test_a_missing_last_section_fails():
    greek = {"1a": GREEK["1a"], "2a": ["εψιλον"]}
    r = _check(greek=greek)
    assert r["ok"] is False
    assert r["spine_vs_greek"] == [{"chapter": 2, "spine": 1, "greek": 2}]


def test_an_undeclared_merge_fails():
    r = _check(_CSManifest(merges=[]))
    assert r["ok"] is False
    assert r["greek_vs_english"] == [{"chapter": 2, "english": 3, "greek": 2, "declared": 0}]


def test_an_unresolved_anchor_phrase_fails():
    """A bad `at` phrase leaves that section with no real tick (an estimate at
    best); the check must see the hole, not the estimate."""
    r = _check(ticks={"1a": [1, 2], "2a": [1]})
    assert r["ok"] is False
    assert r["anchor_problems"] == [{"column": "2a", "real": [1], "expected": [1, 2]}]


def test_anchors_out_of_order_fail():
    e = _eng()
    e["chunks"][0]["bekker"] = [{"n": 2, "offset": 0, "real": True},
                                {"n": 1, "offset": 9, "real": True}]
    r = check_sections(_CSManifest(), {"segments": _segs()}, e)
    assert r["ok"] is False
    assert r["anchor_problems"][0]["column"] == "1a"


def test_inventories_of_the_wrong_length_fail_rather_than_pass_short():
    r = _check(_CSManifest(english_sections=[2], greek_sections=[2]))
    assert r["ok"] is False
    assert r["inventory_length"] == {"bekker_range": 2, "english": 1, "greek": 1}


def test_validate_runs_the_section_check_and_keeps_gaps_strict():
    """Unlike busse, a gap in the section numbering is an error: sections run
    1..n with no headings dropped."""
    m = _CSManifest()
    segs = _segs()
    segs[1]["lines"][1]["n"] = 3          # 2a: sections 1, 3
    english = _eng()
    alignment = {"pairs": [{"segment": s["id"], "english": s["id"]} for s in segs],
                 "english_only": []}
    report = validate(m, {"work": "TST", "segments": segs}, english, alignment)
    assert report["checks"]["line_gaps"]["ok"] is False
    assert report["checks"]["sections"]["ok"] is False
    assert report["checks"]["columns"]["ok"] is True


def test_a_bekker_work_gets_no_section_check():
    class M:
        first_column = "1094a"
        last_column = "1094a"
        books = [{"n": 1, "start": "1094a1", "end": "1094a2"}]
        data = {"work": {"id": "X"}, "bekker_range": {"first_column": "1094a", "last_column": "1094a"},
                "books": books, "proper_names": []}
    segs = [{"id": "1:1094a", "book": 1, "column": "1094a",
             "lines": [{"n": 1, "text": "α"}, {"n": 2, "text": "β"}]}]
    english = {"chunks": [{"id": "1:1094a", "book": 1, "column": "1094a", "text": "x y z",
                           "markers": [], "bekker": []}], "chapters": []}
    alignment = {"pairs": [{"segment": "1:1094a", "english": "1:1094a"}], "english_only": []}
    report = validate(M(), {"work": "X", "segments": segs}, english, alignment)
    assert "sections" not in report["checks"]


# ------------------------------------------------------------------ preflight

@pytest.mark.parametrize(("scheme", "ordered"), [
    (None, True), ("", True), ("bekker", True), ("chapter-section", True), ("busse", False),
])
def test_preflight_keeps_order_checks_for_chapter_section(scheme, ordered):
    assert preflight.ordered_citation(scheme) is ordered


# ----------------------------------------------------------------------- LSJ

def _render(n):
    div2 = etree.fromstring(f'<div2><bibl n="{n}">x</bibl></div2>')
    return stage5_lsj.entry_html(div2)


class _LsjManifest:
    def __init__(self, scheme="chapter-section"):
        self.data = {"citation": {"scheme": scheme, "greek_sections": [1, 2, 3]}}

    def book_for_line(self, column, line):
        return 1


@pytest.fixture
def athpol(monkeypatch):
    monkeypatch.setitem(lsj_citation_map.CITATION_WORKS, "003", "AthPol")
    monkeypatch.setitem(stage5_lsj._MANIFEST_CACHE, "AthPol", _LsjManifest())


def test_a_section_citation_links_to_its_synthetic_line(athpol):
    assert _render("Perseus:abo:tlg,0086,003:3:2") == (
        '<a class="lsj-bibl" href="/AthPol/book/1?loc=3a:2">x</a>')


def test_a_chapter_only_citation_links_to_section_one(athpol):
    assert _render("Perseus:abo:tlg,0086,003:2") == (
        '<a class="lsj-bibl" href="/AthPol/book/1?loc=2a:1">x</a>')


@pytest.mark.parametrize("n", [
    "Perseus:abo:tlg,0086,003:2:3",    # 2.3 is not in the inventory (ch. 2 has 2)
    "Perseus:abo:tlg,0086,003:4:1",    # no chapter 4
    "Perseus:abo:tlg,0086,003:0:1",
])
def test_a_section_outside_the_inventory_stays_a_span(athpol, n):
    assert _render(n).startswith('<span class="lsj-bibl"')


def test_without_the_map_entry_the_branch_is_dead(monkeypatch):
    monkeypatch.delitem(lsj_citation_map.CITATION_WORKS, "003", raising=False)
    assert _render("Perseus:abo:tlg,0086,003:3:2").startswith('<span class="lsj-bibl"')


def test_a_bekker_work_never_links_a_section_shaped_citation(monkeypatch):
    """EN is cited by Bekker; a chapter-shaped citation of it must stay inert."""
    monkeypatch.setitem(stage5_lsj._MANIFEST_CACHE, "EN", _LsjManifest(scheme="bekker"))
    assert _render("Perseus:abo:tlg,0086,010:3:2").startswith('<span class="lsj-bibl"')
