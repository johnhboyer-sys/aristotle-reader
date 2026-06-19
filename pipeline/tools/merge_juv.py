"""Build the combined 'On Youth, Old Age, Life and Death, and Respiration'
sources by splicing De juventute (tlg018) + De respiratione (tlg037), which the
TLG/First1KGreek carry as two separate works but which are traditionally one
treatise (and one continuous Stocks/Ross translation, Parts 1-27).

Emits:
  * build/export/Diogenes-Resources/xml/tlg/tlg0086918.xml — the Greek spine:
    018's Bekker pages (467b-470b lines 1-5) then 037's (470b line 6 - 480b),
    the shared 470b column merged into one div.
  * sources/tlg0086.tlg918.1st1K-grc1.xml — chapter structure: 018's chapters
    1-6 followed by 037's chapters renumbered 7-27, so the grc chapter labels
    line up with the English Parts 1-27.

918 is an unused work number; Juv.yaml points tlg_work/grc_tei at these files.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / "build/export/Diogenes-Resources/xml/tlg"
SRC = ROOT / "sources"

PAGE470B = '<div type="Bekker-page" n="470b">'


def merge_spine() -> None:
    t018 = (EXPORT / "tlg0086018.xml").read_text(encoding="utf-8")
    t037 = (EXPORT / "tlg0086037.xml").read_text(encoding="utf-8")
    # 018: header + pages up to the 470b open tag, then 470b inner (lines 1-5).
    head, _, rest018 = t018.partition(PAGE470B)
    b018_inner = rest018.split("</div>", 1)[0]
    # 037: drop everything up to its 470b open tag; keep 470b inner (lines 6+)
    # and all following pages (471a-480b) + the closing body/text/TEI.
    _, _, rest037 = t037.partition(PAGE470B)
    b037_inner, after037 = rest037.split("</div>", 1)
    merged = head + PAGE470B + b018_inner + b037_inner + "</div>" + after037
    merged = merged.replace("work number 018", "work numbers 018+037")
    (EXPORT / "tlg0086918.xml").write_text(merged, encoding="utf-8")
    print(f"  spine -> tlg0086918.xml ({len(merged)} B)")


def merge_grc() -> None:
    g018 = (SRC / "tlg0086.tlg018.1st1K-grc1.xml").read_text(encoding="utf-8")
    g037 = (SRC / "tlg0086.tlg037.1st1K-grc1.xml").read_text(encoding="utf-8")
    # 037's chapter block: from its first chapter div to the edition div's close.
    first = g037.index('<div type="textpart" subtype="chapter" n="1">')
    body037 = g037[first:]
    block037 = body037.rpartition("</div>")[0].rpartition("</div>")[0] + "</div>"
    # renumber chapter n K -> K+6 (descending so substitutions don't compound).
    for k in range(21, 0, -1):
        block037 = block037.replace(
            f'subtype="chapter" n="{k}">', f'subtype="chapter" n="{k + 6}">')
    # insert 037's chapters just before 018's edition div closes (its last
    # </div> before </body>).
    head, _, tail = g018.rpartition("</body>")
    pre_body, _, edition_close_ws = head.rpartition("</div>")
    merged = pre_body + block037 + "</div>" + edition_close_ws + "</body>" + tail
    (SRC / "tlg0086.tlg918.1st1K-grc1.xml").write_text(merged, encoding="utf-8")
    n = len(re.findall(r'subtype="chapter"', merged))
    print(f"  grc   -> tlg0086.tlg918.1st1K-grc1.xml ({n} chapter divs)")


if __name__ == "__main__":
    merge_spine()
    merge_grc()
