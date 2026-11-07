"""Two manifest hooks the Rhetorica ad Alexandrum needs.

`work.spine_tei`: TLG 0547.001 (Fuhrmann) is lineated by chapter and section,
not by Bekker line, so the work's spine is a TEI relined to Bekker's printed
lines and vendored under sources/; the spine must be read from there and never
fall back to a Diogenes export.

`word` on an explicit chapter: most of its chapters open mid-line, and the
explicit list otherwise places every chapter at its line's first word.

Fuhrmann's deletion braces { } are sigla: stripped from the lookup token and
logged, like [ ].
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aristotle_pipeline import stage1_chapters, stage1_greek, stage3_tokenize
from aristotle_pipeline.config import SOURCES_DIR, Manifest


def _manifest(work: dict) -> Manifest:
    return Manifest({"work": {"id": "T", "tlg_author": "0547", "tlg_work": "001", **work}},
                    Path("t.yaml"))


def test_spine_tei_is_read_from_sources():
    m = _manifest({"spine_tei": "rhetal-greek/rhetal-bekker-grc.xml"})
    assert stage1_greek.exported_xml_path(m) == SOURCES_DIR / "rhetal-greek" / "rhetal-bekker-grc.xml"


def test_without_spine_tei_the_export_is_used():
    assert stage1_greek.exported_xml_path(_manifest({})).name == "tlg0547001.xml"


def test_a_missing_spine_tei_raises_rather_than_exporting(monkeypatch):
    monkeypatch.setattr(stage1_greek.subprocess, "run",
                        lambda *a, **k: pytest.fail("ran the Diogenes export"))
    with pytest.raises(FileNotFoundError, match="spine_tei"):
        stage1_greek.run_export(_manifest({"spine_tei": "no-such-dir/none.xml"}))


SPINE = {"segments": [{"id": "1:1a", "book": 1, "column": "1a",
                       "lines": [{"n": 1, "text": "ἄλφα βῆτα. γάμμα δέλτα"}]}]}


def test_explicit_word_places_the_chapter_in_its_line():
    ch = stage1_chapters.extract_chapters_explicit(
        SPINE, [{"n": 1, "bekker": "1a1"}, {"n": 2, "bekker": "1a1", "word": 2}])
    assert (ch[0]["wordIndex"], ch[0].get("wordAnchor")) == (0, None)
    assert (ch[1]["wordIndex"], ch[1]["wordAnchor"]) == (2, True)


@pytest.mark.parametrize("word", [-1, "2", True, 1.0])
def test_a_bad_word_raises(word):
    with pytest.raises(ValueError, match="bad word"):
        stage1_chapters.extract_chapters_explicit(SPINE, [{"n": 1, "bekker": "1a1", "word": word}])


def test_deletion_braces_are_sigla():
    spine = {"work": "T", "segments": [{"id": "1:1a", "book": 1, "column": "1a", "lines": [
        {"n": 1, "text": "{τὸ παράδειγμα} ἔρρωσο.}"}]}]}
    doc, sigla, fails = stage3_tokenize.tokenize(spine)
    assert [t["t"] for t in doc["segments"][0]["lines"][0]["tokens"]] == ["τὸ", "παράδειγμα", "ἔρρωσο"]
    assert len(sigla) == 3 and not fails
