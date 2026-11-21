"""The build's two outside inputs (aristotle_pipeline.inputs): the Morpheus
table and the LSJ. The failing cases come first."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from aristotle_pipeline import inputs
from aristotle_pipeline.config import Manifest


@pytest.fixture
def folder(tmp_path, monkeypatch):
    bodies = {"greek-analyses.txt": b"lu/w\t{...}\n", "grc.lsj.xml": b"<div2/>\n"}
    monkeypatch.setattr(inputs, "PINNED", {
        name: {"sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)} for name, body in bodies.items()})
    for name, body in bodies.items():
        (tmp_path / name).write_bytes(body)
    return tmp_path


def test_a_missing_file_fails_and_is_named(folder):
    (folder / "grc.lsj.xml").unlink()
    problems, matched = inputs.check(folder)
    assert matched == 1 and any("grc.lsj.xml is missing" in p for p in problems)


def test_a_changed_byte_fails_and_a_changed_length_fails_before_hashing(folder):
    (folder / "greek-analyses.txt").write_bytes(b"lu/w\t{..,}\n")        # same length
    problems, matched = inputs.check(folder)
    assert matched == 1 and any("greek-analyses.txt" in p and "sha256" in p for p in problems)
    (folder / "greek-analyses.txt").write_bytes(b"short")
    problems, matched = inputs.check(folder)
    assert matched == 1 and any("greek-analyses.txt" in p and "bytes" in p for p in problems)


def test_a_folder_that_is_not_there_fails_and_nothing_pinned_is_not_a_pass(folder, monkeypatch):
    problems, matched = inputs.check(folder / "absent")
    assert matched == 0 and len(problems) == 2
    monkeypatch.setattr(inputs, "PINNED", {})
    problems, matched = inputs.check(folder)
    assert matched == 0 and any("examined nothing" in p for p in problems)


def test_the_count_is_of_files_and_not_of_words_in_the_messages(folder, capsys):
    # a folder whose own name holds "bytes" and "sha256"
    assert inputs.main(["check", "--dir", str(folder / "bytes-sha256-missing")]) == 1
    assert "0 of 2 files match" in capsys.readouterr().out
    (folder / "grc.lsj.xml").unlink()
    assert inputs.main(["check", "--dir", str(folder)]) == 1
    assert "1 of 2 files match" in capsys.readouterr().out


def test_the_right_files_pass_and_the_command_says_what_it_read(folder, capsys):
    assert inputs.check(folder) == ([], 2)
    assert inputs.main(["check", "--dir", str(folder)]) == 0
    assert "2 of 2 files match" in capsys.readouterr().out
    (folder / "grc.lsj.xml").write_bytes(b"<div3/>\n")
    assert inputs.main(["check", "--dir", str(folder)]) == 1
    assert "FAIL" in capsys.readouterr().out


def test_the_environment_names_the_folder_and_the_manifest_is_only_the_default(monkeypatch, tmp_path):
    manifest = Manifest.for_work("EN")
    monkeypatch.delenv(inputs.ENV, raising=False)
    assert manifest.diogenes_data() == Path(manifest.data["sources"]["diogenes_data"])
    monkeypatch.setenv(inputs.ENV, str(tmp_path))
    assert manifest.diogenes_data() == tmp_path
    assert inputs.folders() == [tmp_path]


def test_every_folder_a_manifest_names_is_checked_not_only_the_first(folder, tmp_path, monkeypatch, capsys):
    # Stages 4 and 5 read from the work's own manifest. One manifest naming
    # another folder, with another table in it, must fail the check.
    from aristotle_pipeline import config
    other = tmp_path / "other"
    other.mkdir()
    for name in inputs.PINNED:
        (other / name).write_bytes(b"another table\n")
    repo = tmp_path / "repo"
    (repo / "manifests").mkdir(parents=True)
    for work, where in (("A", folder), ("B", other)):
        (repo / "manifests" / f"{work}.yaml").write_text(f"work: {{id: {work}}}\nsources: {{diogenes_data: '{where}'}}\n", encoding="utf-8")
    monkeypatch.setattr(config, "REPO_ROOT", repo)
    monkeypatch.delenv(inputs.ENV, raising=False)
    assert inputs.folders() == sorted([folder, other])
    assert inputs.main(["check"]) == 1
    out = capsys.readouterr().out
    assert f"ok   {folder}: 2 of 2" in out and f"FAIL {other}: 0 of 2" in out
    (repo / "manifests" / "B.yaml").unlink()
    assert inputs.main(["check"]) == 0


def test_the_pins_are_whole():
    assert set(inputs.PINNED) == {"greek-analyses.txt", "grc.lsj.xml"}
    for pin in inputs.PINNED.values():
        assert len(pin["sha256"]) == 64 and pin["bytes"] > 100_000_000
