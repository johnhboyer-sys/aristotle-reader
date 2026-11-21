"""A work whose Greek is vendored reads its file under sources/.

De Plantis (Bekker 815a-830b) is a Byzantine retranslation that none of the
corpus's editions carries. Its spine is `work.greek_lines`, a file under
sources/ in the <div type="Bekker-page"><l n=...> shape. Every other work reads
its committed line file (corpus/greek/); nothing here runs a program.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from aristotle_pipeline import greek_lines, stage1_greek
from aristotle_pipeline.config import Manifest

XML = """<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
<div type="Bekker-page" n="1a"><l n="1">ἀρχὴ λόγου</l><l n="2">τέλος</l></div>
</body></text></TEI>"""


def _manifest(tmp_path: Path, lines: str | None) -> Manifest:
    work = {"id": "TST", "tlg_author": "9999", "tlg_work": "999", "greek_edition": "test"}
    if lines:
        work["greek_lines"] = lines
    return Manifest({"work": work, "books": [{"n": 1, "start": "1a1", "end": "1a2"}]},
                    tmp_path / "TST.yaml")


def test_vendored_lines_are_the_spine(tmp_path, monkeypatch):
    (tmp_path / "tst").mkdir()
    (tmp_path / "tst" / "lines.xml").write_text(XML, encoding="utf-8")
    monkeypatch.setattr(stage1_greek, "SOURCES_DIR", tmp_path)
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("no program may run"))
    m = _manifest(tmp_path, "tst/lines.xml")
    path = stage1_greek.spine_source(m)
    assert path == tmp_path / "tst" / "lines.xml"
    spine = stage1_greek.parse_spine(path, m)
    assert [l["text"] for l in spine["segments"][0]["lines"]] == ["ἀρχὴ λόγου", "τέλος"]


def test_a_missing_vendored_file_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(stage1_greek, "SOURCES_DIR", tmp_path)
    with pytest.raises(FileNotFoundError, match="greek_lines"):
        stage1_greek.spine_source(_manifest(tmp_path, "tst/absent.xml"))


def test_without_the_key_the_committed_line_file_is_the_spine(tmp_path, monkeypatch):
    monkeypatch.setattr(greek_lines, "CORPUS_DIR", tmp_path)
    m = _manifest(tmp_path, None)
    with pytest.raises(FileNotFoundError, match="extract --work TST"):
        stage1_greek.spine_source(m)
    rows = [greek_lines.Row(("1a",), "1", "ἀρχὴ λόγου"), greek_lines.Row(("1a",), "2", "τέλος")]
    (tmp_path / "TST.tsv").write_text(greek_lines.format_tsv(rows, ("Bekker-page",), "TST", "test"), encoding="utf-8")
    path = stage1_greek.spine_source(m)
    assert path == tmp_path / "TST.tsv"
    spine = stage1_greek.parse_spine(path, m)
    assert [l["text"] for l in spine["segments"][0]["lines"]] == ["ἀρχὴ λόγου", "τέλος"]
