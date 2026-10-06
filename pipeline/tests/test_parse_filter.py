import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.parse_filter import filter_parses


def test_filter_parses_drops_redundant_unresolved_readings_only():
    resolved = {"lemma": "ἡδονή", "gloss": "pleasure", "lsj": [{"id": "h(donh/"}]}
    duplicate_unresolved = {"lemma": "ἡδονά", "gloss": "pleasure", "lsj": []}
    blank_unresolved = {"lemma": "noise", "gloss": "  ", "lsj": []}
    distinct_unresolved = {"lemma": "πέλω", "gloss": "to be", "lsj": []}

    assert filter_parses(
        [resolved, duplicate_unresolved, blank_unresolved, distinct_unresolved]
    ) == [resolved, distinct_unresolved]


def test_filter_parses_keeps_all_unresolved_tokens_so_it_never_empties():
    parses = [
        {"lemma": "rare", "gloss": "", "lsj": []},
        {"lemma": "name", "gloss": "proper name", "lsj": []},
    ]

    assert filter_parses(parses) == parses


def test_filter_parses_keeps_unresolved_distinct_gloss_with_resolved_sibling():
    resolved = {"lemma": "resolved", "gloss": "carrying", "lsj": [{"id": "ferw"}]}
    distinct = {"lemma": "unresolved", "gloss": "bearing away", "lsj": []}

    assert filter_parses([resolved, distinct]) == [resolved, distinct]


# ── curated overrides: Morpheus's first reading is not the word ─────────────

import json

import pytest

from aristotle_pipeline.parse_filter import (
    MORPHOLOGY_OVERRIDES,
    apply_morphology_override,
    load_morphology_overrides,
)
from aristotle_pipeline.stage7_emit import resolve_parses


def _table(**entries):
    return {surface: {"surface": surface, "justification": "test", **fields}
            for surface, fields in entries.items()}


THEON = [
    {"lemma": "qe/a", "gloss": "seeing, looking at", "parse": "fem gen pl",
     "lsj": ["qe/a_"]},
    {"lemma": "qea/", "gloss": "goddess", "parse": "fem gen pl", "lsj": ["qea/"]},
    {"lemma": "qeo/s", "gloss": "God, the Deity", "parse": "masc gen pl",
     "lsj": ["qeo/s"]},
]


def test_a_promoted_reading_moves_whole_and_the_rest_keep_their_order():
    out = apply_morphology_override(
        [dict(p) for p in THEON], "qew=n", _table(**{"qew=n": {"lemma": "qeo/s"}})
    )

    assert out[0] == THEON[2], "parse and LSJ keys come with it, nothing relabelled"
    assert out[1:] == THEON[:2]


def test_an_override_gloss_applies_to_the_promoted_reading():
    parses = [
        {"lemma": "mei/s", "gloss": "month", "parse": "masc nom/voc sg",
         "lsj": ["mei/s"]},
        {"lemma": "mh/n", "gloss": "month", "parse": "indeclform (particle)",
         "lsj": ["mh/n"]},
    ]
    table = _table(**{"mh/n": {"lemma": "mh/n", "gloss": "truly"}})

    out = apply_morphology_override([dict(p) for p in parses], "mh/n", table)

    assert out[0] == {**parses[1], "gloss": "truly"}
    assert out[1] == parses[0]


def test_an_override_gloss_replaces_a_junk_gloss_in_place():
    parses = [{"lemma": "ou)", "gloss": "u",
               "parse": "proclitic indeclform (adverb)", "lsj": ["ou)"]}]
    table = _table(**{"ou)": {"lemma": "ou)", "gloss": "not"}})

    [top] = apply_morphology_override([dict(p) for p in parses], "ou)", table)

    assert top == {**parses[0], "gloss": "not"}


def test_an_override_naming_an_absent_lemma_changes_nothing():
    table = _table(**{"qew=n": {"lemma": "not-offered", "gloss": "junk"}})

    out = apply_morphology_override([dict(p) for p in THEON], "qew=n", table)

    assert out == THEON


def test_override_does_not_mutate_its_input():
    parses = [{"lemma": "ou)", "gloss": "u", "parse": "p", "lsj": ["ou)"]}]

    apply_morphology_override(parses, "ou)", _table(**{"ou)": {"gloss": "not"}}))

    assert parses[0]["gloss"] == "u"


def test_resolve_parses_applies_the_override_for_its_token_key(monkeypatch):
    monkeypatch.setitem(
        MORPHOLOGY_OVERRIDES, "test-surface",
        {"surface": "test-surface", "lemma": "qeo/s", "justification": "test"},
    )

    promoted = resolve_parses([dict(p) for p in THEON], {}, "test-surface")
    untouched = resolve_parses([dict(p) for p in THEON], {}, "other-surface")

    assert promoted[0]["lemma"] == "qeo/s"
    assert untouched == THEON


@pytest.mark.parametrize(
    "entries",
    [
        [{"surface": "x", "gloss": "g"}],  # no justification
        [{"surface": "x", "justification": "j"}],  # neither lemma nor gloss
        [{"surface": "x", "gloss": "g", "justification": "j", "rank": 1}],
        [{"surface": "x", "gloss": "", "justification": "j"}],
        [{"surface": "x", "gloss": "g", "justification": "j"},
         {"surface": "x", "lemma": "l", "justification": "j"}],  # duplicate
        {"x": {"gloss": "g"}},  # not a list
    ],
)
def test_loader_rejects_a_malformed_table(tmp_path, entries):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps(entries), encoding="utf-8")

    with pytest.raises(ValueError):
        load_morphology_overrides(path)
