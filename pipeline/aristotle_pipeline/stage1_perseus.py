"""Per-chapter English prose from a Perseus TEI translation (`*-eng2.xml`).

For works that have a Perseus English TEI (Poetics, Rhetoric, Politics,
Metaphysics, …) this is a cleaner translation source than scraping the MIT
archive's per-work HTML: one well-formed XML, chapter-divided, with translator
notes marked up so they can be dropped. We pull the plain text under each
chapter div (keyed by its enclosing book, or book 1 for works with no book
divisions like the Poetics) and hand it to the same chapter-anchored
distribution the Ross/Smith path uses.

The Bekker line milestones the TEI also carries are not consumed here (the gutter
stays interpolated); they remain available for a later real-anchor upgrade.
"""

from __future__ import annotations

import re
from pathlib import Path

from lxml import etree

from .stage1_common import text_excluding_subtrees

_WS = re.compile(r"\s+")


def _localname(el) -> str:
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def _chapter_text(div) -> str:
    """Plain text under a chapter div, dropping <note>/<head> subtrees (their
    tails — the main-text continuation — are kept)."""
    return text_excluding_subtrees(div)


def chapter_prose(
    tei_path: Path, chapter_subtype: str = "chapter", book_subtype: str = "book",
) -> dict[tuple[int, int], str]:
    """{(book, chapter): prose}. Works with no book divisions default to book 1.
    Chapter numbering follows the TEI's div `n`, matching the grc TEI used for
    chapter placement (stage1_chapters)."""
    tree = etree.parse(str(tei_path))
    body = tree.find(".//{*}body")
    if body is None:
        raise ValueError(f"no TEI body in {tei_path}")
    out: dict[tuple[int, int], str] = {}
    for div in body.iter("{*}div"):
        if div.get("subtype") != chapter_subtype:
            continue
        n = div.get("n")
        if not (n and n.lstrip("-").isdigit()):
            continue
        # Nearest enclosing book div, else book 1.
        book = 1
        anc = div.getparent()
        while anc is not None:
            if anc.get("subtype") == book_subtype and (anc.get("n") or "").isdigit():
                book = int(anc.get("n"))
                break
            anc = anc.getparent()
        text = _chapter_text(div)
        if text:
            out[(book, int(n))] = text
    return out
