import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.beta import capital_key, lookup_variants, to_beta_key


def test_to_beta_key_keeps_accents_breathings_iota_subscript_and_final_sigma():
    assert to_beta_key("ἀγαθός") == "a)gaqo/s"
    assert capital_key(to_beta_key("Ἀγαθός")) == "*)agaqo/s"
    assert to_beta_key("τῷ") == "tw=|"
    assert to_beta_key("λόγος") == "lo/gos"


def test_to_beta_key_normalizes_grave_and_elision_apostrophe():
    assert to_beta_key("ἄνθρωπός") == "a)/nqrwpos"
    assert to_beta_key("κατ’") == "kat'"


def test_lookup_variants_expands_diaeresis_and_capital_lookup_keys():
    assert lookup_variants("pro+i/ento", capitalized=True) == [
        "pro+i/ento",
        "proi/ento",
        "pro(i/ento",
        "pro)i/ento",
        "*pro+i/ento",
        "*proi/ento",
        "*pro(i/ento",
        "*pro)i/ento",
    ]


def test_lookup_variants_preserves_homograph_digits_in_existing_keys():
    assert capital_key("tis1") == "*tis1"
    assert lookup_variants("tis1", capitalized=True) == ["tis1", "*tis1"]


def test_to_beta_key_rejects_digits_in_surface_tokens():
    with pytest.raises(ValueError, match="cannot transliterate"):
        to_beta_key("τις1")
