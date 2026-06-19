"""Vendor sources for the Natural-Philosophy expansion (De Caelo, Meteorologica,
and the Parva Naturalia) into ../sources/.

For each work it fetches:
  * the First1KGreek grc1 TEI  -> sources/tlg0086.tlg<NNN>.1st1K-grc1.xml
    (its subtype="chapter" divs are text-aligned onto the Diogenes spine)
  * the MIT Internet Classics Archive English -> sources/<dir>/book-0N.html

Multi-book works (De Caelo, Meteorologica) keep one MIT sub-page per book file.
Bookless works are assembled into a single book-01.html: a one-page work is saved
as-is; a work the archive paginates into "Section" pages (De Sensu, youth_old) is
concatenated into one continuous Part-1..N stream (the in-page boilerplate of all
but the first page stripped) so stage1_ross.parse_book reads one ascending
chapter sequence.
"""

from __future__ import annotations

import html
import re
import sys
import urllib.request
from pathlib import Path

SOURCES = Path(__file__).resolve().parents[2] / "sources"
F1K = "https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/master/data/tlg0086/tlg{n}/tlg0086.tlg{n}.1st1K-grc1.xml"
MIT = "https://raw.githubusercontent.com/TheMITTech/classics/master/Aristotle/{page}.html"

_TAG = re.compile(r"<[^>]+>")
_ENDS = ("Commentary:", "How to cite", "-THE END-", "Buy Books", "Browse and Comment")

# id -> (tlg numbers, english dir, [MIT page slugs], multi_book?)
WORKS = [
    ("Cael", ["005"], "cael-stocks",
     ["heavens.1.i", "heavens.2.ii", "heavens.3.iii", "heavens.4.iv"], True),
    ("Mete", ["026"], "mete-webster",
     ["meteorology.1.i", "meteorology.2.ii", "meteorology.3.iii", "meteorology.4.iv"], True),
    ("Sens", ["041"], "sens-beare", ["sense.1.1", "sense.2.2"], False),
    ("Mem", ["024"], "mem-beare", ["memory"], False),
    ("Somn", ["042"], "somn-beare", ["sleep"], False),
    ("Insomn", ["016"], "insomn-beare", ["dreams"], False),
    ("DivSomn", ["008"], "divsomn-beare", ["prophesying"], False),
    ("Long", ["020"], "long-ross", ["longev_short"], False),
    ("Juv", ["018", "037"], "juv-ross", ["youth_old.1.1", "youth_old.2.2"], False),
    # History of Animals: grc Book X (spurious, on sterility) is untranslated and
    # omitted; MIT Book N = grc N. The per-book MIT HTML pages are truncated for
    # the long books (V/VI/VIII/IX paginate), so we take the complete single-file
    # text dump (history_anim.mb.txt) and split it on its "BOOK N" headers — see
    # the wid == "HA" branch in main().
    ("HA", ["014"], "ha-thompson", ["history_anim.mb.txt"], "mb"),
    # Parts of Animals (Ogle) is vendored separately from LacusCurtius/Penelope,
    # which carries the modern 5/17/15/14 chapter division — see fetch_pa_ogle.py.
]

# BOOK <roman> headers in the .mb.txt full-text dump, in order.
_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "aristotle-reader/fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def _body_lines(raw: str) -> list[str]:
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S | re.I)
    m = re.search(r"<body.*?</body>", raw, flags=re.S | re.I)
    body = m.group(0) if m else raw
    return [l.strip() for l in html.unescape(_TAG.sub("\n", body)).split("\n")]


def _content_slice(raw: str) -> list[str]:
    """The Part-bearing content of one MIT page: from the 'Translated by' line
    (inclusive) to just before the first footer boilerplate marker."""
    lines = _body_lines(raw)
    start = next((i for i, l in enumerate(lines) if l.startswith("Translated by")), 0)
    out = []
    for l in lines[start:]:
        if out and any(l.startswith(e) for e in _ENDS):
            break
        out.append(l)
    return out


def main() -> None:
    for wid, tlgs, edir, pages, multi in WORKS:
        for n in tlgs:
            dest = SOURCES / f"tlg0086.tlg{n}.1st1K-grc1.xml"
            if not dest.exists():
                dest.write_text(_get(F1K.format(n=n)), encoding="utf-8")
            print(f"  grc tlg{n} -> {dest.name} ({dest.stat().st_size} B)")
        ddir = SOURCES / edir
        ddir.mkdir(exist_ok=True)
        if multi == "mb":
            # Single full-text dump: split on "BOOK <roman>" headers into one
            # plain-text book-0N.html per book (parse_book strips tags, so the
            # ascending "Part N" stream reads straight through).
            txt = _get(MIT.format(page=pages[0])[:-len(".html")])
            pat = re.compile(r"^BOOK ([IVXL]+)\s*$", re.M)
            hits = [(m.group(1), m.start(), m.end()) for m in pat.finditer(txt)]
            for i, (roman, _, body_start) in enumerate(hits):
                end = hits[i + 1][1] if i + 1 < len(hits) else len(txt)
                n = _ROMAN.index(roman) + 1
                (ddir / f"book-{n:02d}.html").write_text(
                    txt[body_start:end].strip(), encoding="utf-8")
            print(f"  {wid}: {len(hits)} book files split from {pages[0]} in {edir}/")
        elif multi:
            for i, page in enumerate(pages, 1):
                (ddir / f"book-{i:02d}.html").write_text(_get(MIT.format(page=page)), encoding="utf-8")
            print(f"  {wid}: {len(pages)} book files in {edir}/")
        elif len(pages) == 1:
            # single page: save as-is (parse_book strips its own boilerplate).
            (ddir / "book-01.html").write_text(_get(MIT.format(page=pages[0])), encoding="utf-8")
            print(f"  {wid}: book-01.html (single page) in {edir}/")
        else:
            # paginated bookless work: concatenate every page's Part-content
            # slice (each page's own footer boilerplate stripped) so the merged
            # book-01.html is one ascending Part-1..N stream with no premature
            # end marker truncating it.
            merged = ["\n".join(_content_slice(_get(MIT.format(page=p)))) for p in pages]
            (ddir / "book-01.html").write_text("\n".join(merged), encoding="utf-8")
            print(f"  {wid}: book-01.html merged from {len(pages)} pages in {edir}/")


if __name__ == "__main__":
    sys.exit(main())
