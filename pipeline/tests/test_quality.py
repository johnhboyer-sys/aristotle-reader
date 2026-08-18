import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.quality import check_breathing, illegal_breathing


def test_illegal_breathing_flags_only_marks_past_the_opening_cluster():
    for surface in ("ποιοῦσιναἱ", "τὴνφορὰνἔφαμεν", "οἰὀμεθʼ"):
        assert illegal_breathing(surface) is True

    for surface in ("ἄνθρωπος", "αἱ", "οὗτος", "κἀγώ", "τἀγαθόν"):
        assert illegal_breathing(surface) is False


def test_known_late_fusion_crasis_is_allowed():
    report = check_breathing(
        [{"ref": "1a1", "surface": "ἐγᾦδα"}],
        [],
    )

    check = report["checks"]["breathing_position"]
    assert check["flagged"] == [
        {"ref": "1a1", "surface": "ἐγᾦδα", "allowed": True, "reason": "crasis"}
    ]
    assert check["unexpected"] == []
    assert check["ok"] is True
    assert report["ok"] is True


def test_mid_compound_coronis_is_crasis():
    # The one mid-word coronis family in the emitted corpus (EE).
    for surface in ("καλοκἀγαθία", "καλοκἀγαθίαν", "καλοκἀγαθίας"):
        assert illegal_breathing(surface) is True
        report = check_breathing([{"ref": "1248b1", "surface": surface}], [])
        check = report["checks"]["breathing_position"]
        assert check["flagged"][0]["reason"] == "crasis"
        assert check["ok"] is True


def test_medial_rho_breathing_is_orthodox():
    # This spine writes the ῤῥ breathing (ἐῤῥήθη, πυῤῥῷ in Cat); a breathing
    # on rho is never the run-together-word signature.
    for surface in ("ἐῤῥήθη", "πυῤῥῷ"):
        assert illegal_breathing(surface) is True
        report = check_breathing([{"ref": "1a1", "surface": surface}], [])
        check = report["checks"]["breathing_position"]
        assert check["flagged"][0]["reason"] == "rho-breathing"
        assert check["ok"] is True

    # A vowel breathing past the cluster stays unexpected even when a rho
    # breathing also appears — rho must not launder the real signature.
    report = check_breathing([{"ref": "1a1", "surface": "πυῤῥῷἁ"}], [])
    assert report["checks"]["breathing_position"]["unexpected"] != []


def test_allowlist_matches_ref_and_surface():
    token = {"ref": "1a1", "surface": "ποιοῦσιναἱ"}
    report = check_breathing([token], [token])

    check = report["checks"]["breathing_position"]
    assert check["flagged"] == [
        {
            "ref": "1a1",
            "surface": "ποιοῦσιναἱ",
            "allowed": True,
            "reason": "allowlist",
        }
    ]
    assert check["unexpected"] == []
    assert report["ok"] is True


def test_ok_is_false_only_for_unexpected_hits_and_rate_counts_all_hits():
    tokens = [
        {"ref": "1a1", "surface": "ποιοῦσιναἱ"},
        {"ref": "1a2", "surface": "τὴνφορὰνἔφαμεν"},
        {"ref": "1a3", "surface": "ἐγᾦδα"},
        {"ref": "1a4", "surface": "ἄνθρωπος"},
    ]
    report = check_breathing(
        tokens,
        [{"ref": "1a2", "surface": "τὴνφορὰνἔφαμεν"}],
    )

    check = report["checks"]["breathing_position"]
    assert check["tokens_checked"] == 4
    assert len(check["flagged"]) == 3
    assert check["unexpected"] == [
        {"ref": "1a1", "surface": "ποιοῦσιναἱ"}
    ]
    assert check["per_10k"] == 7500.0
    assert check["ok"] is False
    assert report["ok"] is False

    clean = check_breathing(
        [{"ref": "1a1", "surface": "ἄνθρωπος"}],
        [],
    )
    assert clean["checks"]["breathing_position"]["per_10k"] == 0.0
    assert clean["ok"] is True
