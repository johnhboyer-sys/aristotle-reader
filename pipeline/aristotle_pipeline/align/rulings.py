"""John's review rulings, applied by every gloss-aligner pass 2.

Committed per work at alignment-results/<vid>/rulings/<WORK>.json (written by
tools/apply_review.py from the review pages' JSON export):

    {"<book>:<chapter>": {"<citation>": {"verdict": "ok" | "early" | "late",
                                        "phrase": "<verbatim text the tick starts at>",
                                        "near": <offset when ruled>,
                                        "export": "<export file it came from>"}}}

A ruling with a phrase pins its tick there, word-exact, on every re-run; one
without (early/late with no word clicked) is on record but places nothing.
Chapter-start ticks are never ruled: the Greek fixes them.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ..config import REPO_ROOT


def path(work_id: str, version_id: str, root: Path = REPO_ROOT) -> Path:
    return root / "alignment-results" / version_id / "rulings" / f"{work_id}.json"


def load(work_id: str, version_id: str, root: Path = REPO_ROOT) -> dict:
    p = path(work_id, version_id, root)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _hits(text: str, phrase: str) -> list[int]:
    """Every offset of `phrase` in `text`, whitespace-insensitive (the review
    page flattens line breaks)."""
    pattern = r"\s+".join(re.escape(w) for w in phrase.split())
    return [m.start() for m in re.finditer(pattern, text)] if pattern else []


def locate(text: str, phrase: str, near: int) -> int | None:
    """Offset of `phrase` in `text`; of several copies, the one nearest `near`."""
    hits = _hits(text, phrase)
    return min(hits, key=lambda h: abs(h - near)) if hits else None


def place_click(text: str, phrase: str, shown_from: int, shown_to: int) -> int:
    """Where a clicked phrase starts: the export carries the text, not its
    position, but the page showed only text[shown_from:shown_to], so the click
    is the one copy starting there. None, or more than one, is refused."""
    inside = [h for h in _hits(text, phrase) if shown_from <= h < shown_to]
    if len(inside) != 1:
        raise ValueError(f"clicked phrase found {len(inside)} times in the passage the page showed")
    return inside[0]


def offsets(rul: dict, prose: dict[tuple[int, int], str]) -> dict[str, dict[str, int]]:
    """{"b:c": {citation: offset}} for every ruling that pins a place. A pinned
    phrase no longer in its chapter's text is an error, named, never skipped."""
    out: dict[str, dict[str, int]] = {}
    lost = []
    for chap, ticks in rul.items():
        b, c = (int(x) for x in chap.split(":"))
        text = prose.get((b, c), "")
        for cit, r in ticks.items():
            if not r.get("phrase"):
                continue
            off = locate(text, r["phrase"], r.get("near", 0))
            if off is None:
                lost.append(f"{chap} {cit}")
            else:
                out.setdefault(chap, {})[cit] = off
    if lost:
        raise ValueError(f"rulings whose phrase is no longer in the text: {lost}")
    return out
