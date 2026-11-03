import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline import stage4_morphology as s4


def test_foreign_tags_are_stripped_from_a_gloss_keeping_the_greek():
    # Diogenes' greek-analyses.txt carries LSJ's <foreign> markup inside glosses;
    # the word card showed it as literal text.
    value = (
        '{63391185 9 me/shs\ta wind between <foreign lang="greek">ἀπαρκτίας</foreign>'
        ' and <foreign lang="greek">καικίας,</foreign>\tmasc nom sg}'
        '{70240617 9 oi)keio/w\tmake <foreign lang="greek">οἰκεῖος</foreign>'
        '\tpres imperat act 2nd sg}'
    )

    first, second = s4.parse_analysis_line(value)

    assert first["gloss"] == "a wind between ἀπαρκτίας and καικίας,"
    assert second["gloss"] == "make οἰκεῖος"
    assert "<" not in first["gloss"] + second["gloss"]


def test_a_gloss_without_markup_is_unchanged():
    [analysis] = s4.parse_analysis_line(
        "{72815844 9 kai/\tand\tindeclform (conj)}"
    )

    assert analysis["gloss"] == "and"
