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


def test_chapter_range_ends_on_the_last_real_line_before_the_next_chapter():
    """PA 689a has no line 14: the Budé prints 13-14 as one physical line and
    stage1 files it as 13. A chapter starting at 689a15 must end the previous
    one at 13 — the last line that exists — not at an arithmetical 14 that
    preflight then reports as a dangling Bekker anchor."""
    from aristotle_pipeline.stage7_emit import chapter_ranges

    spine = {"work": "TST", "segments": [
        {"id": "4:689a", "book": 4, "column": "689a", "lines": [
            {"n": 12, "text": "a"}, {"n": 13, "text": "b"}, {"n": 15, "text": "c"},
            {"n": 16, "text": "d"},
        ]},
        {"id": "4:689b", "book": 4, "column": "689b", "lines": [
            {"n": 1, "text": "e"}, {"n": 2, "text": "f"},
        ]},
    ]}
    chapters = [
        {"book": 4, "chapter": "10", "column": "689a", "line": "12"},
        {"book": 4, "chapter": "11", "column": "689a", "line": "15"},
        {"book": 4, "chapter": "12", "column": "689b", "line": "1"},
    ]
    ranges = chapter_ranges(spine, chapters)
    assert ranges[(4, "10")] == "689a12–13"
    assert ranges[(4, "11")] == "689a15–16"
    assert ranges[(4, "12")] == "689b1–2"


# ── overrides are keyed by the Morpheus table key, not the corpus token key ──

import pytest

from aristotle_pipeline import stage7_emit
from aristotle_pipeline.parse_filter import MORPHOLOGY_OVERRIDES


def _emit_with_table_key(tmp_path, monkeypatch, token_key, table_key, readings):
    build = tmp_path / "build"
    (build / "stage4").mkdir(parents=True)
    (build / "stage5").mkdir()
    (build / "stage4" / "analyses.json").write_text(json.dumps({table_key: readings}))
    (build / "stage4" / "key_map.json").write_text(json.dumps({token_key: table_key}))
    (build / "stage5" / "lemma_map.json").write_text(
        json.dumps({r["lemma"]: [r["lemma"]] for r in readings}))
    (build / "stage5" / "short_defs.json").write_text("{}")
    monkeypatch.setattr(stage7_emit, "BUILD_DIR", build)
    out = tmp_path / "out"
    out.mkdir()
    stage7_emit.emit_analyses(out)
    return json.loads((out / "analyses.json").read_text())[token_key]


@pytest.mark.parametrize(
    ("token_key", "table_key"),
    [("pro+i/ento", "proi(/ento"),  # diaeresis token, filed under the breathing
     ("swkra/ths", "*swkra/ths")],  # proper name, filed only under the starred key
)
def test_an_override_fires_by_the_table_key_its_token_resolved_to(
        tmp_path, monkeypatch, token_key, table_key):
    readings = [
        {"lemma": "wrong", "gloss": "junk", "parse": "p1"},
        {"lemma": "right", "gloss": "fine", "parse": "p2"},
    ]
    monkeypatch.setitem(MORPHOLOGY_OVERRIDES, table_key, {
        "surface": table_key, "lemma": "right", "gloss": "fixed", "justification": "test"})

    out = _emit_with_table_key(tmp_path, monkeypatch, token_key, table_key, readings)

    assert [(p["lemma"], p["gloss"]) for p in out] == [("right", "fixed"), ("wrong", "junk")]
