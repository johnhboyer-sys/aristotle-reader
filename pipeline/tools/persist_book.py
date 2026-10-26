"""Persist a finished book's alignment to the tracked results dir + render HTML.
Usage: WORK=<slug> uv run python tools/persist_book.py <book>
Reads the current gloss map (single book), copies map+glosses, renders the
3-line-window review HTML, and prints per-tier / confidence stats."""
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align.gloss_review import write_html
from aristotle_pipeline.align.reference import default_target

import os

BOOK = int(sys.argv[1])
WORK = os.environ.get("WORK")
if not WORK:   # no default: a forgotten WORK= used to act on EN
    sys.exit("WORK is unset: run with WORK=<work slug>")
vid, _ = default_target(WORK)
RES = REPO / "alignment-results" / vid
# Maps, glosses and review pages are namespaced PER WORK: works sharing a
# translator vid (ross = EN + Meta + Juv + Long; forster = DM + Mech + Oec + Vent)
# have colliding book numbers, so a flat dir lets the last-persisted work clobber
# the others (this is the Juv-over-EN corruption).
for sub in ("maps", "glosses", "review"):
    (RES / sub / WORK).mkdir(parents=True, exist_ok=True)

amap = json.loads((REPO / "build/align" / f"{WORK}_{vid}_gloss_map.json").read_text())
book_map = {k: v for k, v in amap.items() if int(k.split(":")[0]) == BOOK}
(RES / "maps" / WORK / f"book-{BOOK:02d}.json").write_text(
    json.dumps(book_map, ensure_ascii=False, indent=1), encoding="utf-8")

gdir = RES / "glosses" / WORK
for g in sorted((REPO / "build/align/glosses" / WORK).glob(f"{BOOK}-*.json")):
    shutil.copy(g, gdir / g.name)

html = write_html(WORK, [BOOK])
shutil.copy(html, RES / "review" / WORK / f"book-{BOOK:02d}.html")

# stats
from collections import Counter
tiers = Counter()
conf = Counter()
for rec in book_map.values():
    for a in rec["anchors"]:
        tiers[a["tier"]] += 1
        if a["tier"] in ("column", "five_line"):
            conf[a["confidence"]] += 1
real = sum(conf.values())
print(f"book {BOOK:02d}: chapters={len(book_map)} tiers={dict(tiers)}")
print(f"  real ticks (column+five_line)={real}  by confidence={dict(conf)}")
print(f"  saved -> alignment-results/{vid}/{{maps,glosses,review}}/{WORK}/book-{BOOK:02d}.*")
