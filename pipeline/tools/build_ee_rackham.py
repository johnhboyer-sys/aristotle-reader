"""Build the Eudemian Ethics secondary translation (Rackham, Loeb 1935) and its
dense Bekker anchors from the Perseus eng2 TEI, plus a book-renumbered copy of
the Perseus grc2 used for chapter extraction.

The EE manuscript tradition numbers its books I, II, III, [IV-VI = the "common
books" = NE V-VII, not reprinted here], VII, VIII. Perseus carries them as books
1,2,3,7,8. The reader uses contiguous book indices, so we renumber 7->4, 8->5
everywhere: the grc2 chapter source (here) and the English book files.

Rackham's eng2 carries real Bekker milestones (unit="section" = column,
unit="line" = line), so we can emit a real per-line gutter directly as an
anchors.yaml ({bekker, at: verbatim phrase}) without running the aligner.

Run from pipeline/:  uv run python tools/build_ee_rackham.py
"""
from __future__ import annotations

import re
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "sources"
ENG2 = SRC / "tlg0086.tlg009.perseus-eng2.xml"
GRC2 = SRC / "tlg0086.tlg009.perseus-grc2.xml"
OUT_DIR = SRC / "ee-rackham"

# Perseus book number -> reader-contiguous book number (file index).
BOOK_REMAP = {1: 1, 2: 2, 3: 3, 7: 4, 8: 5}

DROP = {"note", "head", "bibl"}  # editorial apparatus, not reading text


def _local(el) -> str:
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def extract_eng2():
    """For each book, return (chapters, anchors).
    chapters: list of (chapter_n, prose_text) in order.
    anchors: list of (bekker_str, phrase) for every line milestone in the book.
    """
    tree = etree.parse(str(ENG2))
    body = tree.find(".//{*}body")
    if body is None:
        body = tree.getroot()
    books: dict[int, dict] = {}
    state = {"book": None, "chap": None, "col": None, "line": None}
    # per (book) accumulate chapter text buffers and anchor marks
    def ensure(b):
        return books.setdefault(b, {"order": [], "text": {}, "anchors": []})

    def emit(s):
        b, c = state["book"], state["chap"]
        if b is not None and c is not None and c in books.get(b, {}).get("text", {}):
            books[b]["text"][c].append(s)

    def walk(node):
        ln = _local(node)
        if ln == "div":
            sub, n = node.get("subtype"), node.get("n")
            if sub == "book" and (n or "").isdigit():
                state["book"] = int(n); state["chap"] = None; ensure(int(n))
            elif sub == "section" and (n or "").isdigit():
                b = state["book"]; state["chap"] = int(n)
                d = ensure(b)
                if int(n) not in d["text"]:
                    d["order"].append(int(n)); d["text"][int(n)] = []
        if ln == "milestone":
            unit = node.get("unit")
            if unit == "section":
                state["col"] = node.get("n"); state["line"] = "1"
            elif unit == "line":
                state["line"] = node.get("n")
                b, c = state["book"], state["chap"]
                if b is not None and c is not None and state["col"]:
                    # mark current length of this chapter's text as the anchor offset
                    cur = "".join(books[b]["text"][c])
                    books[b]["anchors"].append(
                        (f"{state['col']}{state['line']}", len(_collapse(cur)), b, c))
        if ln in DROP:
            # keep the tail (text after the dropped element) in flow
            if node.tail:
                emit(node.tail)
            return
        if node.text:
            emit(node.text)
        for ch in node:
            walk(ch)
        if node.tail:
            emit(node.tail)

    walk(body)
    return books


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    books = extract_eng2()
    anchors_lines: list[str] = []
    summary = []
    for b in sorted(books):
        d = books[b]
        fileno = BOOK_REMAP[b]
        # cleaned chapter prose
        chap_text = {c: _collapse("".join(d["text"][c])) for c in d["order"]}
        # write HTML (chapter markers renumbered 1..N sequentially as-is = section n)
        parts = ["<html><body>", "Translated by H. Rackham", f"<p>BOOK {b}</p>"]
        # section n may not start at 1 or be contiguous; remap to 1..N in order
        for idx, c in enumerate(d["order"], start=1):
            parts.append(str(idx))
            parts.append(f"<p>{chap_text[c]}</p>")
        (OUT_DIR / f"book-{fileno:02d}.html").write_text(
            "\n".join(parts) + "\n", encoding="utf-8")
        # anchors: phrase = ~8 words at the milestone offset within its chapter text
        seen = set()
        n_anchor = 0
        for bek, off, bb, cc in d["anchors"]:
            txt = chap_text[cc]
            phrase = " ".join(txt[off:off + 80].split()[:8])
            if len(phrase) < 12:
                # near end of chapter; back off to last 8 words
                phrase = " ".join(txt.split()[-8:])
            if not phrase or bek in seen:
                continue
            seen.add(bek)
            esc = phrase.replace('"', '\\"')
            anchors_lines.append(f'- {{ bekker: "{bek}", at: "{esc}" }}')
            n_anchor += 1
        summary.append(f"  Book {b}->file {fileno:02d}: {len(d['order'])} ch, {n_anchor} anchors")
    (OUT_DIR / "anchors.yaml").write_text(
        "# Rackham (Loeb 1935) real Bekker ticks, from Perseus eng2 milestones.\n"
        + "\n".join(anchors_lines) + "\n", encoding="utf-8")

    # renumbered grc2 for chapter extraction (books 7->4, 8->5)
    raw = GRC2.read_text(encoding="utf-8")
    def renum(m):
        n = int(m.group(2))
        return m.group(1) + f'n="{BOOK_REMAP.get(n, n)}"'
    raw2 = re.sub(r'(subtype="book"[^>]*?)n="(\d+)"', renum, raw)
    (SRC / "tlg0086.tlg009.perseus-grc2-eebooks.xml").write_text(raw2, encoding="utf-8")

    print("Rackham EE built:")
    print("\n".join(summary))
    print(f"  total anchors: {len(anchors_lines)} -> {OUT_DIR/'anchors.yaml'}")
    print(f"  renumbered grc2 -> tlg0086.tlg009.perseus-grc2-eebooks.xml")


if __name__ == "__main__":
    main()
