"""The guard on the committed Greek (corpus/greek/).

Two promises. The build needs nothing but these files for a work's Greek, so
each work has one and stage 1 never runs Diogenes. And the files hold lines of
Greek and nothing of the TLG's own: no beta code, no Diogenes XML. The check
(greek_lines.forbidden) has its planted failing cases in test_greek_lines.py;
here it runs over the files themselves, and says how many it read.
"""

from __future__ import annotations

import re
import subprocess

import pytest
import yaml

from aristotle_pipeline import extract, greek_lines, stage1_greek
from aristotle_pipeline.config import REPO_ROOT, Manifest

WORKS = sorted(p.stem for p in (REPO_ROOT / "manifests").glob("*.yaml") if not p.stem.endswith("-public"))
VENDORED = [w for w in WORKS
            if any(yaml.safe_load((REPO_ROOT / "manifests" / f"{w}.yaml").read_text(encoding="utf-8"))["work"].get(k)
                   for k in ("greek_lines", "spine_tei"))]
EXTRACTED = [w for w in WORKS if w not in VENDORED]


def test_the_guard_has_something_to_guard():
    # A check that examined nothing has not passed.
    assert len(EXTRACTED) >= 45 and VENDORED, (len(EXTRACTED), VENDORED)


def test_the_folder_holds_one_file_per_work_and_nothing_else():
    have = sorted(p.name for p in greek_lines.CORPUS_DIR.iterdir())
    assert have == sorted(["README.md", *(f"{w}.tsv" for w in EXTRACTED)])
    assert all(p.is_file() and not p.is_symlink() for p in greek_lines.CORPUS_DIR.iterdir())


def test_the_readme_is_short_and_holds_no_markup():
    # The one file here the character rule cannot cover: it is English prose.
    # This holds it to a page (no export fits in 4 KB) and to no XML; that its
    # words are what they should be is for whoever reviews a change to it.
    readme = (greek_lines.CORPUS_DIR / "README.md").read_text(encoding="utf-8")
    assert 500 < len(readme.encode("utf-8")) < 4096, "the README has grown; nothing but a short page belongs there"
    assert not re.search(r"<\?xml|<TEI|<div|<l[ >]|</|xmlns", readme)
    assert "TLG" not in readme and "Diogenes" not in readme


@pytest.mark.parametrize("work", EXTRACTED)
def test_each_file_is_lines_of_greek_under_its_own_heading(work):
    manifest = Manifest.for_work(work)
    path = greek_lines.corpus_path(manifest)
    text = path.read_text(encoding="utf-8")
    assert greek_lines.forbidden(text) == []
    rows = greek_lines.parse_tsv(text, greek_lines.levels_for(manifest), path.name)
    assert len(rows) >= 50, f"{work}: only {len(rows)} lines"
    head = text.split("\n")[:2]
    assert head == [f"# work: {work}", "# edition: " + " ".join(manifest.data["work"]["greek_edition"].split())]
    # The licence page names editions; these files do the same and never name
    # the disc the text was read from.
    assert "TLG" not in text and "Thesaurus Linguae" not in text and "Diogenes" not in text


def test_the_whole_corpus_was_read():
    lines = sum(len(greek_lines.load(greek_lines.corpus_path(Manifest.for_work(w)),
                                     greek_lines.levels_for(Manifest.for_work(w)))) for w in EXTRACTED)
    assert lines > 100_000, lines


def test_stage_1_stops_on_a_missing_line_file_and_does_not_run_diogenes(tmp_path, monkeypatch):
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", tmp_path)
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("the build ran a program"))
    with pytest.raises(FileNotFoundError, match="aristotle_pipeline.extract --work EN"):
        stage1_greek.run(Manifest.for_work("EN"))
    # and it has no way to: the export call lives in extract alone
    assert not hasattr(stage1_greek, "subprocess") and not hasattr(stage1_greek, "run_export")


def test_the_export_folder_cannot_be_committed():
    # extract writes the Diogenes XML under build/export; git must ignore it.
    r = subprocess.run(["git", "check-ignore", "-q", str(extract.EXPORT_DIR / "Diogenes-Resources" / "xml" / "tlg" / "tlg0086010.xml")],
                       cwd=REPO_ROOT)
    assert r.returncode == 0, "build/export is not git-ignored"
    tracked = subprocess.run(["git", "ls-files", "build", "*Diogenes-Resources*"], cwd=REPO_ROOT, capture_output=True, text=True)
    assert tracked.returncode == 0, tracked.stderr
    assert tracked.stdout == "", tracked.stdout[:400]
    # and git did answer: the same question about a folder it does track
    assert subprocess.run(["git", "ls-files", "manifests"], cwd=REPO_ROOT, capture_output=True, text=True).stdout


def test_extract_refuses_to_write_a_file_the_guard_would_fail(tmp_path, monkeypatch):
    xml = tmp_path / "x.xml"
    xml.write_text('<TEI><body><div type="Bekker-page" n="1a"><l n="1">mh=nin a)/eide qea/</l></div></body></TEI>', encoding="utf-8")
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", tmp_path / "out")
    monkeypatch.setattr(extract, "ensure_export", lambda m: xml)
    with pytest.raises(ValueError, match="refusing"):
        extract.main(["--work", "EN"])
    assert not (tmp_path / "out").exists()


def _export(tmp_path, lines: int):
    xml = tmp_path / f"x{lines}.xml"
    xml.write_text('<TEI><body><div type="Bekker-page" n="1094a">'
                   + "".join(f'<l n="{n}">λόγος</l>' for n in range(1, lines + 1)) + "</div></body></TEI>", encoding="utf-8")
    return xml


def test_extract_will_not_replace_a_file_with_a_shorter_one_unless_told(tmp_path, monkeypatch):
    out = tmp_path / "out"
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", out)
    monkeypatch.setattr(extract, "ensure_export", lambda m: _export(tmp_path, 3))
    assert extract.main(["--work", "EN"]) == 0
    full = (out / "EN.tsv").read_text(encoding="utf-8")
    # the export comes back cut short: well formed, and two lines gone
    monkeypatch.setattr(extract, "ensure_export", lambda m: _export(tmp_path, 1))
    assert extract.main(["--work", "EN"]) == 1
    assert (out / "EN.tsv").read_text(encoding="utf-8") == full
    assert extract.main(["--work", "EN", "--allow-fewer-lines"]) == 0
    assert len((out / "EN.tsv").read_text(encoding="utf-8").split("\n")) == 3 + 1 + 1


def test_a_run_that_fails_at_one_work_writes_none(tmp_path, monkeypatch):
    out = tmp_path / "out"
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", out)

    def line_file(manifest, fail="Top"):
        if manifest.work_id == fail:
            raise RuntimeError("Diogenes export failed")
        return "# work: X\n", 1
    monkeypatch.setattr(extract, "line_file", line_file)
    with pytest.raises(RuntimeError):
        extract.main(["--all"])
    assert not out.exists() or list(out.iterdir()) == []
    # the same run with no failure does write, so the emptiness above is the refusal's doing
    monkeypatch.setattr(extract, "line_file", lambda m: line_file(m, fail=None))
    assert extract.main(["--all"]) == 0
    assert len(list(out.iterdir())) == len(WORKS)


def test_a_write_that_fails_part_way_leaves_every_old_file_as_it_was(tmp_path, monkeypatch):
    out = tmp_path / "out"
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", out)
    monkeypatch.setattr(extract, "line_file", lambda m: (f"# work: {m.work_id} old\n", 1))
    assert extract.main(["--all"]) == 0
    before = {p.name: p.read_text(encoding="utf-8") for p in out.iterdir()}
    assert len(before) == len(WORKS) and "Top.tsv" in before
    # every file is made and checked; then the disk refuses one of the later ones
    (out / "Top.tsv.tmp").mkdir()
    monkeypatch.setattr(extract, "line_file", lambda m: (f"# work: {m.work_id} new\n", 1))
    with pytest.raises(OSError):
        extract.main(["--all", "--allow-fewer-lines"])     # the toy files are not line files to count
    (out / "Top.tsv.tmp").rmdir()
    assert {p.name: p.read_text(encoding="utf-8") for p in out.iterdir()} == before


def test_extract_skips_vendored_works_and_writes_nothing_for_them(tmp_path, monkeypatch):
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", tmp_path / "out")
    monkeypatch.setattr(extract, "ensure_export", lambda m: pytest.fail("looked for an export"))
    assert [extract.line_file(Manifest.for_work(w)) for w in VENDORED] == [None] * len(VENDORED)
    assert extract.main(["--work", VENDORED[0]]) == 1      # wrote nothing: not a pass
