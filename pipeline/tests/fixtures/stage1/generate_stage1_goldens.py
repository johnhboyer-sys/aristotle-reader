import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline import (  # noqa: E402
    stage1_archive,
    stage1_chapters,
    stage1_english,
    stage1_greek,
    stage1_ostwald,
    stage1_perseus,
    stage1_ross,
)

OUT = Path(__file__).resolve().parent


class DummyManifest:
    work_id = "TST"
    first_column = "1094a"
    data = {
        "work": {
            "id": "TST",
            "english_translation": "Fixture Translation",
            "greek_edition": "Fixture Greek",
        },
        "books": [{"n": 1, "start": "1094a1", "end": "1094b10"}],
    }

    def book_for_line(self, column, line):
        return 1 if column in {"1094a", "1094b"} else None


def write_json(name, obj):
    (OUT / name).write_text(
        json.dumps(obj, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )


def stringify_tuple_keys(obj):
    return {f"{k[0]}:{k[1]}": v for k, v in obj.items()}


def spine():
    return {
        "work": "TST",
        "segments": [
            {
                "id": "1:1094a",
                "book": 1,
                "column": "1094a",
                "lines": [
                    {"n": 1, "text": "Alpha beta."},
                    {"n": 2, "text": "Gamma delta."},
                    {"n": 3, "text": "Epsilon zeta."},
                    {"n": 4, "text": "Eta theta."},
                    {"n": 5, "text": "Iota kappa."},
                ],
            },
            {
                "id": "1:1094b",
                "book": 1,
                "column": "1094b",
                "lines": [
                    {"n": 1, "text": "Lambda mu."},
                    {"n": 2, "text": "Nu xi."},
                    {"n": 3, "text": "Omicron pi."},
                    {"n": 4, "text": "Rho sigma."},
                    {"n": 5, "text": "Tau upsilon."},
                ],
            },
        ],
    }


def chapters():
    return [
        {
            "book": 1,
            "chapter": "1",
            "column": "1094a",
            "line": "1",
            "wordIndex": 0,
            "bookstart": True,
        },
        {
            "book": 1,
            "chapter": "2",
            "column": "1094b",
            "line": "1",
            "wordIndex": 0,
            "bookstart": False,
        },
    ]


def write_english_tei(path):
    path.write_text(
        """<TEI><text><body>
<div subtype="book" n="1">
<milestone resp="Bekker" unit="page" n="1094a"/>
<div subtype="section" n="1"><milestone resp="Bekker" unit="line" n="1"/>
<p>First <note>translator note</note> paragraph.</p>
<p>Second paragraph with <milestone resp="Bekker" unit="line" n="5"/> marker.</p>
<div subtype="subsection" n="1"><p>Subsection text.</p></div>
</div>
<milestone resp="Bekker" unit="page" n="1094b"/>
<div subtype="section" n="2"><milestone resp="Bekker" unit="line" n="1"/>
<head>Ignored heading</head><p>Chapter two text.</p></div>
</div>
</body></text></TEI>""",
        encoding="utf-8",
    )


def write_chapter_tei(path):
    path.write_text(
        """<TEI><text><body>
<div subtype="book" n="1">
<milestone unit="page" n="1094a"/><milestone unit="line" n="1"/>
<div subtype="chapter" n="1"><p>Alpha beta. Gamma delta.</p></div>
<milestone unit="page" n="1094b"/><milestone unit="line" n="1"/>
<div subtype="chapter" n="2"><head>Drop me</head><p>Lambda mu. Nu xi.</p></div>
</div>
</body></text></TEI>""",
        encoding="utf-8",
    )


def write_greek_tei(path):
    path.write_text(
        """<TEI><text><body>
<div type="Bekker-page" n="1094a">
<l n="1">Alpha beta-</l>
<l n="2">gamma delta</l>
<l n="3">Heading</l>
<l n="4,5">Epsilon | zeta</l>
</div>
<div type="Bekker-page" n="1094b">
<l n="1">Lambda mu</l>
<l n="2">Nu xi</l>
</div>
</body></text></TEI>""",
        encoding="utf-8",
    )


def write_perseus_tei(path):
    path.write_text(
        """<TEI><text><body>
<div subtype="book" n="1">
<div subtype="chapter" n="1"><head>Drop</head><p>Chapter <note>note</note> one.</p></div>
<div subtype="chapter" n="2"><p>Chapter two.</p></div>
</div>
</body></text></TEI>""",
        encoding="utf-8",
    )


def write_archive_book(path):
    path.write_text(
        """<html><body>
Translated by Example
1
First chapter first sentence.

Second paragraph.
2
Second chapter sentence.
-THE END-
</body></html>""",
        encoding="utf-8",
    )


def write_ostwald(path):
    path.write_text(
        """# BOOK I
## 1. Opening
1094a First words for the chapter. 5 More words.[^1]

Second paragraph starts.
1094b Column b words.
## *2. Next
Next chapter words.

## Footnotes
[^1]: A *rendered* note.
""",
        encoding="utf-8",
    )


def main():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        english_path = tmp / "english.xml"
        write_english_tei(english_path)
        english = stage1_english.parse_english(english_path, DummyManifest())
        stage1_english.add_bekker_gutter(english, spine())
        stage1_english.refine_chapter_lines(english, spine())
        write_json("stage1_english_golden.json", english)
        write_json("stage1_english_alignment_golden.json", stage1_english.build_alignment(spine(), english))

        chapter_path = tmp / "chapters.xml"
        write_chapter_tei(chapter_path)
        write_json(
            "stage1_chapters_grc_golden.json",
            stage1_chapters.extract_chapters_grc(spine(), str(chapter_path)),
        )
        write_json(
            "stage1_chapters_explicit_golden.json",
            stage1_chapters.extract_chapters_explicit(
                spine(),
                [{"n": 1, "bekker": "1094a1"}, {"n": 2, "bekker": "1094b1", "title": "Second"}],
            ),
        )

        greek_path = tmp / "greek.xml"
        write_greek_tei(greek_path)
        write_json("stage1_greek_spine_golden.json", stage1_greek.parse_spine(greek_path, DummyManifest()))

        perseus_path = tmp / "perseus.xml"
        write_perseus_tei(perseus_path)
        write_json(
            "stage1_perseus_chapter_prose_golden.json",
            stringify_tuple_keys(stage1_perseus.chapter_prose(perseus_path)),
        )

        archive_dir = tmp / "archive"
        archive_dir.mkdir()
        write_archive_book(archive_dir / "book-01.html")
        prose = stage1_ross.parse_translation(archive_dir, 1, "number")
        ross_chunks = stage1_ross.build_chunks(spine(), chapters(), prose)
        write_json("stage1_ross_translation_golden.json", stringify_tuple_keys(prose))
        write_json("stage1_ross_chunks_golden.json", ross_chunks)

        old_sources = stage1_archive.SOURCES_DIR
        try:
            stage1_archive.SOURCES_DIR = tmp
            archive_eng = stage1_archive.build_english(
                DummyManifest(),
                spine(),
                chapters(),
                {"dir": "archive", "books": 1, "chapter_marker": "number", "name": "Archive Fixture"},
            )
        finally:
            stage1_archive.SOURCES_DIR = old_sources
        write_json("stage1_archive_english_golden.json", archive_eng)

        ostwald_path = tmp / "ostwald.md"
        write_ostwald(ostwald_path)
        ostwald = stage1_ostwald.parse_ostwald(ostwald_path)
        write_json(
            "stage1_ostwald_parse_golden.json",
            {
                "prose": stringify_tuple_keys(ostwald[0]),
                "align": ostwald[1],
                "footnotes": ostwald[2],
                "counts": ostwald[3],
            },
        )


if __name__ == "__main__":
    main()
