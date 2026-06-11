"""Stage 1a: TLG Greek spine via Diogenes verse-mode export.

Parses the verse-mode TEI (Bekker-page divs containing <l n="..."> lines),
rejoins words hyphenated across lines onto the first line, assigns each line
to a book from the manifest table, and emits spine segments keyed
(book, column) so book-straddling columns split into per-book segments.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from lxml import etree

from .config import BUILD_DIR, Manifest

EXPORT_DIR = BUILD_DIR / "export"


def exported_xml_path(manifest: Manifest) -> Path:
    w = manifest.data["work"]
    return (
        EXPORT_DIR
        / "Diogenes-Resources"
        / "xml"
        / "tlg"
        / f"tlg{w['tlg_author']}{w['tlg_work']}.xml"
    )


def run_export(manifest: Manifest) -> Path:
    """Run Diogenes xml-export.pl in verse mode (-y) unless already done."""
    out = exported_xml_path(manifest)
    if out.exists():
        return out
    w = manifest.data["work"]
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "perl",
            "xml-export.pl",
            "-c", "tlg",
            "-n", w["tlg_author"],
            "-y",
            "-o", str(EXPORT_DIR),
        ],
        cwd=manifest.diogenes_server(),
        env={"TLG_DIR": str(manifest.tlg_dir()), "PATH": "/usr/bin:/bin"},
        check=True,
        capture_output=True,
        text=True,
    )
    if not out.exists():
        raise FileNotFoundError(f"export ran but {out} is missing")
    return out


def _line_text(el: etree._Element) -> str:
    """Flatten an <l>, dropping heading labels, collapsing whitespace."""
    parts = []
    for piece in el.itertext():
        parts.append(piece)
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    return text


def parse_spine(xml_path: Path, manifest: Manifest) -> dict:
    tree = etree.parse(str(xml_path))
    # Flat list of (column, line_no, text) in document order.
    flat: list[dict] = []
    headings: list[dict] = []
    for div in tree.iter("{*}div"):
        if div.get("type") != "Bekker-page":
            continue
        column = div.get("n")
        for l in div.iter("{*}l"):
            n = l.get("n")
            if not n.isdigit():
                headings.append({"column": column, "text": _line_text(l)})
                continue
            flat.append({"column": column, "n": int(n), "text": _line_text(l)})

    # Rejoin hyphenated words: a line ending in "-" takes the first
    # whitespace-delimited token of the next line (which may sit in the
    # next column).
    for i, line in enumerate(flat):
        if not line["text"].endswith("-"):
            continue
        if i + 1 >= len(flat) or not flat[i + 1]["text"]:
            raise ValueError(
                f"hyphenated line with no continuation: {line['column']}{line['n']}"
            )
        nxt = flat[i + 1]
        head, _, rest = nxt["text"].partition(" ")
        line["text"] = line["text"][:-1] + head
        line["joined"] = True
        nxt["text"] = rest

    # Group into per-(book, column) segments, preserving document order.
    segments: list[dict] = []
    seg_by_key: dict[tuple, dict] = {}
    unassigned: list[dict] = []
    for line in flat:
        book = manifest.book_for_line(line["column"], line["n"])
        if book is None:
            unassigned.append(line)
            continue
        key = (book, line["column"])
        seg = seg_by_key.get(key)
        if seg is None:
            seg = {
                "id": f"{book}:{line['column']}",
                "book": book,
                "column": line["column"],
                "lines": [],
            }
            seg_by_key[key] = seg
            segments.append(seg)
        entry = {"n": line["n"], "text": line["text"]}
        if line.get("joined"):
            entry["joined"] = True
        seg["lines"].append(entry)

    return {
        "work": manifest.work_id,
        "edition": manifest.data["work"]["greek_edition"],
        "segments": segments,
        "headings": headings,
        "unassigned_lines": unassigned,
    }


def run(manifest: Manifest) -> Path:
    xml_path = run_export(manifest)
    spine = parse_spine(xml_path, manifest)
    out = BUILD_DIR / "stage1" / "greek_spine.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(spine, ensure_ascii=False, indent=1), encoding="utf-8")
    return out
