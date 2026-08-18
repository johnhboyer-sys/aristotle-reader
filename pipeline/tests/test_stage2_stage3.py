import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage2_validate import validate
from aristotle_pipeline.stage3_tokenize import tokenize
from aristotle_pipeline import __main__ as pipeline_main
from aristotle_pipeline import quality, stage3_tokenize


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TinyManifest:
    first_column = "1094a"
    last_column = "1094b"
    books = [{"n": 1, "start": "1094a1", "end": "1094b2"}]
    data = {
        "work": {"id": "TST"},
        "bekker_range": {"first_column": first_column, "last_column": last_column},
        "books": books,
        "proper_names": [],
    }


def _tiny_spine():
    return {
        "work": "TST",
        "segments": [
            {
                "id": "1:1094a",
                "book": 1,
                "column": "1094a",
                "lines": [
                    {"n": 1, "text": "Ἀγαθός ἐστι."},
                    {"n": 2, "text": "τῷ λόγος"},
                ],
            },
            {
                "id": "1:1094b",
                "book": 1,
                "column": "1094b",
                "lines": [
                    {"n": 1, "text": "κατ’ ἀρετήν"},
                    {"n": 2, "text": "†λόγος†—ἀγαθός"},
                ],
            },
        ],
    }


def _tiny_english():
    return {
        "chunks": [
            {
                "id": "1:1094a",
                "column": "1094a",
                "text": "The good is something in speech.",
            },
            {
                "id": "1:1094b",
                "column": "1094b",
                "text": "According to virtue, speech is good.",
            },
        ]
    }


def _tiny_alignment():
    return {
        "pairs": [
            {"segment": "1:1094a", "english": "1:1094a"},
            {"segment": "1:1094b", "english": "1:1094b"},
        ],
        "english_only": [],
    }


def test_tokenize_records_offsets_boundaries_sigla_and_is_idempotent():
    tokens, sigla_log, key_failures = tokenize(_tiny_spine())

    assert key_failures == []
    assert tokens["segments"][0]["lines"][0]["tokens"] == [
        {"t": "Ἀγαθός", "o": 0, "k": "a)gaqo/s"},
        {"t": "ἐστι", "o": 7, "k": "e)sti"},
    ]
    assert tokens["segments"][0]["lines"][1]["tokens"] == [
        {"t": "τῷ", "o": 0, "k": "tw=|"},
        {"t": "λόγος", "o": 3, "k": "lo/gos"},
    ]
    assert tokens["segments"][1]["lines"][1]["tokens"] == [
        {"t": "λόγος", "o": 0, "k": "lo/gos"},
        {"t": "ἀγαθός", "o": 8, "k": "a)gaqo/s"},
    ]
    assert sigla_log == [{"ref": "1094b2", "raw": "†λόγος†", "kept": "λόγος"}]
    assert tokenize(_tiny_spine()) == (tokens, sigla_log, key_failures)


def test_validate_reports_clean_tiny_fixture_and_is_idempotent():
    report = validate(TinyManifest(), _tiny_spine(), _tiny_english(), _tiny_alignment())

    assert report["ok"] is True
    assert report["checks"]["columns"] == {
        "expected": 2,
        "found": 2,
        "missing": [],
        "extra": [],
        "monotonic": True,
        "ok": True,
    }
    assert report["checks"]["line_gaps"]["unexpected"] == []
    assert report["checks"]["alignment"]["unexpected_unmatched"] == []
    assert report["checks"]["alignment"]["unexpected_english_only"] == []
    assert report["checks"]["sigla"]["characters"] == [
        {
            "char": "†",
            "name": "DAGGER",
            "count": 2,
            "samples": [
                {"ref": "1094b2", "text": "†λόγος†—ἀγαθός"},
                {"ref": "1094b2", "text": "†λόγος†—ἀγαθός"},
            ],
        }
    ]
    assert validate(TinyManifest(), _tiny_spine(), _tiny_english(), _tiny_alignment()) == report


def test_deterministic_stage2_stage3_smoke_matches_golden_fixture():
    tokens, sigla_log, key_failures = tokenize(_tiny_spine())
    report = validate(TinyManifest(), _tiny_spine(), _tiny_english(), _tiny_alignment())
    smoke = {
        "tokens": tokens,
        "sigla_log": sigla_log,
        "key_failures": key_failures,
        "validation": {
            "ok": report["ok"],
            "columns": report["checks"]["columns"],
            "line_gaps": report["checks"]["line_gaps"],
            "alignment": report["checks"]["alignment"],
            "sigla": report["checks"]["sigla"],
        },
    }

    expected = json.loads(
        (FIXTURES / "deterministic_stage2_stage3_golden.json").read_text(encoding="utf-8")
    )
    assert smoke == expected


def test_a_lettered_line_is_not_a_line_gap():
    """Bekker's 5a hangs off line 5 and keeps its number, so the pair 5 -> 5a
    is not a gap. Reading the numbers alone made every lettered line — Physics
    244b 5a-5d, DA 416b25a-c, Mete 346a9a-d — fail validation."""
    spine = _tiny_spine()
    spine["segments"][0]["lines"] = [
        {"n": 1, "text": "Ἀγαθός ἐστι."},
        {"n": 1, "sub": "a", "text": "καὶ τὸ μέσον"},
        {"n": 1, "sub": "b", "text": "τῆς ἀρετῆς"},
        {"n": 2, "text": "τῷ λόγος"},
    ]

    report = validate(TinyManifest(), spine, _tiny_english(), _tiny_alignment())

    assert report["checks"]["line_gaps"]["unexpected"] == []


def test_stage3_hard_gate_fails_on_unexpected_but_still_writes_report(
    tmp_path, monkeypatch, capsys
):
    spine = _tiny_spine()
    spine["segments"] = [spine["segments"][0]]
    spine["segments"][0]["lines"] = [
        {"n": 1, "text": "ποιοῦσιναἱ τὴνφορὰνἔφαμεν"},
    ]
    manifest = TinyManifest()
    manifest.data = {
        **TinyManifest.data,
        "illegal_breathing_allow": [
            {"ref": "1094a1", "surface": "τὴνφορὰνἔφαμεν"}
        ],
    }
    build_dir = tmp_path / "build"
    stage1 = build_dir / "stage1"
    stage1.mkdir(parents=True)
    (stage1 / "greek_spine.json").write_text(
        json.dumps(spine, ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setattr(stage3_tokenize, "BUILD_DIR", build_dir)
    monkeypatch.setattr(pipeline_main, "BUILD_DIR", build_dir)

    assert quality.HARD_GATE is True
    with pytest.raises(SystemExit) as exc:
        pipeline_main._stage3(manifest)
    assert exc.value.code == 1

    report = json.loads(
        (build_dir / "stage3" / "quality_report.json").read_text(encoding="utf-8")
    )
    check = report["checks"]["breathing_position"]
    assert report["ok"] is False
    assert check["unexpected"] == [
        {"ref": "1094a1", "surface": "ποιοῦσιναἱ"}
    ]
    assert check["flagged"][1] == {
        "ref": "1094a1",
        "surface": "τὴνφορὰνἔφαμεν",
        "allowed": True,
        "reason": "allowlist",
    }
    assert "stage3-quality: checked=2 unexpected=1 FLAGGED" in capsys.readouterr().out


def test_stage3_hard_gate_passes_a_clean_work(tmp_path, monkeypatch, capsys):
    spine = _tiny_spine()
    spine["segments"] = [spine["segments"][0]]
    spine["segments"][0]["lines"] = [
        {"n": 1, "text": "ἄνθρωπος κἀγώ καλοκἀγαθία ἐῤῥήθη"},
    ]
    manifest = TinyManifest()
    build_dir = tmp_path / "build"
    stage1 = build_dir / "stage1"
    stage1.mkdir(parents=True)
    (stage1 / "greek_spine.json").write_text(
        json.dumps(spine, ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setattr(stage3_tokenize, "BUILD_DIR", build_dir)
    monkeypatch.setattr(pipeline_main, "BUILD_DIR", build_dir)

    pipeline_main._stage3(manifest)

    report = json.loads(
        (build_dir / "stage3" / "quality_report.json").read_text(encoding="utf-8")
    )
    assert report["ok"] is True
    assert "stage3-quality:" in capsys.readouterr().out
