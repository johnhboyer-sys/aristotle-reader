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
        'n="Perseus:abo:tlg,0086,022:1181a:1"',
    ],
)
def test_unresolved_bibls_remain_inert_spans(attributes):
    assert render_bibl(attributes) == '<span class="lsj-bibl">citation</span>'
