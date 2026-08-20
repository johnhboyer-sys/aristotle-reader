"""Stage 7 emit sidecar steps.

Quotations are curated per-work data copied into the work output dir, not a
report. A missing file is the normal case.
"""

import json
from pathlib import Path

from aristotle_pipeline.stage7_emit import copy_quotations

ROW = {
    "column": "1000b",
    "lo": 6,
    "hi": 9,
    "cite": "Empedocles fr. 109 DK",
    "author": "Empedocles",
    "url": "https://www.perseus.tufts.edu/hopper/text?doc=Perseus:abo:tlg,1342,004:109",
    "attestation": "DK",
}


def test_quotations_file_present_is_copied(tmp_path: Path):
    src_dir = tmp_path / "quotations"
    src_dir.mkdir()
    (src_dir / "Meta.json").write_text(json.dumps([ROW]), encoding="utf-8")
    out_dir = tmp_path / "out"
    out_dir.mkdir()

    copy_quotations(work_id="Meta", out_dir=out_dir, data_dir=src_dir)

    dest = out_dir / "quotations.json"
    assert dest.exists()
    assert json.loads(dest.read_text(encoding="utf-8")) == [ROW]


def test_quotations_file_absent_is_silent(tmp_path: Path):
    out_dir = tmp_path / "out"
    out_dir.mkdir()

    copy_quotations(work_id="EN", out_dir=out_dir, data_dir=tmp_path / "quotations")

    assert not (out_dir / "quotations.json").exists()
