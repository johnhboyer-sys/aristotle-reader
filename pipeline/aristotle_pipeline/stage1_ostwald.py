"""Stage 1d: third English translation (Martin Ostwald, Bobbs-Merrill 1962) for
the Nicomachean Ethics, ingested from a Markdown transcription.

Unlike the MIT-archive Ross (plain prose with no Bekker milestones, aligned onto
the spine via the gloss aligner), the Ostwald Markdown carries the Bekker
apparatus *inline*: each column begins with a bare page label (``1094a``) and
every fifth Bekker line is marked with a bare line number (``5 10 15 …``). We
parse those markers into a synthetic alignment map — one ``certain`` anchor per
marker — and hand it to the shared ``build_chunks`` machinery, so Ostwald gets a
genuine per-line Bekker gutter (Rackham-grade), not an interpolated estimate.

The translation's 505 footnotes are kept: their references stay inline in the
chunk text as ``[^N]`` tokens (the reader turns them into clickable superscripts)
and their definitions are emitted as a ``{N: html}`` map for the popup.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .config import BUILD_DIR, SOURCES_DIR
from .stage1_common import join_paragraph_parts, write_json
from .stage1_ross import build_chunks

# Book / chapter / marker grammar of the Ostwald Markdown.
_BOOK = re.compile(r"^#\s+BOOK\s+([IVXLC]+)\s*$")
# Chapter heading. The number is sometimes wrapped by a stray emphasis asterisk
# (`## *7. …`), so the leading `*` is optional.
_CHAPTER = re.compile(r"^##\s+\*?(\d+)\.")
_FOOTNOTE_DEF = re.compile(r"^\[\^(\d+)\]:\s*(.*)$")
# A bare Bekker page label, e.g. 1094a … 1181b (range-checked below).
_PAGE = re.compile(r"^1\d{3}[ab]$")
# A bare Bekker line number: line 1 is implied by the page label, the rest are
# every fifth line. Pages run to ~38 lines, so 5…40 covers the cadence.
_LINE = re.compile(r"^(5|10|15|20|25|30|35|40)$")
# Markdown emphasis *like this* (single asterisks, not ** bold), for footnotes.
_EMPH = re.compile(r"\*(?!\s)([^*]+?)\*")

_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

_PAGE_LO, _PAGE_HI = 1094, 1181


def _roman_int(s: str) -> int:
    total = prev = 0
    for ch in reversed(s):
        v = _ROMAN[ch]
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def _render_footnote(text: str) -> str:
    """A footnote definition as safe HTML: escaped, with *emphasis* preserved."""
    esc = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    return _EMPH.sub(r"<em>\1</em>", esc).strip()


def parse_ostwald(md_path: Path):
    """Parse the Ostwald Markdown into:

    - ``prose``: ``{(book, chapter): text}`` with the inline Bekker markers
      stripped but the ``[^N]`` footnote references left in place;
    - ``align_map``: ``{"book:chapter": {"anchors": [...]}}`` in the shape
      ``build_chunks`` expects, one ``certain`` anchor per inline marker;
    - ``footnotes``: ``{N: html}`` for every footnote definition.
    """
    lines = md_path.read_text(encoding="utf-8").splitlines()

    prose: dict[tuple[int, int], str] = {}
    align: dict[str, dict] = {}
    footnotes: dict[int, str] = {}

    book = chapter = None
    # Per-chapter accumulator (joined with single spaces, so anchor char offsets
    # computed here match the final " ".join(parts) string exactly).
    parts: list[str] = []
    length = 0
    page: str | None = None
    pending: list[str] = []          # marker citations awaiting the next word
    anchors: list[dict] = []
    counts = {"pages": 0, "line_marks": 0, "skipped_nums": 0}

    def _join_parts(ps: list) -> str:
        """Join word tokens and None paragraph-break sentinels into prose with
        `\n` at each paragraph boundary. Both `\n` and ` ` are 1 char, so the
        anchor char offsets computed during parsing remain valid."""
        return join_paragraph_parts(ps)

    def flush_chapter():
        nonlocal parts, length, anchors, pending
        if book is not None and chapter is not None and parts:
            # Any markers trailing the last word anchor at end-of-text.
            for cit in pending:
                anchors.append({"citation": cit, "offset": length,
                                "confidence": "certain"})
            prose[(book, chapter)] = _join_parts(parts)
            if anchors:
                align[f"{book}:{chapter}"] = {"anchors": anchors}
        parts, length, anchors, pending = [], 0, [], []

    in_footnotes = False
    for raw in lines:
        line = raw.strip()
        # The trailing footnote section opens with a `## Footnotes` header and
        # then one `[^N]: …` definition per line. Stop accumulating body text.
        if line == "## Footnotes" or _FOOTNOTE_DEF.match(line):
            in_footnotes = True
        if in_footnotes:
            m = _FOOTNOTE_DEF.match(line)
            if m:
                footnotes[int(m.group(1))] = _render_footnote(m.group(2))
            continue

        mb = _BOOK.match(line)
        if mb:
            flush_chapter()
            book, chapter = _roman_int(mb.group(1)), None
            continue
        mc = _CHAPTER.match(line)
        if mc:
            flush_chapter()
            # `page` is NOT reset: a chapter usually starts mid-column, so its
            # opening line markers still belong to the page carried over from the
            # end of the previous chapter (until the next inline page label).
            chapter = int(mc.group(1))
            continue
        if chapter is None:
            continue
        if not line:
            # Blank line = paragraph boundary. Append a None sentinel; the
            # joining step converts it to a \n in the final text. Both \n and
            # the usual space separator are 1 char, so anchor offsets stay valid.
            if parts and parts[-1] is not None:
                parts.append(None)
            continue

        for tok in line.split():
            if _PAGE.match(tok) and _PAGE_LO <= int(tok[:-1]) <= _PAGE_HI:
                page = tok
                pending.append(f"{page}1")
                counts["pages"] += 1
                continue
            if _LINE.match(tok):
                if page is not None:
                    pending.append(f"{page}{tok}")
                    counts["line_marks"] += 1
                else:
                    counts["skipped_nums"] += 1
                continue
            # Content word: its start offset resolves any pending markers.
            start = length + 1 if parts else 0
            for cit in pending:
                anchors.append({"citation": cit, "offset": start,
                                "confidence": "certain"})
            pending = []
            length = start + len(tok)
            parts.append(tok)
    flush_chapter()

    return prose, align, footnotes, counts


def _bekker_key(cit: str):
    m = re.match(r"(\d+)([ab])(\d+)", cit)
    return (int(m[1]), m[2], int(m[3])) if m else (0, "", 0)


def apply_corrections(prose, align, corrections) -> int:
    """Relocate Bekker markers from their raw OCR position (which sits ~1 clause
    late — the marginal number is OCR'd after the line it labels) to the semantic
    Greek-line start, found by direct reading (see tools/feasibility/). Each entry
    is a verbatim phrase resolved with str.find at build time, so it survives
    re-parsing. A phrase is applied only if found and order-preserving; otherwise
    that marker keeps its original position. Returns the number relocated."""
    n = 0
    for key, rec in align.items():
        b, c = (int(x) for x in key.split(":"))
        text = prose.get((b, c), "")
        cmap = corrections.get(key) or {}
        last = -1
        for a in sorted(rec["anchors"], key=lambda a: _bekker_key(a["citation"])):
            ph = cmap.get(a["citation"])
            if ph:
                idx = text.find(ph)
                if idx >= 0 and idx > last:
                    a["offset"] = idx
                    n += 1
            last = max(last, a["offset"])
        rec["anchors"].sort(key=lambda a: a["offset"])
    return n


def run(manifest, spine: dict, english: dict) -> Path:
    cfg = (manifest.data.get("english") or {}).get("third") or {}
    src = SOURCES_DIR / cfg.get("dir", "ostwald") / cfg.get("file", "ostwald-ethics.md")
    prose, align, footnotes, counts = parse_ostwald(src)

    corr_path = SOURCES_DIR / cfg.get("dir", "ostwald") / "bekker_corrections.json"
    if corr_path.exists():
        n = apply_corrections(prose, align, json.loads(corr_path.read_text(encoding="utf-8")))
        print(f"  ostwald: applied {n} Bekker-marker corrections from {corr_path.name}")

    chunks = build_chunks(spine, english.get("chapters", []), prose, align)

    out_dir = BUILD_DIR / "stage1"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "third_chunks.json", chunks)
    write_json(out_dir / "third_footnotes.json", footnotes)

    print(f"  ostwald: chapters={len(prose)} anchors={sum(len(v['anchors']) for v in align.values())} "
          f"footnotes={len(footnotes)} pages={counts['pages']} "
          f"line_marks={counts['line_marks']} skipped_nums={counts['skipped_nums']}")
    return out_dir / "third_chunks.json"
