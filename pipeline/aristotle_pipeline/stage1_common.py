"""Shared Stage 1 helpers.

This module holds behavior-preserving mechanics used by multiple stage1 sources:
XML tag normalization, whitespace collapse, paragraph-token joining, standoff
chunk bookkeeping, and JSON emission. Source-specific parsing stays in the
individual stage1 modules.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from lxml import etree

WS = re.compile(r"\s+")


def local_name(el) -> str | None:
    if not isinstance(el.tag, str):
        return None
    return etree.QName(el).localname


def collapse_ws(text: str) -> str:
    return WS.sub(" ", text)


def text_excluding_subtrees(el, skip: tuple[str, ...] = ("note", "head")) -> str:
    """Plain text under `el`, dropping skipped child subtrees but keeping tails."""
    out: list[str] = []

    def walk(node, is_root=False):
        tag = local_name(node) or ""
        if tag in skip and not is_root:
            if node.tail:
                out.append(node.tail)
            return
        if node.text:
            out.append(node.text)
        for child in node:
            walk(child)
        if not is_root and node.tail:
            out.append(node.tail)

    walk(el, is_root=True)
    return collapse_ws("".join(out)).strip()


def join_paragraph_parts(items: list, split_words: bool = False) -> str:
    """Join text items and None paragraph sentinels into a prose string."""
    parts: list[str] = []
    cur: list[str] = []
    for item in items:
        if item is None:
            if cur:
                parts.append(" ".join(cur))
                parts.append("\n")
                cur = []
        elif split_words:
            cur.extend(item.split())
        else:
            cur.append(item)
    if cur:
        parts.append(" ".join(cur))
    return "".join(parts)


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


class StandoffChunkMixin:
    """Chunk text plus standoff notes/markers for TEI walkers.

    The consuming walker supplies `book`, `column`, `chunks`, and `_by_key`.
    """

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
        piece = collapse_ws(raw)
        if piece == " " and (
            not chunk["text"] or chunk["text"].endswith(" ") or chunk["text"].endswith("\n")
        ):
            return
        if (chunk["text"].endswith(" ") or chunk["text"].endswith("\n")) and piece.startswith(" "):
            piece = piece.lstrip(" ")
        if not chunk["text"]:
            piece = piece.lstrip(" ")
        chunk["text"] += piece

    def add_note(self, el):
        text = collapse_ws("".join(el.itertext())).strip()
        chunk = self._chunk()
        chunk["notes"].append({"offset": len(chunk["text"].rstrip()), "text": text})

    def add_marker(self, kind: str, n: str):
        chunk = self._chunk()
        chunk["markers"].append(
            {"kind": kind, "n": n, "offset": len(chunk["text"].rstrip())}
        )

    def add_paragraph(self):
        chunk = self._chunk()
        if chunk["text"]:
            offset = len(chunk["text"].rstrip())
            marker = {"kind": "paragraph", "n": "", "offset": offset}
            if not chunk["markers"] or chunk["markers"][-1] != marker:
                chunk["markers"].append(marker)
            if not chunk["text"].endswith((" ", "\n")):
                chunk["text"] = chunk["text"].rstrip() + " "
