import sys
from pathlib import Path

import pytest
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage5_lsj import derive_short_def
from aristotle_pipeline.stage7_emit import merge_short_def


@pytest.mark.parametrize(
    ("key", "body", "expected"),
    [
        (
            "politiko/s",
            "<i>of, for</i>, or <i>relating to citizens</i>, "
            "<foreign>σύλλογος</foreign>",
            "of, for, or relating to citizens",
        ),
        (
            "e)pimele/omai",
            "<i>take</i> <i>care of, have charge</i> or "
            "<i>management of</i>, rare in Poets, as <bibl>Ph. 556</bibl>",
            "take care of, have charge or management of",
        ),
        (
            "a(/ptw",
            "<i>fasten</i> or <i>bind to,</i> used by <author>Hom.</author>",
            "fasten or bind to",
        ),
        (
            "a)/gw",
            "<i>lead, carry, fetch, bring</i>, of living creatures, "
            "<foreign>φέρω</foreign>",
            "lead, carry, fetch, bring",
        ),
    ],
)
def test_derive_short_def_from_leading_italic_run(key, body, expected):
    div2 = etree.fromstring(
        f'<div2 key="{key}"><head>head</head><sense>{body}</sense></div2>'
    )

    assert derive_short_def(div2) == expected


def test_derive_short_def_falls_back_to_entry_body_without_a_sense():
    div2 = etree.fromstring(
        "<div2><head>head</head><i>first</i> and <i>second</i>, used by "
        "<author>Author</author></div2>"
    )

    assert derive_short_def(div2) == "first and second"


@pytest.mark.parametrize(
    "body",
    [
        "<i>of</i> or <i>belonging to a</i> <foreign>δαίμων</foreign>",
        "<i>of</i> or <i>for an</i> <foreign>ἰατρός</foreign>",
        "<i>in, of</i>, or <i>belonging to the</i> <foreign>ἀγορά</foreign>",
    ],
)
def test_derive_short_def_rejects_a_stranded_article(body):
    """The noun the article governs is untranslated Greek outside the run."""
    div2 = etree.fromstring(f"<div2><head>head</head><sense>{body}</sense></div2>")

    assert derive_short_def(div2) == ""


def test_derive_short_def_rejects_an_over_long_clause():
    long_def = "a " + "very long clause, " * 6
    div2 = etree.fromstring(
        f"<div2><head>head</head><sense><i>{long_def}</i> etc.</sense></div2>"
    )

    assert derive_short_def(div2) == ""


def test_merge_short_def_extends_prefix_gloss():
    assert merge_short_def(
        "of, for",
        "politiko/s",
        ["poli_ti^ko/s"],
        {"poli_ti^ko/s": "of, for, or relating to citizens"},
    ) == "of, for, or relating to citizens"


def test_merge_short_def_normalizes_case_whitespace_and_trailing_punctuation():
    assert merge_short_def(
        "  Of,   For... ",
        "politiko/s",
        ["poli_ti^ko/s"],
        {"poli_ti^ko/s": "of, for, or relating to citizens"},
    ) == "of, for, or relating to citizens"


def test_merge_short_def_leaves_complete_gloss_untouched():
    gloss = "lead, carry, fetch, bring"

    assert merge_short_def(
        gloss, "a)/gw", ["a)/gw"], {"a)/gw": "lead, carry, fetch, bring"}
    ) == gloss


def test_merge_short_def_refuses_non_prefix_replacement():
    gloss = "citizen"

    assert merge_short_def(
        gloss,
        "politiko/s",
        ["poli_ti^ko/s"],
        {"poli_ti^ko/s": "of, for, or relating to citizens"},
    ) == gloss


def test_merge_short_def_leaves_blank_gloss_blank():
    assert merge_short_def(
        "", "politiko/s", ["politiko/s"], {"politiko/s": "of, for"}
    ) == ""


def test_merge_short_def_requires_a_word_boundary():
    assert merge_short_def(
        "take", "test", ["test"], {"test": "takeover, assumption"}
    ) == "take"


def test_merge_short_def_prefers_exact_key_when_multiple_candidates_match():
    assert merge_short_def(
        "take",
        "test",
        ["test1", "test"],
        {"test1": "take the first fallback", "test": "take the exact entry"},
    ) == "take the exact entry"
