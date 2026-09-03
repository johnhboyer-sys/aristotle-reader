"""Headwords run in alphabetical order, so a misread one falls out of the run.

Ground truth is p051-L:16, where the printed line reads
    ἀμυργοὶ λαμπτῆρες (Emped 222, v l ἀμοργȣ́ς)
The variant cited in the line is ἀμοργȣ́ς, so the headword is ἀμοργοί and the
υ is a misreading. No lexical test sees it — ἀμυργοί and ἀμοργοί are both
unattested in our corpus — but the alphabetical position is decisive: ἀμοργ-
belongs between ἄμορφος and ἀμουσία, which is exactly where it sits.
"""

from bonitz_pipeline.alphacheck import scan, sort_key


def test_sort_key_spells_out_the_ligature():
    """ἀκολȣθ- must file where ἀκολουθ- belongs, not after ω."""
    assert sort_key('ἀκολȣθεῖ') == sort_key('ἀκολουθει')
    assert sort_key('ἀκολȣθεῖ') < sort_key('ἀκρα')


def test_sort_key_ignores_accent_breathing_and_final_sigma():
    assert sort_key('ἅμα') == sort_key('αμα')
    assert sort_key('ἀλιεύς') == sort_key('αλιευσ')


def test_a_single_misplaced_word_is_reported_alone():
    """The LIS formulation must not indict every headword after the bad one."""
    v = scan(list(range(15, 52)))
    words = [x['word'] for x in v]
    # ⚠ `ἀμυργοὶ` WAS THE KNOWN MISREAD HEADWORD, AND ITS ABSENCE IS A
    # CORRECTION. It filed under ἀμυ- where ἀμο- belongs. John ruled the audit
    # card at page-051-L:16 on 2026-08-13 — `ἀμυργοὶ` → `ἀμȣργοὶ`, the
    # ou-ligature, i.e. ἀμοργοὶ — and `audit_apply` wrote it, so the headword
    # now sorts where it should. Nothing about alphabetical order was on that
    # card, which makes this sweep an independent witness that he read it
    # right.
    assert 'ἀμυργοὶ' not in words and 'ἀμȣργοὶ' not in words
    # the sweep is still looking AND still finding: an empty result would
    # satisfy every assertion below while proving nothing
    assert v
    # ...and the run does not cascade: neighbours stay clean
    assert 'ἀμορφος' not in words and 'ἀμπελίνα' not in words
    # signal stays sparse enough to be reviewable by hand
    assert len(v) < 40
