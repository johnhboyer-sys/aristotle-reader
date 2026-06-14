"""Chapter divisions for works with no Bekker-milestoned English TEI.

Where EN reads chapter starts from the Perseus English TEI's inline Bekker
milestones (stage1_english), works like De Anima get them from the Greek side:
the First1KGreek TEI divides the text into book/chapter <div>s, and the TLG
spine is already Bekker-lineated. We text-align each chapter div's opening words
onto the spine to recover its exact (column, line).

The match is monotonic — each chapter must begin at or after the previous one —
which both fixes opening phrases that recur earlier and pins chapters that share
a column into the right order. Verified on De Anima against canonical anchors
(II.1=412a, III.1=424b22, III.4=429a10, III.5=430a10).
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from lxml import etree

from .config import SOURCES_DIR


def _norm(s: str) -> str:
    """Accent/diacritic-stripped, lowercased base-letter form for matching
    across editions (TLG vs First1KGreek differ only orthographically)."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("’", "'").replace("ʼ", "'")
    s = re.sub(r"[^α-ωa-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _spine_words(spine: dict):
    """Flatten the spine into a normalized word stream with each word's owning
    (column, line) and its char offset in the joined string."""
    words, owner = [], []
    for seg in spine["segments"]:
        for line in seg["lines"]:
            # drop trailing hyphens so a word split across lines still matches.
            # Track each word's index WITHIN its line so a chapter that begins
            # mid-line can be split there (most chapters start mid-line).
            for wi, w in enumerate(_norm(line["text"].replace("-", "")).split()):
                words.append(w)
                owner.append((seg["column"], line["n"], wi))
    joined = " ".join(words)
    wstart, pos = [], 0
    for w in words:
        wstart.append(pos)
        pos += len(w) + 1
    return joined, owner, wstart


def _local(el) -> str:
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def _div_opening(div, k_chars=400) -> str:
    """First ~k chars of text under a chapter div, dropping note/head subtrees
    and a leading single-letter book label."""
    out: list[str] = []

    def walk(node, root=False):
        if _local(node) in ("note", "head") and not root:
            if node.tail:
                out.append(node.tail)
            return
        if node.text:
            out.append(node.text)
        for ch in node:
            walk(ch)
        if not root and node.tail:
            out.append(node.tail)
        if len("".join(out)) > k_chars * 2:
            return

    walk(div, root=True)
    seg = re.sub(r"\s+", " ", "".join(out)).strip()
    return re.sub(r"^\s*[Α-Ω][.·]?\s", " ", seg)[:k_chars]


def _chapter_openings(grc_path: Path, chapter_subtype: str = "chapter",
                      book_subtype: str = "book"):
    """(book, chapter, opening_text) for every chapter div, in document order.
    Works with no book divisions default to book 1. lxml-based, so it's robust
    to attribute order (Perseus inserts xml:base between subtype and n)."""
    tree = etree.parse(str(grc_path))
    body = tree.find(".//{*}body")
    if body is None:
        body = tree.getroot()
    out = []
    for div in body.iter("{*}div"):
        sub = div.get("subtype")
        n = div.get("n")
        if sub != chapter_subtype or not (n and n.lstrip("-").isdigit()):
            continue
        book = 1
        anc = div.getparent()
        while anc is not None:
            if anc.get("subtype") == book_subtype and (anc.get("n") or "").isdigit():
                book = int(anc.get("n"))
                break
            anc = anc.getparent()
        out.append((book, n, _div_opening(div)))
    return out


def extract_chapters_grc(spine: dict, grc_rel: str,
                         chapter_subtype: str = "chapter",
                         book_subtype: str = "book") -> list[dict]:
    """List of {book, chapter, column, line, bookstart} aligned onto the spine."""
    grc_path = SOURCES_DIR / grc_rel
    joined, owner, wstart = _spine_words(spine)
    chapters: list[dict] = []
    after = 0
    for book, chap, opening in _chapter_openings(grc_path, chapter_subtype, book_subtype):
        if not chapters:
            col, line, word = owner[0]  # the work's first chapter starts the spine
        else:
            loc = None
            ow = _norm(opening).split()
            for kk in (8, 6, 5, 4):
                if len(ow) < kk:
                    continue
                p = joined.find(" ".join(ow[:kk]), after)
                if p >= 0:
                    widx = joined[:p].count(" ")
                    loc, after = owner[widx], wstart[widx]
                    break
            if loc is None:
                continue  # unmatched chapter (surfaced by the caller as a gap)
            col, line, word = loc
        bookstart = not any(c["book"] == book for c in chapters)
        chapters.append({
            "book": book, "chapter": chap, "column": col,
            "line": str(line), "wordIndex": word, "bookstart": bookstart,
        })
    return chapters
