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


def test_scope_aristotle_is_accepted_and_the_pipeline_still_applies_it(tmp_path):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps([{"surface": "ou)", "lemma": "ou)", "gloss": "not",
                                 "scope": "aristotle", "justification": "j"}]))
    table = load_morphology_overrides(path)
    parses = [{"lemma": "ou)", "gloss": "u", "parse": "p", "lsj": ["ou)"]}]

    [top] = apply_morphology_override([dict(p) for p in parses], "ou)", table)

    assert top["gloss"] == "not"


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
        [{"surface": "x", "gloss": "g", "scope": "homer", "justification": "j"}],
        [{"surface": "x", "gloss": "g", "scope": "", "justification": "j"}],
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


def test_physei_opens_on_its_dative_reading():
    parses = [
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem nom/voc/acc dual (attic epic)",
         "lsj": ["fu/sis"]},
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem dat sg (epic)", "lsj": ["fu/sis"]},
        {"lemma": "fu/sis", "gloss": "origin", "parse": "fem dat sg (attic ionic)", "lsj": ["fu/sis"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "fu/sei")

    assert out[0] == parses[2], "the dative, with Morpheus's own gloss"


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


def test_apeiroi_reads_infinite_first_and_keeps_inexperienced_second():
    parses = [
        {"lemma": "a)/peiros1", "gloss": "without trial or experience of",
         "parse": "masc/fem nom/voc pl", "lsj": ["a)/peiros1"]},
        {"lemma": "a)/peiros2", "gloss": "boundless, infinite", "parse": "masc/fem nom/voc pl",
         "lsj": ["a)/peiros2"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "a)/peiroi")

    assert [p["lemma"] for p in out] == ["a)/peiros2", "a)/peiros1"]


def test_eron_reads_loving_not_earth():
    parses = [
        {"lemma": "e)/ra", "gloss": "earth", "parse": "fem gen pl", "lsj": ["e)/ra"]},
        {"lemma": "e)ra/w1", "gloss": "love", "parse": "pres part act masc voc sg", "lsj": ["e)ra/w1"]},
        {"lemma": "e)ra/w1", "gloss": "love", "parse": "pres part act masc nom sg (attic epic ionic)",
         "lsj": ["e)ra/w1"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "e)rw=n")

    assert (out[0]["lemma"], out[0]["parse"]) == ("e)ra/w1", "pres part act masc nom sg (attic epic ionic)")


def test_dehsetai_opens_on_the_future_with_morpheus_gloss():
    parses = [
        {"lemma": "de/w2", "gloss": "lack, miss, stand in need of",
         "parse": "aor subj mid 3rd sg (epic)", "lsj": ["de/w2"]},
        {"lemma": "de/w2", "gloss": "lack, miss, stand in need of",
         "parse": "fut ind mid 3rd sg", "lsj": ["de/w2"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "deh/setai")

    assert out[0] == parses[1], "the future, with Morpheus's own gloss"


def test_a_partial_but_real_gloss_is_left_alone():
    """John's rule: an override fixes a wrong word or a junk gloss, not a gloss
    that names one sense of the right word (ἀναγκαῖος 'of, with, or by force')."""
    parses = [
        {"lemma": "a)nagkai=on", "gloss": "place of constraint, prison",
         "parse": "neut nom/voc/acc sg", "lsj": ["a)nagkai=on"]},
        {"lemma": "a)nagkai=os", "gloss": "of, with, or by force",
         "parse": "neut nom/voc/acc sg", "lsj": ["a)nagkai=os"]},
    ]

    out = resolve_parses([dict(p) for p in parses], {}, "a)nagkai=on")

    assert out[0] == parses[1]


def _raw_morpheus_readings(surfaces):
    """Each surface's readings as greek-analyses.txt holds them (stage 4's own
    parser, so <foreign> tags are already stripped), before any filter,
    short-def extension or override: what Moerbeke applies the table to."""
    from aristotle_pipeline.config import Manifest
    from aristotle_pipeline.stage4_morphology import parse_analysis_line

    path = Manifest.for_work("EN").diogenes_data() / "greek-analyses.txt"
    if not path.exists():
        pytest.skip("requires Diogenes' greek-analyses.txt")
    found = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            key, _, value = line.partition("\t")
            if key in surfaces:
                found[key] = [
                    {"lemma": a["lemma"], "gloss": a["gloss"].strip(), "parse": a["parse"]}
                    for a in parse_analysis_line(value)
                ]
    return found


def test_every_override_does_what_it_promises_on_the_raw_morpheus_readings():
    """Apply each entry to its surface's raw Morpheus readings and check the
    promise: the front reading has the entry's lemma, parse and gloss; every
    other_glosses lemma names a reading behind the front one, and those carry
    the gloss; nothing is invented; and the entry changes something, so an
    apply that returned its input would fail here. The surface must be a key
    of the table itself (entries for forms absent from Aristotle are allowed).
    """
    raw = _raw_morpheus_readings(set(MORPHOLOGY_OVERRIDES))
    assert raw, "examined no override surface at all"

    problems = []
    for surface, entry in MORPHOLOGY_OVERRIDES.items():
        readings = raw.get(surface)
        if not readings:
            problems.append((surface, "not a key of greek-analyses.txt"))
            continue
        out = apply_morphology_override([dict(p) for p in readings], surface)
        top = out[0]
        if out == readings:
            problems.append((surface, "changes nothing"))
        if (top["lemma"], top["parse"]) not in {(p["lemma"], p["parse"]) for p in readings}:
            problems.append((surface, "invented a reading"))
        if top["lemma"] != entry.get("lemma", top["lemma"]):
            problems.append((surface, "lemma not first"))
        if top["parse"] != entry.get("parse", top["parse"]):
            problems.append((surface, "parse not first"))
        if top["gloss"] != entry.get("gloss", top["gloss"]):
            problems.append((surface, "gloss not applied"))
        for lemma, gloss in entry.get("other_glosses", {}).items():
            behind = [p for p in out[1:] if p["lemma"] == lemma]
            if not behind:
                problems.append((surface, f"other_glosses {lemma} matches no reading"))
            elif any(p["gloss"] != gloss for p in behind):
                problems.append((surface, f"other_glosses {lemma} not applied"))

    assert problems == [], f"{len(problems)} problems: {problems[:8]}"


def test_the_raw_check_fails_when_apply_does_nothing(monkeypatch):
    """The check above must not pass on an identity apply."""
    monkeypatch.setattr(
        sys.modules[__name__], "apply_morphology_override",
        lambda parses, surface, overrides=None: parses)
    with pytest.raises(AssertionError):
        test_every_override_does_what_it_promises_on_the_raw_morpheus_readings()
