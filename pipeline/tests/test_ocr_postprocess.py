import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "tools"))

import ocr_postprocess


def write(path, text):
    path.write_text(text, encoding="utf-8")


def read(path):
    return path.read_text(encoding="utf-8")


def test_scan_breaks_detects_false_page_boundary(tmp_path, capsys):
    md = tmp_path / "split.md"
    write(md, "The swallow does\n\nnot make a spring.\n")

    status = ocr_postprocess.main(["scan-breaks", str(md)])

    assert status == 1
    out = capsys.readouterr().out
    assert "1 3 | The swallow does | not make a spring." in out


def test_scan_breaks_clean_uppercase_paragraph_is_zero(tmp_path, capsys):
    md = tmp_path / "clean.md"
    write(md, "The argument ends here.\n\nNew paragraph begins here.\n")

    status = ocr_postprocess.main(["scan-breaks", str(md)])

    assert status == 0
    assert capsys.readouterr().out == ""


def test_scan_breaks_fix_removes_false_break_blank_line(tmp_path):
    md = tmp_path / "split.md"
    write(md, "The swallow does\n\nnot make a spring.\n")

    status = ocr_postprocess.main(["scan-breaks", "--fix", str(md)])

    assert status == 1
    assert read(md) == "The swallow does\nnot make a spring.\n"


def test_relocate_footnotes_detects_duplicates_renumbers_and_reports_undefined(
    tmp_path, capsys
):
    md = tmp_path / "notes.md"
    write(
        md,
        "\n".join(
            [
                "Chapter one has a note.[^1]",
                "",
                "[^1]: First chapter note.",
                "",
                "Chapter two resets note numbering.[^1] It also has a missing note.[^3]",
                "",
                "[^1]: Second chapter note.",
                "",
            ]
        ),
    )

    status = ocr_postprocess.main(["relocate-footnotes", "--fix", str(md)])

    assert status == 1
    out = capsys.readouterr().out
    assert "duplicate keys: [^1]" in out
    assert "renumbered duplicate [^1]" in out
    assert "references with no definition: [^3]" in out
    text = read(md)
    assert "Chapter one has a note.[^1]" in text
    assert "Chapter two resets note numbering.[^101]" in text
    assert "[^1]: First chapter note." in text
    assert "[^101]: Second chapter note." in text
    assert text.index("## Footnotes") > text.index("Chapter two resets")


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_validate_reports_undefined_reference(tmp_path, capsys):
    md = tmp_path / "bad.md"
    write(md, "Body has a missing note.[^9]\n")

    status = ocr_postprocess.main(["validate", str(md)])

    assert status == 1
    assert "references with no definition: [^9]" in capsys.readouterr().out
