import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "pipeline" / "tests" / "fixtures" / "preflight"


def _run_preflight(name: str) -> subprocess.CompletedProcess[str]:
    fixture = FIXTURES / name
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "aristotle_pipeline.preflight",
            str(fixture / "data"),
            str(fixture / "manifests"),
        ],
        cwd=ROOT / "pipeline",
        text=True,
        capture_output=True,
        check=False,
    )


def test_preflight_valid_fixture_passes():
    result = _run_preflight("valid")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "preflight ok:" in result.stdout


def test_preflight_broken_fixture_reports_bekker_order_and_dangling_reference():
    result = _run_preflight("broken")

    assert result.returncode != 0
    output = result.stdout + result.stderr
    assert "Greek Bekker lines are out of order" in output
    assert "chapter '1' has dangling Bekker anchor 1094a5" in output


def _write_footnote_case(tmp_path, notes, prose_marker, titles=None):
    """A minimal valid work, plus a footnotes.json to exercise the reachability
    check: every note must be openable from the page, and every marker must
    resolve."""
    import json
    import shutil

    src = FIXTURES / "valid"
    case = tmp_path / "case"
    shutil.copytree(src, case)
    work = case / "data" / "VAL"
    book = json.loads((work / "book-01.json").read_text())
    seg = book["segments"][0]
    seg["english"]["text"] = f"Some prose{prose_marker} and more."
    (work / "book-01.json").write_text(json.dumps(book))
    (work / "footnotes.json").write_text(json.dumps(notes))
    if titles is not None:
        (work / "third-titles.json").write_text(json.dumps(titles))
    return subprocess.run(
        [sys.executable, "-m", "aristotle_pipeline.preflight",
         str(case / "data"), str(case / "manifests")],
        cwd=ROOT / "pipeline", text=True, capture_output=True, check=False,
    )


def test_preflight_reports_a_note_nothing_can_open(tmp_path):
    result = _write_footnote_case(tmp_path, {"1": "cited", "2": "orphan"}, "[^1]")

    assert result.returncode != 0
    assert "note 2 is never cited" in result.stdout


def test_preflight_reports_a_marker_with_no_note_and_an_empty_note(tmp_path):
    result = _write_footnote_case(tmp_path, {"1": "cited", "2": "   "}, "[^1][^9]")

    assert result.returncode != 0
    assert "note 9 is cited in the prose but has no definition" in result.stdout
    assert "note 2 is empty" in result.stdout


def test_preflight_counts_a_chapter_title_as_a_citation(tmp_path):
    # Ostwald hangs six notes off his chapter headings; the reader renders the
    # marker there, so a title citation must satisfy the check.
    result = _write_footnote_case(
        tmp_path, {"1": "cited", "2": "hung on a heading"}, "[^1]",
        titles={"ostwald": {"1": {"1": "A Chapter Title[^2]"}}},
    )

    assert result.returncode == 0, result.stdout + result.stderr
