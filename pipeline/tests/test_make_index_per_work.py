"""make_index builds a work's combined gloss map from that work's per-book maps
only. Works sharing a translator share alignment-results/<vid>/ (Forster: DM,
Mech, Oec, Vent; ross: EN, Meta, Juv, Long), so per-book maps live under
maps/<WORK>/; the flat maps/ let each work's book-01 overwrite the last and fed
every work's books into each combined map."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]


def make_index(tmp: Path, work: str, vid: str):
    tools = tmp / "pipeline" / "tools"
    tools.mkdir(parents=True, exist_ok=True)
    shutil.copy(PIPELINE / "tools" / "make_index.py", tools)
    pkg = tmp / "pipeline" / "aristotle_pipeline"
    if not pkg.exists():
        pkg.symlink_to(PIPELINE / "aristotle_pipeline")   # config resolves to the real repo
    return subprocess.run([sys.executable, str(tools / "make_index.py"), work, vid],
                          capture_output=True, text=True)


def book_map(citation: str) -> dict:
    return {"1:1": {"ross_len": 10, "anchors": [
        {"citation": citation, "offset": 0, "tier": "column", "confidence": "confirmed"}]}}


def test_combined_map_holds_only_its_own_work(tmp_path):
    res = tmp_path / "alignment-results" / "forster"
    for work, cite in (("DM", "391a1"), ("Mech", "847a11")):
        (res / "maps" / work).mkdir(parents=True)
        (res / "maps" / work / "book-01.json").write_text(json.dumps(book_map(cite)))
    r = make_index(tmp_path, "Mech", "forster")
    assert r.returncode == 0, r.stderr
    combined = json.loads((res / "Mech_forster_gloss_map.json").read_text())
    assert combined == book_map("847a11")
    assert (res / "review" / "Mech" / "index.html").exists()


def test_no_maps_for_the_work_fails_and_writes_nothing(tmp_path):
    res = tmp_path / "alignment-results" / "forster"
    (res / "maps" / "DM").mkdir(parents=True)
    (res / "maps" / "DM" / "book-01.json").write_text(json.dumps(book_map("391a1")))
    r = make_index(tmp_path, "Mech", "forster")
    assert r.returncode != 0
    assert not (res / "Mech_forster_gloss_map.json").exists()


def test_maps_missing_a_book_of_the_combined_map_fail_and_keep_it(tmp_path):
    # Codex: persist one book of a work whose other books sit elsewhere, and
    # make_index would cut the shipped combined map down to that one book.
    res = tmp_path / "alignment-results" / "jowett"
    (res / "maps" / "Pol").mkdir(parents=True)
    (res / "maps" / "Pol" / "book-01.json").write_text(json.dumps(book_map("1252a1")))
    two_books = {**book_map("1252a1"), "2:1": book_map("1260b27")["1:1"]}
    shipped = res / "Pol_jowett_gloss_map.json"
    shipped.write_text(json.dumps(two_books))
    r = make_index(tmp_path, "Pol", "jowett")
    assert r.returncode != 0
    assert json.loads(shipped.read_text()) == two_books
