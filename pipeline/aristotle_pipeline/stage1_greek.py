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


def _line_text(el: etree._Element, strip_bars: bool = False) -> str:
    """Flatten an <l>, dropping heading labels, collapsing whitespace.

    `strip_bars` removes literal "|" edition line-break markers, which some
    exports (e.g. De Mundo's) print inside a plain <l> — mid-word (καλοῦν|ται)
    or between words (μέσον | μὲν); the bar is never part of a Greek word.
    It must stay FALSE on compound-numbered lines (n="8,9"), where "|" is the
    delimiter _expand_compound splits on to map the physical line onto its two
    Bekker numbers — stripping it there would destroy the split."""
    text = "".join(el.itertext())
    if strip_bars:
        text = text.replace("|", "")
    return re.sub(r"\s+", " ", text).strip()


# Comma-separated (APo 99b "8,9") or hyphen-range (PA 689a "13-14", also in
# Cael and DM) — both mean one physical line straddling two Bekker numbers.
_COMPOUND_N = re.compile(r"^\d+(?:\s*[,-]\s*\d+)+$")
# Bekker numbers a few lines 5a, 5b … where an edition inserts text after a
# numbered line — Physics VII 244b runs 1-5, 5a-5d, 6-15. These are ordinary
# lines of text, not headings.
#
# Only a-e. The suffix letter is not always a Bekker sub-line: TLG also numbers
# a heading 23t (title) and 17n (note), and both carry a <label type="head">
# whose text _line_text drops, so admitting them files an EMPTY line into the
# spine and repeats the line number it hangs off. Across the corpus's exports
# the text sub-lines run a-d (52 of them), against 98 t and 37 n headings.
_LETTERED_N = re.compile(r"^(\d+)([a-e])$")


def _line_no(n: str | None) -> tuple[int, str | None] | None:
    """(Bekker line, letter suffix) for an <l n="…">, or None for a heading.

    Returns a suffix of None for a plain numeral. A lettered line keeps the
    number of the line it follows, so a citation to 244b5 still resolves and
    document order still sorts, while `sub` preserves which line it is.
    """
    if not n:
        return None
    if n.isdigit():
        return int(n), None
    m = _LETTERED_N.match(n)
    if m:
        return int(m.group(1)), m.group(2)
    return None


def _expand_compound(items: list[tuple[str, str]]) -> list[tuple[int, str]]:
    """Reconstruct true Bekker lines from a run of compound-numbered physical
    lines. In a few places an edition prints one physical line that straddles
    two Bekker lines, tagging it with both numbers — comma-separated (n="8,9",
    APo 99b8-14) or as a hyphen range (n="13-14", PA/Cael/DM) — usually with an
    in-line `|` at the internal break. For each physical line we rejoin a word
    the break splits (καθόλου πρῶ|τον → πρῶτον, kept whole on the earlier line,
    as with hyphenation), then split the remainder at word-boundary `|`s and
    map the pieces onto the line's Bekker numbers. Pieces that share a Bekker
    number across adjacent physical lines are concatenated, so every Bekker
    line is recovered exactly once and in order. A line with no `|` at all (the
    PA prose ranges) is one piece and lands whole on its first number — the
    second number then has no line of its own, a real gap the manifest
    declares. Where a range overlaps a flanking plain-numbered line (Cael 294a,
    DM 401a), parse_spine merges the two entries after the hyphen rejoin."""
    by_line: dict[int, list[str]] = {}
    order: list[int] = []
    for n_str, raw in items:
        nums = [int(x) for x in re.split(r"\s*[,-]\s*", n_str)]
        text = re.sub(r"(?<=\S)\|(?=\S)", "", raw)      # rejoin mid-word break
        pieces = re.split(r"\s*\|\s*", text)            # split word-boundary breaks
        for i, piece in enumerate(pieces):
            piece = piece.strip()
            if not piece:
                continue
            num = nums[i] if i < len(nums) else nums[-1]
            if num not in by_line:
                by_line[num] = []
                order.append(num)
            by_line[num].append(piece)
    return [(num, re.sub(r"\s+", " ", " ".join(by_line[num])).strip())
            for num in order]


def parse_spine(xml_path: Path, manifest: Manifest) -> dict:
    tree = etree.parse(str(xml_path))
    # Most works have a real Bekker spine: <div type="Bekker-page" n="16a">. A
    # non-Bekker treatise (citation.scheme: busse, e.g. Porphyry's Isagoge) is
    # cited by Busse CAG page.line — the export types each page <div type="page"
    # n="1">. We map Busse page N onto a SYNTHETIC Bekker column "Na" (a-side
    # only) so refs.py/config/stage7 and the reader's column:line machinery work
    # unchanged; the reader relabels the gutter from the registry citation flag.
    scheme = (manifest.data.get("citation") or {}).get("scheme", "bekker")
    page_type = "page" if scheme == "busse" else "Bekker-page"
    # Flat list of (column, line_no, text) in document order.
    flat: list[dict] = []
    headings: list[dict] = []
    for div in tree.iter("{*}div"):
        if div.get("type") != page_type:
            continue
        column = f"{div.get('n')}a" if scheme == "busse" else div.get("n")
        compound: list[tuple[str, str]] = []  # run of compound-numbered lines

        def flush():
            for line_no, text in _expand_compound(compound):
                flat.append({"column": column, "n": line_no, "text": text,
                             "compound": True})
            compound.clear()

        for l in div.iter("{*}l"):
            n = l.get("n")
            if n and not n.isdigit() and _COMPOUND_N.match(n):
                compound.append((n, _line_text(l)))
                continue
            if compound:
                flush()
            parsed = _line_no(n)
            if parsed is None:
                headings.append({"column": column, "text": _line_text(l, strip_bars=True)})
                continue
            line_no, sub = parsed
            line = {"column": column, "n": line_no,
                    "text": _line_text(l, strip_bars=True)}
            if sub:
                line["sub"] = sub
            flat.append(line)
        if compound:
            flush()

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

    # A compound range can overlap a flanking plain-numbered line (Cael 294a:
    # plain 25 then n="25-26"; DM 401a: n="2-3" ending παρ- then plain 3).
    # Both entries are halves of the same Bekker line, so merge them. Only
    # compound-derived entries qualify — two plain lines sharing a number is a
    # data defect the validators must still see.
    merged: list[dict] = []
    for line in flat:
        prev = merged[-1] if merged else None
        if (prev is not None
                and (prev.get("compound") or line.get("compound"))
                and prev["column"] == line["column"]
                and prev["n"] == line["n"]
                and not prev.get("sub") and not line.get("sub")):
            prev["text"] = (prev["text"] + " " + line["text"]).strip()
            if line.get("joined"):
                prev["joined"] = True
            continue
        merged.append(line)
    flat = merged

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
        if line.get("sub"):
            entry["sub"] = line["sub"]
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
