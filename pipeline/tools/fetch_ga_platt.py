"""Vendor sources for Generation of Animals (De Generatione Animalium) into
../sources/.

Two components:
  * the First1KGreek grc1 TEI -> sources/tlg0086.tlg012.1st1K-grc1.xml
    (its subtype="chapter" divs, 23/8/11/10/8 across five books, are
    text-aligned onto the Diogenes spine)
  * Arthur Platt's English (Oxford, 1910) -> sources/ga-platt/book-0N.html

The MIT Internet Classics Archive does NOT carry Generation of Animals, so the
English is taken from the eBooks@Adelaide "complete.html" web edition (now only
on the Wayback Machine). That edition marks books as <h3>Book N</h3> and chapters
as <h4>N</h4>; stage1's "number" marker reads each <h4> as a standalone chapter
line. We split the single page into one book-0N.html per book (the leading
Table of Contents and the trailing Adelaide footer dropped) so parse_book reads
one ascending chapter sequence per file, matching the Greek 23/8/11/10/8.
"""

from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

SOURCES = Path(__file__).resolve().parents[2] / "sources"
F1K = ("https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/"
       "master/data/tlg0086/tlg012/tlg0086.tlg012.1st1K-grc1.xml")
ADELAIDE = ("https://web.archive.org/web/2018id_/"
            "https://ebooks.adelaide.edu.au/a/aristotle/generation/complete.html")
_ROMAN = ["I", "II", "III", "IV", "V"]


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "aristotle-reader/fetch"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode("utf-8", errors="replace")


def main() -> None:
    grc = SOURCES / "tlg0086.tlg012.1st1K-grc1.xml"
    if not grc.exists():
        grc.write_text(_get(F1K), encoding="utf-8")
    print(f"  grc tlg012 -> {grc.name} ({grc.stat().st_size} B)")

    raw = _get(ADELAIDE)
    # Drop the leading matter (title page + Table of Contents) and the trailing
    # Adelaide colophon, so only the five Book regions remain.
    start = raw.find("<h3>Book I</h3>")
    if start < 0:
        print("  ERROR: '<h3>Book I</h3>' not found in Adelaide page")
        return
    foot = raw.find("This web edition published by", start)
    body = raw[start: foot if foot > 0 else len(raw)]

    # Split on the book headings; re.split keeps the captured roman numeral.
    parts = re.split(r"<h3>Book ([IVX]+)</h3>", body)
    # parts[0] is empty (body starts with the first heading); then (roman, content) pairs.
    ddir = SOURCES / "ga-platt"
    ddir.mkdir(exist_ok=True)
    written = 0
    for i in range(1, len(parts), 2):
        roman, content = parts[i], parts[i + 1]
        n = _ROMAN.index(roman) + 1
        (ddir / f"book-{n:02d}.html").write_text(
            f"<h3>Book {roman}</h3>{content}", encoding="utf-8")
        written += 1
    print(f"  GA: {written} Platt book files (eBooks@Adelaide) in ga-platt/")


if __name__ == "__main__":
    sys.exit(main())
