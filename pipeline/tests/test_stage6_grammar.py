"""Stage 6: the morphology feature parser, signatures, and chapter remapping.

The honesty tier is what these tests defend. Morpheus emits one raw parse
string per analysis, and a single analysis can itself be ambiguous
("fem nom/voc sg"). Counting analysis records would call that a sole certain
parse; expanding syncretic values inside each reading is what makes the
ambiguity count mean what a reader is told it means.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage6_search import (  # noqa: E402
    parse_reading,
    remap_word_index,
    signature,
)


def _tokens(*surfaces):
    return [{"t": s, "o": 0} for s in surfaces]


class TestParseReading:
    def test_reads_a_full_verbal_parse(self):
        assert parse_reading("pres ind act 2nd sg") == {
            "tense": ["pres"],
            "mood": ["ind"],
            "voice": ["act"],
            "person": ["2nd"],
            "number": ["sg"],
        }

    def test_expands_syncretic_values_inside_one_reading(self):
        # ἀρετή: a single Morpheus analysis that is genuinely nom-or-voc.
        assert parse_reading("fem nom/voc sg")["case"] == ["nom", "voc"]
        assert parse_reading("neut nom/voc/acc pl")["case"] == ["acc", "nom", "voc"]
        assert parse_reading("masc/fem acc sg")["gender"] == ["fem", "masc"]

    def test_strips_glued_parentheses_from_qualifier_runs(self):
        # Morpheus glues parens to the first and last word: "(doric aeolic)".
        assert parse_reading("pres ind act 2nd sg (doric aeolic)") == parse_reading(
            "pres ind act 2nd sg"
        )
        assert parse_reading("fem nom/voc sg (attic epic ionic)")["number"] == ["sg"]

    def test_ignores_dialect_and_clitic_markers(self):
        # Not queryable features: two analyses differing only by dialect are the
        # same morphological reading and should collapse.
        assert parse_reading("epic doric aeolic enclitic nu_movable indeclform") == {}

    def test_indexes_explicit_markers_but_infers_no_part_of_speech(self):
        assert parse_reading("indeclform (conj)") == {"marker": ["conj"]}
        assert parse_reading("(adverb)") == {"marker": ["adverb"]}
        # A nominal parse yields no marker: nouns and adjectives are
        # indistinguishable here, so nothing claims a part of speech.
        assert "marker" not in parse_reading("masc nom sg")

    def test_part_is_the_participle_mood_not_the_particle_marker(self):
        assert parse_reading("pres part act masc nom sg")["mood"] == ["part"]
        assert parse_reading("(particle)") == {"marker": ["particle"]}


class TestSignature:
    def test_keeps_whole_readings_so_correlations_survive(self):
        # A flattened per-category union would let masc+acc+sg match, though
        # neither reading licenses that combination.
        sig = signature(
            [{"parse": "masc nom sg"}, {"parse": "fem acc pl"}]
        )
        combos = [dict(r) for r in sig]
        assert len(combos) == 2
        for reading in combos:
            assert not (
                reading.get("gender") == ("masc",)
                and reading.get("case") == ("acc",)
            )

    def test_collapses_analyses_that_differ_only_by_dialect_or_lemma(self):
        sig = signature(
            [
                {"parse": "fem nom/voc sg (attic epic ionic)", "lemma": "a"},
                {"parse": "fem nom/voc sg (doric)", "lemma": "b"},
            ]
        )
        assert len(sig) == 1

    def test_is_order_independent(self):
        a = signature([{"parse": "masc nom sg"}, {"parse": "fem acc pl"}])
        b = signature([{"parse": "fem acc pl"}, {"parse": "masc nom sg"}])
        assert a == b

    def test_empty_for_analyses_with_no_usable_parse(self):
        assert signature([]) == ()
        assert signature([{"parse": ""}, {"parse": "epic"}]) == ()

    def test_single_analysis_can_still_be_ambiguous(self):
        # The whole point: one analysis record, three possible cases.
        sig = signature([{"parse": "neut nom/voc/acc pl"}])
        assert len(sig) == 1
        values = {v for reading in sig for cat, vs in reading if cat == "case" for v in vs}
        assert values == {"nom", "voc", "acc"}


class TestRemapWordIndex:
    def test_maps_a_word_index_onto_the_matching_token(self):
        text = "ἐπὶ τῶν λεχθεισῶν ἐπιστημῶν Εἰ δή"
        tokens = _tokens("ἐπὶ", "τῶν", "λεχθεισῶν", "ἐπιστημῶν", "Εἰ", "δή")
        assert remap_word_index(text, tokens, 4) == 4

    def test_survives_punctuation_the_two_tokenizers_treat_differently(self):
        text = "πρᾶξίς τε καὶ προαίρεσις, ἀγαθοῦ"
        tokens = _tokens("πρᾶξίς", "τε", "καὶ", "προαίρεσις", "ἀγαθοῦ")
        assert remap_word_index(text, tokens, 3) == 3

    def test_returns_none_when_the_streams_do_not_align(self):
        # Token stream missing a word the line text has: refuse to guess.
        text = "ἐπὶ τῶν λεχθεισῶν ἐπιστημῶν"
        assert remap_word_index(text, _tokens("ἐπὶ", "τῶν"), 1) is None

    def test_returns_none_for_an_out_of_range_index(self):
        text = "ἐπὶ τῶν"
        assert remap_word_index(text, _tokens("ἐπὶ", "τῶν"), 5) is None
        assert remap_word_index(text, _tokens("ἐπὶ", "τῶν"), -1) is None
