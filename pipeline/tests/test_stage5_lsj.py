import sys
from pathlib import Path

import pytest
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.lsj_citation_map import CITATION_WORKS
from aristotle_pipeline.stage5_lsj import entry_html


def render_bibl(attributes: str, body: str = "citation") -> str:
    div2 = etree.fromstring(f"<div2><bibl {attributes}>{body}</bibl></div2>")
    return entry_html(div2)


def test_valid_aristotle_bibl_links_to_the_target_book():
    assert render_bibl(
        'n="Perseus:abo:tlg,0086,010:1094a:5"', "1094a5"
    ) == '<a class="lsj-bibl" href="/EN/book/1?loc=1094a:5">1094a5</a>'


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        ("Perseus:abo:tlg,0086,001:70b:1", "/APr/book/2?loc=70b:1"),
        ("Perseus:abo:tlg,0086,001:71a:1", "/APo/book/1?loc=71a:1"),
    ],
)
def test_analytics_boundary_uses_the_bekker_column(reference, expected):
    assert render_bibl(f'n="{reference}"') == (
        f'<a class="lsj-bibl" href="{expected}">citation</a>'
    )


def test_se_uses_the_lsj_work_number_not_the_manifest_number():
    assert CITATION_WORKS["039"] == "SE"
    assert "040" not in CITATION_WORKS
    assert render_bibl('n="Perseus:abo:tlg,0086,039:164a:20"') == (
        '<a class="lsj-bibl" href="/SE/book/1?loc=164a:20">citation</a>'
    )


def test_juv_uses_the_lsj_work_number_not_the_manifest_number():
    assert CITATION_WORKS["018"] == "Juv"
    assert "918" not in CITATION_WORKS


def test_problemata_citations_link_to_the_book():
    # LSJ cites the Problemata ~1,400 times as 0086,036 (859a-967b).
    assert CITATION_WORKS["036"] == "Prob"
    assert render_bibl('n="Perseus:abo:tlg,0086,036:955a:20"') == (
        '<a class="lsj-bibl" href="/Prob/book/30?loc=955a:20">citation</a>'
    )
    assert render_bibl('n="Perseus:abo:tlg,0086,036:859a:1"') == (
        '<a class="lsj-bibl" href="/Prob/book/1?loc=859a:1">citation</a>'
    )


def test_respiration_links_to_juv_and_one_stray_problemata_cite():
    # LSJ numbers De Respiratione 037; our Juv covers it (467b10-480b30).
    # One LSJ entry (kataphnixis) cites "Pr. 966b36" under 037 as well.
    assert render_bibl('n="Perseus:abo:tlg,0086,037:471a:5"') == (
        '<a class="lsj-bibl" href="/Juv/book/1?loc=471a:5">citation</a>'
    )
    assert render_bibl('n="Perseus:abo:tlg,0086,037:966b:36"') == (
        '<a class="lsj-bibl" href="/Prob/book/38?loc=966b:36">citation</a>'
    )
    assert render_bibl('n="Perseus:abo:tlg,0086,037:900a:1"') == '<span class="lsj-bibl">citation</span>'


def test_three_digit_columns_sort_numerically_not_lexically():
    # "100a" < "24a" as strings; a string-compare range check would kick
    # column 100a out of APo (71a-100b) and the link would vanish.
    assert render_bibl('n="Perseus:abo:tlg,0086,001:100a:3"') == (
        '<a class="lsj-bibl" href="/APo/book/2?loc=100a:3">citation</a>'
    )


def test_nested_author_title_markup_survives_inside_the_link():
    div2 = etree.fromstring(
        '<div2><bibl n="Perseus:abo:tlg,0086,010:1172a:9">'
        "<author>Arist.</author> <title>EN</title> 1172a9</bibl></div2>"
    )
    html = entry_html(div2)
    # 1172a:9 is book IX; book X starts mid-column at 1172a19 — the split
    # comes from book_for_line, which this locks in.
    assert html.startswith('<a class="lsj-bibl" href="/EN/book/9?loc=1172a:9">')
    assert '<span class="lsj-author">Arist.</span>' in html
    assert '<i class="lsj-title">EN</i>' in html
    assert html.endswith("1172a9</a>")


@pytest.mark.parametrize(
    "attributes",
    [
        'n="Perseus:abo:tlg,0059,030:1094a:5"',
        "",
        'n="not-a-citation"',
        'n="Perseus:abo:tlg,0086,010:1094a"',
        'n="Perseus:abo:tlg,0086,010:1094a:line"',
        # 003 is the Athenian Constitution, which has no Bekker pages and
        # no place in the reader
        'n="Perseus:abo:tlg,0086,003:1181a:1"',
    ],
)
def test_unresolved_bibls_remain_inert_spans(attributes):
    assert render_bibl(attributes) == '<span class="lsj-bibl">citation</span>'


def test_de_spiritu_links_inside_its_columns_only():
    # LSJ's "Arist. Spir." is Perseus work 043: 40 citations, all titled
    # Spir. (checked 2026-11-06). s.v. ἀνατέμνω it cites 478a21, a column
    # De Spiritu (481a-486b) does not have; that one stays plain text.
    assert render_bibl('n="Perseus:abo:tlg,0086,043:483b:16"') == (
        '<a class="lsj-bibl" href="/Spir/book/1?loc=483b:16">citation</a>'
    )
    assert render_bibl('n="Perseus:abo:tlg,0086,043:478a:21"') == (
        '<span class="lsj-bibl">citation</span>'
    )


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        ("Perseus:abo:tlg,0086,022:1192b:30", "/MM/book/1?loc=1192b:30"),
        ("Perseus:abo:tlg,0086,022:1198b:20", "/MM/book/1?loc=1198b:20"),
        ("Perseus:abo:tlg,0086,022:1198b:24", "/MM/book/2?loc=1198b:24"),
        ("Perseus:abo:tlg,0086,022:1213b:3", "/MM/book/2?loc=1213b:3"),
    ],
)
def test_magna_moralia_links_by_book(reference, expected):
    assert render_bibl(f'n="{reference}"') == (
        f'<a class="lsj-bibl" href="{expected}">citation</a>'
    )


@pytest.mark.parametrize(
    "reference",
    [
        # LSJ cites EE columns under the MM's number twice; they are not MM
        "Perseus:abo:tlg,0086,022:1216b:17",
        "Perseus:abo:tlg,0086,022:1235a:20",
        "Perseus:abo:tlg,0086,022:1214a:1",
        "Perseus:abo:tlg,0086,022:1180b:1",
    ],
)
def test_magna_moralia_numbers_outside_its_columns_stay_unlinked(reference):
    assert render_bibl(f'n="{reference}"') == '<span class="lsj-bibl">citation</span>'


def test_rhet_al_is_cited_under_anaximenes():
    # LSJ shows "Arist. Rh.Al." but its Perseus number is Anaximenes's, 0547.001.
    assert render_bibl('n="Perseus:abo:tlg,0547,001:1438b:5"') == (
        '<a class="lsj-bibl" href="/RhetAl/book/1?loc=1438b:5">citation</a>'
    )


@pytest.mark.parametrize(
    "attributes",
    [
        'n="Perseus:abo:tlg,0547,002:1438b:5"',  # only 0547.001 is RhetAl
        'n="Perseus:abo:tlg,0548,001:1438b:5"',
        'n="Perseus:abo:tlg,0547,001:pr:9:1"',   # LSJ's non-Bekker forms
        'n="Perseus:abo:tlg,0547,001:p.376S"',
        'n="Perseus:abo:tlg,0547,001:1448a:1"',  # past the work's last column
    ],
)
def test_other_authors_and_forms_stay_inert(attributes):
    assert render_bibl(attributes) == '<span class="lsj-bibl">citation</span>'
