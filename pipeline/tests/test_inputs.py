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


# --- fetch: the public copy of the two files -------------------------------

import zipfile


def _archive(path: Path, members: dict, links: dict | None = None, twice: tuple = ()) -> dict:
    """A zip at `path`; returns the pin that matches it."""
    import warnings
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in members.items():
            z.writestr(name, body)
            if name in twice:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    z.writestr(name, body)
        for name, target in (links or {}).items():
            info = zipfile.ZipInfo(name)
            info.external_attr = 0o120777 << 16
            z.writestr(info, target)
    body = path.read_bytes()
    return {"url": path.as_uri(), "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body), "folder": "usr/data"}


@pytest.fixture
def public(folder, tmp_path, monkeypatch):
    """`folder`'s two files packed as the public archive, and an empty folder
    to fetch into."""
    members = {f"usr/data/{name}": (folder / name).read_bytes() for name in inputs.PINNED}
    members["usr/data/other.txt"] = b"not wanted\n"
    src = tmp_path / "src"
    src.mkdir()
    monkeypatch.setattr(inputs, "ARCHIVE", _archive(src / "release.zip", members))
    dest = tmp_path / "dest"
    return {"dest": dest, "src": src, "members": members}


def _nothing_written(dest: Path) -> bool:
    """A failed fetch leaves no file, and not the folder it made either."""
    return not dest.exists()


def test_fetch_refuses_an_archive_that_is_not_the_pinned_one(public, monkeypatch):
    monkeypatch.setitem(inputs.ARCHIVE, "sha256", "0" * 64)
    problems = inputs.fetch(public["dest"])
    assert any("sha256" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_stops_at_the_pinned_length(public, monkeypatch):
    monkeypatch.setitem(inputs.ARCHIVE, "bytes", inputs.ARCHIVE["bytes"] - 1)
    problems = inputs.fetch(public["dest"])
    assert any("bytes" in p for p in problems) and _nothing_written(public["dest"])
    monkeypatch.setitem(inputs.ARCHIVE, "bytes", inputs.ARCHIVE["bytes"] + 2)
    problems = inputs.fetch(public["dest"])
    assert any("bytes" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_fails_when_the_archive_lacks_a_file_and_leaves_neither(public, monkeypatch):
    members = dict(public["members"])
    del members["usr/data/grc.lsj.xml"]
    monkeypatch.setattr(inputs, "ARCHIVE", _archive(public["src"] / "short.zip", members))
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "not in the archive" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_fails_on_a_file_that_is_not_the_pinned_one_and_leaves_neither(public, monkeypatch):
    members = dict(public["members"])
    same_length = bytes(reversed(members["usr/data/grc.lsj.xml"]))
    members["usr/data/grc.lsj.xml"] = same_length
    monkeypatch.setattr(inputs, "ARCHIVE", _archive(public["src"] / "changed.zip", members))
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "sha256" in p for p in problems) and _nothing_written(public["dest"])
    members["usr/data/grc.lsj.xml"] = b"short"
    monkeypatch.setattr(inputs, "ARCHIVE", _archive(public["src"] / "shorter.zip", members))
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "bytes" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_refuses_a_link_in_place_of_a_file(public, monkeypatch):
    members = dict(public["members"])
    del members["usr/data/grc.lsj.xml"]
    pin = _archive(public["src"] / "link.zip", members, links={"usr/data/grc.lsj.xml": "/etc/passwd"})
    monkeypatch.setattr(inputs, "ARCHIVE", pin)
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "not a plain file" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_refuses_a_file_that_is_in_the_archive_twice(public, monkeypatch):
    pin = _archive(public["src"] / "twice.zip", public["members"], twice=("usr/data/grc.lsj.xml",))
    monkeypatch.setattr(inputs, "ARCHIVE", pin)
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "2 times" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_does_not_write_over_a_file_and_does_not_download_to_find_out(public, monkeypatch):
    public["dest"].mkdir()
    (public["dest"] / "grc.lsj.xml").write_bytes(b"someone's other LSJ\n")
    monkeypatch.setitem(inputs.ARCHIVE, "url", (public["src"] / "absent.zip").as_uri())
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "already" in p for p in problems)
    assert (public["dest"] / "grc.lsj.xml").read_bytes() == b"someone's other LSJ\n"
    assert [p.name for p in public["dest"].iterdir()] == ["grc.lsj.xml"]


def _appears_during_the_download(monkeypatch, path: Path, body: bytes):
    """Have `path` come into being after the pre-check, while fetch works."""
    real = inputs._unpack

    def unpack(archive, into):
        problems = real(archive, into)
        path.write_bytes(body)
        return problems
    monkeypatch.setattr(inputs, "_unpack", unpack)


def test_fetch_does_not_write_over_a_file_that_appears_while_it_works_and_leaves_no_half(public, monkeypatch):
    # The second file to be placed is the one that appears, so the first has
    # already been placed and must be taken back.
    first, second = list(inputs.PINNED)
    public["dest"].mkdir()
    _appears_during_the_download(monkeypatch, public["dest"] / second, b"someone else's\n")
    problems = inputs.fetch(public["dest"])
    assert problems and (public["dest"] / second).read_bytes() == b"someone else's\n"
    assert [p.name for p in public["dest"].iterdir()] == [second]


def test_fetch_refuses_a_dangling_link_where_a_file_would_go(public, monkeypatch):
    public["dest"].mkdir()
    link = public["dest"] / "grc.lsj.xml"
    link.symlink_to(public["dest"] / "nowhere")
    monkeypatch.setitem(inputs.ARCHIVE, "url", (public["src"] / "absent.zip").as_uri())
    problems = inputs.fetch(public["dest"])
    assert any("grc.lsj.xml" in p and "already" in p for p in problems)
    assert link.is_symlink() and [p.name for p in public["dest"].iterdir()] == ["grc.lsj.xml"]


def test_fetch_makes_one_folder_and_not_a_path_of_them(public):
    deep = public["dest"] / "a" / "b"
    problems = inputs.fetch(deep)
    assert problems and not public["dest"].exists()


def test_fetch_leaves_no_folder_when_it_cannot_make_its_work_folder(public, monkeypatch):
    def full(*args, **kwargs):
        raise OSError(28, "No space left on device")
    monkeypatch.setattr(inputs.tempfile, "mkdtemp", full)
    problems = inputs.fetch(public["dest"])
    assert any("No space left" in p for p in problems) and _nothing_written(public["dest"])


def test_fetch_stops_reading_at_the_first_block_past_the_pinned_length(public, monkeypatch):
    class Endless:
        blocks = 0

        def read(self, n):
            Endless.blocks += 1
            if Endless.blocks > 2:
                raise RuntimeError("read on after the pinned length was passed")
            return b"x" * n

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setitem(inputs.ARCHIVE, "bytes", 10)
    monkeypatch.setattr(inputs.urllib.request, "urlopen", lambda *a, **k: Endless())
    problems = inputs.fetch(public["dest"])
    assert any("bytes" in p for p in problems) and _nothing_written(public["dest"]) and Endless.blocks == 1


def test_fetch_never_falls_back_to_the_folder_a_manifest_names(public, monkeypatch, capsys):
    monkeypatch.delenv(inputs.ENV, raising=False)
    assert inputs.main(["fetch"]) == 2
    assert "--dir" in capsys.readouterr().out
    assert _nothing_written(public["dest"])


def test_fetch_writes_both_files_checks_them_and_keeps_nothing_else(public, capsys):
    assert inputs.main(["fetch", "--dir", str(public["dest"])]) == 0
    out = capsys.readouterr().out
    assert "2 of 2 files match" in out and "fetched" in out
    assert sorted(p.name for p in public["dest"].iterdir()) == sorted(inputs.PINNED)
    assert inputs.check(public["dest"]) == ([], 2)


def test_fetch_of_a_folder_that_already_passes_downloads_nothing(folder, public, monkeypatch, capsys):
    monkeypatch.setitem(inputs.ARCHIVE, "url", (public["src"] / "absent.zip").as_uri())
    assert inputs.main(["fetch", "--dir", str(folder)]) == 0
    assert "already" in capsys.readouterr().out


def test_fetch_reads_the_folder_from_the_environment(public, monkeypatch):
    monkeypatch.setenv(inputs.ENV, str(public["dest"]))
    assert inputs.main(["fetch"]) == 0
    assert inputs.check(public["dest"]) == ([], 2)


def test_the_archive_pin_is_whole():
    assert inputs.ARCHIVE["url"].startswith("https://") and len(inputs.ARCHIVE["sha256"]) == 64
    assert inputs.ARCHIVE["bytes"] > 100_000_000 and inputs.ARCHIVE["folder"]
