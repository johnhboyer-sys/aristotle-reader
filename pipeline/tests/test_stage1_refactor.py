import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "tests" / "fixtures" / "stage1"))

import generate_stage1_goldens as fixtures  # noqa: E402
from aristotle_pipeline import (  # noqa: E402
    stage1_archive,
    stage1_chapters,
    stage1_english,
    stage1_greek,
    stage1_ostwald,
    stage1_perseus,
    stage1_ross,
)

FIXTURE_DIR = ROOT / "pipeline" / "tests" / "fixtures" / "stage1"


def _json_bytes(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8")


def _golden(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def test_stage1_english_matches_golden(tmp_path):
    path = tmp_path / "english.xml"
    fixtures.write_english_tei(path)
    english = stage1_english.parse_english(path, fixtures.DummyManifest())
    stage1_english.add_bekker_gutter(english, fixtures.spine())
    stage1_english.refine_chapter_lines(english, fixtures.spine())

    assert _json_bytes(english) == _golden("stage1_english_golden.json")
    assert _json_bytes(stage1_english.build_alignment(fixtures.spine(), english)) == _golden(
        "stage1_english_alignment_golden.json"
    )


def test_stage1_perseus_matches_golden(tmp_path):
    path = tmp_path / "perseus.xml"
    fixtures.write_perseus_tei(path)

    assert _json_bytes(
        fixtures.stringify_tuple_keys(stage1_perseus.chapter_prose(path))
    ) == _golden("stage1_perseus_chapter_prose_golden.json")


def test_stage1_chapters_matches_golden(tmp_path):
    path = tmp_path / "chapters.xml"
    fixtures.write_chapter_tei(path)

    assert _json_bytes(
        stage1_chapters.extract_chapters_grc(fixtures.spine(), str(path))
    ) == _golden("stage1_chapters_grc_golden.json")
    assert _json_bytes(
        stage1_chapters.extract_chapters_explicit(
            fixtures.spine(),
            [{"n": 1, "bekker": "1094a1"}, {"n": 2, "bekker": "1094b1", "title": "Second"}],
        )
    ) == _golden("stage1_chapters_explicit_golden.json")


def test_stage1_greek_matches_golden(tmp_path):
    path = tmp_path / "greek.xml"
    fixtures.write_greek_tei(path)

    assert _json_bytes(stage1_greek.parse_spine(path, fixtures.DummyManifest())) == _golden(
        "stage1_greek_spine_golden.json"
    )


def test_stage1_ross_matches_golden(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    fixtures.write_archive_book(archive_dir / "book-01.html")

    prose = stage1_ross.parse_translation(archive_dir, 1, "number")
    assert _json_bytes(fixtures.stringify_tuple_keys(prose)) == _golden(
        "stage1_ross_translation_golden.json"
    )
    assert _json_bytes(stage1_ross.build_chunks(fixtures.spine(), fixtures.chapters(), prose)) == _golden(
        "stage1_ross_chunks_golden.json"
    )


def test_stage1_archive_matches_golden(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    fixtures.write_archive_book(archive_dir / "book-01.html")

    old_sources = stage1_archive.SOURCES_DIR
    try:
        stage1_archive.SOURCES_DIR = tmp_path
        archive_eng = stage1_archive.build_english(
            fixtures.DummyManifest(),
            fixtures.spine(),
            fixtures.chapters(),
            {"dir": "archive", "books": 1, "chapter_marker": "number", "name": "Archive Fixture"},
        )
    finally:
        stage1_archive.SOURCES_DIR = old_sources

    assert _json_bytes(archive_eng) == _golden("stage1_archive_english_golden.json")


def test_stage1_ostwald_matches_golden(tmp_path):
    path = tmp_path / "ostwald.md"
    fixtures.write_ostwald(path)
    prose, align, footnotes, counts = stage1_ostwald.parse_ostwald(path)

    assert _json_bytes(
        {
            "prose": fixtures.stringify_tuple_keys(prose),
            "align": align,
            "footnotes": footnotes,
            "counts": counts,
        }
    ) == _golden("stage1_ostwald_parse_golden.json")
