"""Vendor sources for Parts of Animals (De Partibus Animalium) into ../sources/.

Two components:
  * the First1KGreek grc1 TEI -> sources/tlg0086.tlg030.1st1K-grc1.xml
    (its subtype="chapter" divs are text-aligned onto the Diogenes spine)
  * William Ogle's English from LacusCurtius/Penelope (U. Chicago), one page per
    book -> sources/pa-ogle/book-0N.html

Penelope's Ogle carries the modern Bekker chapter division (5/17/15/14), which
matches the First1KGreek Greek chapters book-for-book — unlike the MIT archive's
older 5/14/14/10 numbering. Each chapter begins with <p class="chapter">N</p>,
which stage1's "number" marker reads as a standalone chapter line. Book I omits
the marker on its first chapter (the prose follows the "Book I" heading
directly), so we inject a <p class="chapter">1</p> there to match Books II-IV.
"""

from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

SOURCES = Path(__file__).resolve().parents[2] / "sources"
F1K = ("https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/"
       "master/data/tlg0086/tlg030/tlg0086.tlg030.1st1K-grc1.xml")
PENELOPE = "https://penelope.uchicago.edu/aristotle/parts{n}.html"


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "aristotle-reader/fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def main() -> None:
    grc = SOURCES / "tlg0086.tlg030.1st1K-grc1.xml"
    if not grc.exists():
        grc.write_text(_get(F1K), encoding="utf-8")
    print(f"  grc tlg030 -> {grc.name} ({grc.stat().st_size} B)")

    ddir = SOURCES / "pa-ogle"
    ddir.mkdir(exist_ok=True)
    for n in range(1, 5):
        raw = _get(PENELOPE.format(n=n))
        # Drop the page running-header (a repeated "Book N" + chapter marker that
        # some pages, e.g. Book II, emit between the rule and the first anchored
        # content) so it doesn't leak into chapter 1's prose.
        raw = re.sub(r'(<HR>\s*).*?(<a name="1"></a>)', r"\1\2", raw,
                     count=1, flags=re.S | re.I)
        # Drop the footer (a "Book I … Book IV" nav table + accessibility links)
        # so it doesn't trail into the last chapter's prose.
        raw = re.sub(r'(<HR>\s*)?<div class="center">.*', "", raw,
                     flags=re.S | re.I)
        if n == 1:
            # Book I's first chapter has no <p class="chapter"> marker; inject one
            # after the "Book I" heading so the parser starts at chapter 1.
            raw, k = re.subn(
                r'(<p class="book">.*?</[pP]>)',
                r'\1\n<p class="chapter">1</p>',
                raw, count=1, flags=re.S | re.I,
            )
            if not k:
                print("  WARNING: book I chapter-1 marker not injected")
        (ddir / f"book-{n:02d}.html").write_text(raw, encoding="utf-8")
    print(f"  PA: 4 Ogle book files (Penelope) in pa-ogle/")


if __name__ == "__main__":
    sys.exit(main())
