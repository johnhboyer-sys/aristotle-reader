"""One-off: extract W. H. Fyfe's Poetics prose from the Perseus eng2 TEI into the
archive HTML format the gloss aligner / stage1_archive consumes.

Strips Bekker milestones and Fyfe's editorial footnotes (<note>), unwraps all
inline markup, collapses whitespace, and writes one "Part N" block per chapter
(26 chapters, single book) to sources/poet-fyfe/book-01.html.
"""
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SRC = Path("../sources/tlg0086.tlg034.perseus-eng2.xml")
OUT_DIR = Path("../sources/poet-fyfe")
NS = {"t": "http://www.tei-c.org/ns/1.0"}


def chapter_text(div: ET.Element) -> str:
    # Drop footnotes entirely (editorial apparatus, not the translation) — but
    # PRESERVE each note's tail, which is real translation prose that follows the
    # note inline. ET.remove() discards the tail, so splice it onto the previous
    # sibling's tail (or the parent's text if the note is the first child).
    note_tag = f"{{{NS['t']}}}note"
    for parent in list(div.iter()):
        kids = list(parent)
        last_survivor = None  # nearest preceding non-removed sibling
        for note in kids:
            if note.tag != note_tag:
                last_survivor = note
                continue
            tail = note.tail or ""
            if last_survivor is None:
                parent.text = (parent.text or "") + tail
            else:
                last_survivor.tail = (last_survivor.tail or "") + tail
            parent.remove(note)
    # itertext() yields all text/tail across remaining elements; milestones are
    # empty so contribute nothing. Inline tags (foreign/q/title/...) unwrap.
    text = "".join(div.itertext())
    return " ".join(text.split())


def main() -> None:
    tree = ET.parse(SRC)
    root = tree.getroot()
    chapters = root.findall('.//t:div[@subtype="chapter"]', NS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = ["<HTML><BODY>", "Translated by VENDOR", ""]
    count = 0
    for div in chapters:
        n = int(div.get("n"))
        prose = chapter_text(div)
        if not prose:
            continue
        count += 1
        assert n == count, f"chapter gap: expected {count}, got {n}"
        lines += [f"Part {n}", "", prose, ""]
    lines.append("</BODY></HTML>")
    out = OUT_DIR / "book-01.html"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} — {count} chapters")


if __name__ == "__main__":
    main()
