import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage2_validate import validate
from aristotle_pipeline.stage3_tokenize import tokenize


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
