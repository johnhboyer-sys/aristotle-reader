"""Stage 1b: Perseus English (Rackham) chunked at Bekker page milestones.

Walks the TEI body in document order tracking the enclosing book div and the
last-seen Bekker page milestone; every run of text belongs to the chunk
keyed (book, column). This uniformly handles the duplicate milestones at
mid-column book restarts (III/IV/VI/IX/X) and Book II's restart at 1103a14,
which has no duplicate milestone — entering the book div changes the key.

Translator notes are lifted out of the text flow into a per-chunk standoff
`notes` array anchored by character offset; section/subsection boundaries
are recorded the same way as `markers`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from lxml import etree

from .config import BUILD_DIR, Manifest

_WS = re.compile(r"\s+")


def _local(el) -> str | None:
    if not isinstance(el.tag, str):
        return None  # comment / PI
    return etree.QName(el).localname


class _Walker:
    def __init__(self, manifest: Manifest):
        self.manifest = manifest
        self.book: int | None = None
        self.column: str = manifest.first_column
        self.line: str | None = None
        self.chunks: list[dict] = []
        self._by_key: dict[tuple, dict] = {}
        # Chapter starts as (book, chapter) -> {column, line}. A chapter's start
        # Bekker reference is the running (page, line) when its <div subtype=
        # "section"> opens — EXCEPT a book's first chapter, whose exact start
        # line only appears at the next line milestone inside it (e.g. 1103a14).
        self.chapters: list[dict] = []
        self._book_first_section = False
        self._pending_first: tuple | None = None

    def _chunk(self) -> dict:
        key = (self.book, self.column)
        chunk = self._by_key.get(key)
        if chunk is None:
            chunk = {
                "id": f"{self.book}:{self.column}",
                "book": self.book,
                "column": self.column,
                "text": "",
                "notes": [],
                "markers": [],
            }
            self._by_key[key] = chunk
            self.chunks.append(chunk)
        return chunk

    def add_text(self, raw: str | None):
        if not raw:
            return
        chunk = self._chunk()
        piece = _WS.sub(" ", raw)
        if piece == " " and (not chunk["text"] or chunk["text"].endswith(" ")):
            return
        if chunk["text"].endswith(" ") and piece.startswith(" "):
            piece = piece.lstrip(" ")
        if not chunk["text"]:
            piece = piece.lstrip(" ")
        chunk["text"] += piece

    def add_note(self, el):
        text = _WS.sub(" ", "".join(el.itertext())).strip()
        chunk = self._chunk()
        chunk["notes"].append({"offset": len(chunk["text"].rstrip()), "text": text})

    def add_marker(self, kind: str, n: str):
        chunk = self._chunk()
        chunk["markers"].append(
            {"kind": kind, "n": n, "offset": len(chunk["text"].rstrip())}
        )

    def walk(self, el):
        tag = _local(el)
        if tag is None:
            self.add_text(el.tail)
            return
        if tag == "note":
            self.add_note(el)
            self.add_text(el.tail)
            return
        if tag == "head":
            # Book headings ("Book 5") are derivable from the div structure;
            # at column-boundary book starts they would otherwise leak into
            # the previous column's chunk.
            self.add_text(el.tail)
            return
        if tag == "milestone":
            if el.get("resp") == "Bekker":
                if el.get("unit") == "page":
                    self.column = el.get("n")
                elif el.get("unit") == "line":
                    self.line = el.get("n")
                    if self._pending_first is not None:
                        book, chap = self._pending_first
                        self.chapters.append(
                            {"book": book, "chapter": chap,
                             "column": self.column, "line": self.line}
                        )
                        self._pending_first = None
            self.add_text(el.tail)
            return
        if tag == "div":
            subtype = el.get("subtype")
            if subtype == "book":
                self.book = int(el.get("n"))
                self._book_first_section = True
            elif subtype == "section":
                chap = el.get("n")
                if self._book_first_section:
                    # Defer to the next line milestone for the exact start line.
                    self._pending_first = (self.book, chap)
                    self._book_first_section = False
                else:
                    self.chapters.append(
                        {"book": self.book, "chapter": chap,
                         "column": self.column, "line": self.line}
                    )
                self.add_marker(subtype, chap)
            elif subtype == "subsection":
                self.add_marker(subtype, el.get("n"))
        self.add_text(el.text)
        for child in el:
            self.walk(child)
        self.add_text(el.tail)


def parse_english(xml_path: Path, manifest: Manifest) -> dict:
    tree = etree.parse(str(xml_path))
    body = tree.find(".//{*}body")
    if body is None:
        raise ValueError("no TEI body found")
    walker = _Walker(manifest)
    walker.walk(body)
    chunks = [c for c in walker.chunks if c["text"].strip() or c["notes"]]
    for c in chunks:
        c["text"] = c["text"].strip()
    return {
        "work": manifest.work_id,
        "source": xml_path.name,
        "translation": manifest.data["work"]["english_translation"],
        "chunks": chunks,
        "chapters": walker.chapters,
    }


def build_alignment(spine: dict, english: dict) -> dict:
    """Standoff alignment between spine segments and English chunks,
    matched on the shared (book, column) id."""
    eng_ids = {c["id"] for c in english["chunks"]}
    seg_ids = {s["id"] for s in spine["segments"]}
    pairs = [
        {"segment": s["id"], "english": s["id"] if s["id"] in eng_ids else None}
        for s in spine["segments"]
    ]
    return {
        "work": spine["work"],
        "pairs": pairs,
        "english_only": sorted(eng_ids - seg_ids),
    }


def run(manifest: Manifest, spine: dict) -> tuple[Path, Path]:
    english = parse_english(manifest.perseus_eng(), manifest)
    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    eng_path = out_dir / "english_chunks.json"
    eng_path.write_text(
        json.dumps(english, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    alignment = build_alignment(spine, english)
    align_path = out_dir / "alignment.json"
    align_path.write_text(
        json.dumps(alignment, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return eng_path, align_path
