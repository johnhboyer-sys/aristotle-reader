"""A work whose Greek is not in the TLG export reads a vendored verse-mode file.

De Plantis (Bekker 815a-830b) is a Byzantine retranslation that the TLG
Aristotle export does not carry. Its spine is `work.greek_lines`, a file under
sources/ in the same <div type="Bekker-page"><l n=...> shape as a Diogenes
export, so parse_spine reads it unchanged and Diogenes is never run.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aristotle_pipeline import stage1_greek
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
    monkeypatch.setattr(stage1_greek, "run_export",
                        lambda m: pytest.fail("Diogenes export must not run"))
    m = _manifest(tmp_path, "tst/lines.xml")
    path = stage1_greek.spine_xml(m)
    assert path == tmp_path / "tst" / "lines.xml"
    spine = stage1_greek.parse_spine(path, m)
    assert [l["text"] for l in spine["segments"][0]["lines"]] == ["ἀρχὴ λόγου", "τέλος"]


def test_a_missing_vendored_file_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(stage1_greek, "SOURCES_DIR", tmp_path)
    with pytest.raises(FileNotFoundError):
        stage1_greek.spine_xml(_manifest(tmp_path, "tst/absent.xml"))


def test_without_the_key_the_export_runs(tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(stage1_greek, "run_export", lambda m: called.append(m) or tmp_path / "x.xml")
    stage1_greek.spine_xml(_manifest(tmp_path, None))
    assert called
