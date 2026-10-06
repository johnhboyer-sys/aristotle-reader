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


ECHEI = [  # Morpheus's order for ἔχει
    {"lemma": "e)/xis", "gloss": "viper", "parse": "masc nom/voc/acc dual (attic epic)",
     "lsj": ["e)/xi^s"]},
    {"lemma": "e)/xw", "gloss": "have, hold", "parse": "pres ind mp 2nd sg",
     "lsj": ["e)/xw1", "e)/xw2"]},
    {"lemma": "e)/xw", "gloss": "have, hold", "parse": "pres ind act 3rd sg",
     "lsj": ["e)/xw1", "e)/xw2"]},
]


def test_a_parse_picks_which_reading_of_the_lemma_is_promoted():
    table = _table(**{"e)/xei": {"lemma": "e)/xw", "parse": "pres ind act 3rd sg"}})

    out = apply_morphology_override([dict(p) for p in ECHEI], "e)/xei", table)

    assert out == [ECHEI[2], ECHEI[0], ECHEI[1]]


def test_a_parse_must_match_exactly_or_the_entry_does_nothing():
    for parse in ("pres ind act 3rd sg (attic)", "Pres ind act 3rd sg", "pres ind act"):
        table = _table(**{"e)/xei": {"lemma": "e)/xw", "parse": parse, "gloss": "x"}})

        out = apply_morphology_override([dict(p) for p in ECHEI], "e)/xei", table)

        assert out == ECHEI, parse


def test_other_glosses_reglosses_readings_behind_the_front_one():
    parses = [
        {"lemma": "a)/n1", "gloss": "he came", "parse": "indeclform (particle)",
         "lsj": ["a)/n"]},
        {"lemma": "a)/n2", "gloss": "he came", "parse": "attic (indeclform conj)",
         "lsj": ["a)/n"]},
        {"lemma": "a)na/", "gloss": "on board", "parse": "poetic indeclform (prep)",
         "lsj": ["a)na/"]},
    ]
    table = _table(**{"a)/n": {"lemma": "a)/n1", "gloss": "modal particle",
                               "other_glosses": {"a)/n2": "if", "a)/n1": "never"}}})

    out = apply_morphology_override([dict(p) for p in parses], "a)/n", table)

    assert [p["gloss"] for p in out] == ["modal particle", "if", "on board"]
    assert [(p["lemma"], p["parse"], p["lsj"]) for p in out] == [
        (p["lemma"], p["parse"], p["lsj"]) for p in parses]


def test_other_glosses_alone_leaves_the_front_reading_and_order_alone():
    parses = [
        {"lemma": "i)/sos", "gloss": "equal", "parse": "fem acc pl", "lsj": ["i)/sos"]},
        {"lemma": "oi)=da", "gloss": "behold!", "parse": "pres ind act 2nd sg",
         "lsj": ["oi)=da"]},
    ]
    table = _table(**{"i)/sas": {"other_glosses": {"oi)=da": "know"}}})

    out = apply_morphology_override([dict(p) for p in parses], "i)/sas", table)

    assert out == [parses[0], {**parses[1], "gloss": "know"}]


@pytest.mark.parametrize(
    "entries",
    [
        [{"surface": "x", "gloss": "g"}],  # no justification
        [{"surface": "x", "justification": "j"}],  # no lemma, gloss or other_glosses
        [{"surface": "x", "parse": "p", "gloss": "g", "justification": "j"}],  # parse without lemma
        [{"surface": "x", "other_glosses": {}, "justification": "j"}],
        [{"surface": "x", "other_glosses": ["l", "g"], "justification": "j"}],
        [{"surface": "x", "other_glosses": {"l": ""}, "justification": "j"}],
        [{"surface": "x", "other_glosses": {"l": 1}, "justification": "j"}],
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


# ── the shipped table ────────────────────────────────────────────────────────

AN = [  # Morpheus's own order for ἄν in the Metaphysics, glosses as it ships them
    {"lemma": "a)/n1", "gloss": "he came", "parse": "indeclform (particle)",
     "lsj": ["a)/n"]},
    {"lemma": "a)/n2", "gloss": "he came", "parse": "attic (indeclform conj)",
     "lsj": ["a)/n"]},
    {"lemma": "a)na/", "gloss": "on board", "parse": "poetic indeclform (prep)",
     "lsj": ["a)na/"]},
    {"lemma": "e)a/n", "gloss": "if haply, if", "parse": "contr indeclform (conj)",
     "lsj": ["e)a/n"]},
]


def test_ou_does_not_read_u():
    parses = [{"lemma": "ou)", "gloss": "u",
               "parse": "proclitic indeclform (adverb)", "lsj": ["ou)"]}]

    for surface in ("ou)", "ou)k", "ou)x", "ou)/", "ou)xi/"):
        [top] = resolve_parses([dict(p) for p in parses], {}, surface)
        assert top["gloss"] == "not", surface
        assert top["lsj"] == ["ou)"], "the card still opens LSJ οὐ"


def test_an_reads_as_the_modal_particle_first():
    out = resolve_parses([dict(p) for p in AN], {}, "a)/n")

    assert out[0]["lemma"] == "a)/n1"
    assert out[0]["parse"] == "indeclform (particle)"
    assert out[0]["gloss"] == "modal particle"
    assert [(p["lemma"], p["parse"]) for p in out[1:]] == [
        (p["lemma"], p["parse"]) for p in AN[1:]], "the other readings are kept, in order"


def test_mh_does_not_read_will():
    parses = [{"lemma": "mh/", "gloss": "will", "parse": "indeclform (conj)",
               "lsj": ["mh/"]}]

    [top] = resolve_parses(parses, {}, "mh/")

    assert top["gloss"] == "not"


def test_theon_reads_god_and_men_the_particle():
    theon = resolve_parses([dict(p) for p in THEON], {}, "qew=n")
    men = resolve_parses(
        [{"lemma": "mei/s", "gloss": "month", "parse": "masc nom/voc sg",
          "lsj": ["mei/s"]},
         {"lemma": "mh/n", "gloss": "month", "parse": "indeclform (particle)",
          "lsj": ["mh/n"]}],
        {}, "mh/n",
    )

    assert theon[0] == THEON[2]
    assert (men[0]["lemma"], men[0]["parse"]) == ("mh/n", "indeclform (particle)")
    assert men[0]["gloss"] != "month"


def test_echei_shows_the_third_person_of_echo():
    out = resolve_parses([dict(p) for p in ECHEI], {}, "e)/xei")

    assert (out[0]["lemma"], out[0]["parse"]) == ("e)/xw", "pres ind act 3rd sg")


def test_an_second_card_no_longer_reads_he_came():
    out = resolve_parses([dict(p) for p in AN], {}, "a)/n")

    assert out[1]["lemma"] == "a)/n2"
    assert "he came" not in [p["gloss"] for p in out]


def test_prepositions_read_their_common_senses():
    kata = [{"lemma": "kata/", "gloss": "downwards", "parse": "indeclform (prep)",
             "lsj": ["kata/1", "kata/2"]}]

    for surface in ("kata/", "kat'"):
        [top] = resolve_parses([dict(p) for p in kata], {}, surface)
        assert top["gloss"].startswith("according to"), surface


def test_physei_reads_nature_on_its_dative_reading():
    parses = [
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem nom/voc/acc dual (attic epic)",
         "lsj": ["fu/sis"]},
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem dat sg (epic)", "lsj": ["fu/sis"]},
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem dat sg (attic ionic)", "lsj": ["fu/sis"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "fu/sei")

    assert (out[0]["parse"], out[0]["gloss"]) == ("fem dat sg (attic ionic)", "nature")
    assert {p["gloss"] for p in out} == {"nature"}, "every φύσις card reads the same"


def test_legw_first_person_reads_say_not_lewd():
    parses = [
        {"lemma": "le/gos", "gloss": "lewd", "parse": "masc/neut nom/voc/acc dual", "lsj": ["le/gos"]},
        {"lemma": "le/gw1", "gloss": "gather, pick up", "parse": "pres ind act 1st sg", "lsj": ["le/gw"]},
        {"lemma": "le/gw3", "gloss": "gather, pick up", "parse": "pres subj act 1st sg", "lsj": ["le/gw"]},
        {"lemma": "le/gw3", "gloss": "gather, pick up", "parse": "pres ind act 1st sg", "lsj": ["le/gw"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "le/gw")

    assert (out[0]["lemma"], out[0]["parse"]) == ("le/gw3", "pres ind act 1st sg")
    assert out[0]["gloss"].startswith("say")
    assert "gather, pick up" not in [p["gloss"] for p in out if p["lemma"] != "le/gw2"]


def test_every_override_moves_or_reglosses_a_reading_morpheus_offers():
    """Over the built corpus: for every token whose surface has an override,
    the front reading afterwards is one Morpheus offered for that surface (same
    lemma, parse and LSJ keys) and carries what the entry asks for: its lemma,
    parse and gloss in front, its other_glosses behind. So an entry never
    invents a reading, never changes which LSJ entry a reading opens, and never
    names a lemma or parse the surface does not have. It holds on a build made
    before the overrides or after them.
    """
    dist = ROOT / "build" / "dist"
    works = sorted(p.parent.name for p in dist.glob("*/analyses.json"))
    if not works:
        pytest.skip("requires a local build/dist")

    seen, invented, unsatisfied = set(), [], []
    for work in works:
        analyses = json.loads(
            (dist / work / "analyses.json").read_text(encoding="utf-8"))
        for surface, entry in MORPHOLOGY_OVERRIDES.items():
            parses = analyses.get(surface)
            if not parses:
                continue
            seen.add(surface)
            top = apply_morphology_override([dict(p) for p in parses], surface)[0]
            if not any(
                p["lemma"] == top["lemma"] and p["parse"] == top["parse"]
                and p["lsj"] == top["lsj"] for p in parses
            ):
                invented.append((work, surface))
            out = apply_morphology_override([dict(p) for p in parses], surface)
            others = entry.get("other_glosses", {})
            if not (
                top["lemma"] == entry.get("lemma", top["lemma"])
                and top["parse"] == entry.get("parse", top["parse"])
                and top["gloss"] == entry.get("gloss", top["gloss"])
                and all(p["gloss"] == others[p["lemma"]]
                        for p in out[1:] if p["lemma"] in others)
            ):
                unsatisfied.append((work, surface))

    assert seen, "examined no override surface at all"
    assert invented == [], f"override invented a reading: {invented[:5]}"
    assert unsatisfied == [], f"override not carried out: {unsatisfied[:5]}"
    assert sorted(set(MORPHOLOGY_OVERRIDES) - seen) == [], "overrides that never fire"
