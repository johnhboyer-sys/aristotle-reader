"""Bekker lineation for a TLG text that carries none.

Most TLG exports print Bekker's page, column and line (<div type="Bekker-page">
holding <l n="…"> lines). The Magna Moralia's does not: TLG took Susemihl's text
from the Loeb (Armstrong, 1935), and the export is divided only by book,
chapter and section, its <l> lines being the Loeb's. The reader's spine is
Bekker-lineated, so the work cannot be read without a Bekker line for every
word.

The line breaks come from print: Bekker's own edition (Berlin, 1831), where
each printed line IS a Bekker line. `pipeline/tools/mm_bekker_lines.py` reads
the scan of those pages and writes a line map, one entry per Bekker line, naming
the TLG word that opens it:

    - {bekker: 1181a24, loc: "1.1.1.1", w: 0, at: "Ἐπειδὴ"}

`loc` is book.chapter.section.line in the TLG export, `w` the word's index in
that line once line-end hyphenation is rejoined, `at` the word itself. This
module splits the TLG word stream at those words. The map holds only Bekker
references and single opening words, so no TLG file is shipped; the Greek still
comes from the cached export at build time. A map that no longer fits the
export (a word moved, a hyphen rejoined differently) stops the build.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml
from lxml import etree

from .refs import ref_key


def _text(el) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def tlg_tokens(xml_path: Path) -> list[dict]:
    """The export's words in reading order, each {loc, w, text, book, chapter}.

    A line ending in "-" takes the first word of the next line, which is then
    dropped from that line — the convention parse_spine uses, so a word split
    across Loeb lines is one token owned by the line where it starts. The
    work's title (TLG Book "t") is not text.
    """
    tree = etree.parse(str(xml_path))
    lines: list[tuple[str, int, str, list[str]]] = []
    for book in tree.iter("{*}div"):
        if book.get("type") != "Book" or book.get("n") == "t":
            continue
        for chap in book:
            if chap.get("type") != "chapter":
                continue
            for sec in chap:
                if sec.get("type") != "section":
                    continue
                for l in sec.iter("{*}l"):
                    loc = f"{book.get('n')}.{chap.get('n')}.{sec.get('n')}.{l.get('n')}"
                    lines.append((loc, int(book.get("n")), chap.get("n"), _text(l).split()))
    for i, (loc, _b, _c, words) in enumerate(lines):
        if words and words[-1].endswith("-"):
            j = i + 1
            while j < len(lines) and not lines[j][3]:
                j += 1
            if j == len(lines):
                raise ValueError(f"hyphenated line with no continuation: {loc}")
            words[-1] = words[-1][:-1] + lines[j][3].pop(0)
    out = []
    for loc, b, c, words in lines:
        for w, text in enumerate(words):
            out.append({"loc": loc, "w": w, "text": text, "book": b, "chapter": c})
    return out


def load_map(path: Path) -> list[dict]:
    entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not entries:
        raise ValueError(f"{path}: empty line map")
    return entries


def relineate(xml_path: Path, map_path: Path) -> list[dict]:
    """Flat Bekker lines [{column, n, text}] for parse_spine's grouping step.

    Every entry must name a word of the export exactly (loc, w and the word
    itself), the Bekker refs and the words must both strictly increase, the
    first entry must open the text, and so every word lands on exactly one
    line and no line is empty.
    """
    tokens = tlg_tokens(xml_path)
    index = {(t["loc"], t["w"]): i for i, t in enumerate(tokens)}
    starts: list[tuple[str, int]] = []
    bad: list[str] = []
    for e in load_map(map_path):
        ref, key = str(e["bekker"]), (str(e["loc"]), int(e["w"]))
        i = index.get(key)
        if i is None:
            bad.append(f"{ref}: no word {key[0]}:{key[1]}")
            continue
        if tokens[i]["text"] != e["at"]:
            bad.append(f"{ref}: {key[0]}:{key[1]} is {tokens[i]['text']!r}, map says {e['at']!r}")
            continue
        starts.append((ref, i))
    if bad:
        raise ValueError(f"{map_path.name}: {len(bad)} entries do not fit the export: {bad[:6]}")
    if starts[0][1] != 0:
        raise ValueError(f"{map_path.name}: first line does not open the text")
    for (r0, i0), (r1, i1) in zip(starts, starts[1:]):
        if ref_key(r1) <= ref_key(r0) or i1 <= i0:
            raise ValueError(f"{map_path.name}: {r0} -> {r1} out of order")
    flat = []
    for k, (ref, i) in enumerate(starts):
        j = starts[k + 1][1] if k + 1 < len(starts) else len(tokens)
        m = re.match(r"^(\d+[ab])(\d+)$", ref)
        flat.append({"column": m.group(1), "n": int(m.group(2)),
                     "text": " ".join(t["text"] for t in tokens[i:j])})
    return flat
