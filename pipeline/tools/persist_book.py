"""Persist a finished book's alignment to the tracked results dir + render HTML.
Usage: uv run python build/persist_book.py <book>
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
WORK = os.environ.get("WORK", "EN")
vid, _ = default_target(WORK)
RES = REPO / "alignment-results" / vid
for sub in ("maps", "glosses", "review"):
    (RES / sub).mkdir(parents=True, exist_ok=True)

amap = json.loads((REPO / "build/align" / f"{WORK}_{vid}_gloss_map.json").read_text())
book_map = {k: v for k, v in amap.items() if int(k.split(":")[0]) == BOOK}
(RES / "maps" / f"book-{BOOK:02d}.json").write_text(
    json.dumps(book_map, ensure_ascii=False, indent=1), encoding="utf-8")

for g in sorted((REPO / "build/align/glosses" / WORK).glob(f"{BOOK}-*.json")):
    shutil.copy(g, RES / "glosses" / g.name)

html = write_html(WORK, [BOOK])
shutil.copy(html, RES / "review" / f"book-{BOOK:02d}.html")

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
print(f"  saved -> alignment-results/{vid}/{{maps,glosses,review}}/book-{BOOK:02d}.*")
