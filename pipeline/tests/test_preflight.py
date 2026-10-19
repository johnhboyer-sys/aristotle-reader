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


def test_preflight_rejects_data_emitted_from_a_different_manifest(tmp_path):
    """Meta-public.yaml and Pol-public.yaml swap the PRIMARY translation
    (Tredennick/Rackham → Ross/Jowett). The public-gating check only compares
    the secondary/third/overlay slots, so a data dir built from the private
    manifest — Loeb prose in every book and in the search index — used to pass
    preflight against the public one. The emitted manifest.json names the
    translation it was built with; it has to be the one the selected manifest
    names."""
    import json
    import shutil

    case = tmp_path / "case"
    shutil.copytree(FIXTURES / "valid", case)
    emitted = case / "data" / "VAL" / "manifest.json"
    doc = json.loads(emitted.read_text(encoding="utf-8"))
    doc["work"]["english_translation"] = "Hugh Tredennick (Loeb, 1933)"
    emitted.write_text(json.dumps(doc), encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-m", "aristotle_pipeline.preflight",
         str(case / "data"), str(case / "manifests")],
        cwd=ROOT / "pipeline", text=True, capture_output=True, check=False,
    )
    assert result.returncode != 0
    assert "emitted from a different manifest" in result.stdout
    assert "Hugh Tredennick (Loeb, 1933)" in result.stdout


def _bounds_case(tmp_path, chapter_bounds):
    """The valid fixture with a search/offsets.json carrying `chapter_bounds`
    (None: no offsets.json at all), checked by the chapter-bounds gate alone."""
    import json
    import shutil

    from aristotle_pipeline import preflight

    case = tmp_path / "case"
    shutil.copytree(FIXTURES / "valid", case)
    offsets = case / "data" / "VAL" / "search" / "offsets.json"
    if chapter_bounds is None:
        offsets.unlink()
    else:
        offsets.write_text(json.dumps({"chapter_bounds": chapter_bounds}), encoding="utf-8")
    manifests = [preflight.WorkManifest(work_id="VAL", path=Path("VAL.yaml"), data={})]
    problems = []
    examined = preflight._validate_chapter_bounds(case / "data", manifests, problems)
    return examined, problems


def test_chapter_bounds_agreeing_with_chapters_json_pass(tmp_path):
    examined, problems = _bounds_case(
        tmp_path, [{"book": 1, "chapter": "1", "start": 0, "accuracy": "exact"}])
    assert (examined, problems) == (1, [])


def test_chapter_bounds_missing_a_chapter_are_reported(tmp_path):
    """The search pager lays results out by chapter_bounds: a work whose
    offsets.json lost chapters (the Isagoge kept 1 of 17) pages as one unit."""
    examined, problems = _bounds_case(tmp_path, [])
    assert examined == 1
    assert problems == [("VAL", "search/offsets.json",
                         "chapter_bounds has 0 chapter(s) but chapters.json has 1; "
                         "first missing: book 1 chapter '1'")]


def test_chapter_bounds_without_offsets_json_are_reported(tmp_path):
    examined, problems = _bounds_case(tmp_path, None)
    assert examined == 0
    assert ("VAL", "search/offsets.json", "missing: no chapter_bounds to check") in problems


def test_chapter_bounds_gate_says_when_it_examined_no_work(tmp_path):
    from aristotle_pipeline import preflight

    problems = []
    assert preflight._validate_chapter_bounds(tmp_path, [], problems) == 0
    assert problems == [("-", "search/offsets.json",
                         "examined no work: no chapter_bounds were compared, "
                         "so this check is not running")]
