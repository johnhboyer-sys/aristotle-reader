"""Oxford vol. VI (1913): the print readings settled against History Genie's
second read (tools/vol6_genie.py) stay in our English.

Each work's English rests on one archive.org OCR read. On 2026-11-07 every
difference from Genie's independent read was judged on the page images of
archive.org worksofaristotle0001unse_r3i1; our errors became PRINT_READS.
A re-fetch or regeneration of a source must not bring one back.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import vol6_genie as v  # noqa: E402
from aristotle_pipeline import stage1_archive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def _prose(work: str) -> str:
    cfg = yaml.safe_load((ROOT / "manifests" / f"{work}.yaml").read_text(encoding="utf-8"))
    prose = stage1_archive._load_prose(cfg["english"]["primary"])
    return " ".join(" ".join(t.split()) for _, t in sorted(prose.items()))


@pytest.mark.parametrize("work", sorted(v.PRINT_READS))
def test_print_reads_hold(work):
    assert v.check([work]) == []


def test_check_sees_an_undone_read():
    old, new, _ = v.PRINT_READS["Lin"][0]
    undone = v._html_text("Lin").replace(new, old, 1)
    assert v.check(["Lin"], {"Lin": undone})


def test_rulings_are_bound():
    for work, reads in v.PRINT_READS.items():
        assert work in v.WORKS
        for old, new, why in reads:
            assert old != new and re.match(r"leaf \d+", why), (work, old)
    seen = set()
    for entry in v.VERIFY_ALLOW:
        work, before, ours, genie, why = entry
        assert work in v.WORKS and re.match(r"leaf \d+: ", why), entry
        assert (work, before, ours) not in seen, entry
        seen.add((work, before, ours))


def test_lin_keeps_joachims_angle_brackets():
    text = _prose("Lin")
    for phrase in ("per impossibile", "by the preceding argument", "when in contact", "too"):
        assert f"⟨{phrase}⟩" in text and f"({phrase})" not in text, phrase


def test_mech_figure_labels_as_printed():
    text = _prose("Mech")
    for bad in ("KAM", "ZA [at A]", "perpendicular to ZA and AH", "Let BΓΔE", "the fulcrum is ZA.",
                "circle by its own motion, equal to ZA.", "at the points A and Γ", "the common centre, ZΓ"):
        assert bad not in text, bad
    for good in ("KΛM", "Let BΓEΔ", "the fulcrum is ZΔ.", "and ZA again"):
        assert good in text, good


def test_mxg_not_being_keeps_its_hyphen():
    assert "Notbeing" not in _prose("MXG")

