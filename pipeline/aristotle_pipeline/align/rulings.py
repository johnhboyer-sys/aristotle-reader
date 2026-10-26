"""John's review rulings, applied by every gloss-aligner pass 2.

Committed per work at alignment-results/<vid>/rulings/<WORK>.json (written by
tools/apply_review.py from the review pages' JSON export):

    {"<book>:<chapter>": {"<citation>": {"verdict": "ok" | "early" | "late",
                                        "phrase": "<verbatim text the tick starts at>",
                                        "near": <offset when ruled>,
                                        "before": "<the words before it>",
                                        "from_start": <true if those reach the chapter start>,
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


def _pattern(phrase: str, word_start: bool = False) -> re.Pattern | None:
    """`phrase` whitespace-insensitive (the review page flattens line breaks)."""
    body = r"\s+".join(re.escape(w) for w in phrase.split())
    return re.compile((r"(?<!\S)" if word_start else "") + body) if body else None


def _hits(text: str, phrase: str, word_start: bool = False) -> list[int]:
    pat = _pattern(phrase, word_start)
    return [m.start() for m in pat.finditer(text)] if pat else []


def _tail(text: str, off: int, n: int) -> str:
    return " ".join(text[max(0, off - 3 * n):off].split())[-n:]


def context(text: str, off: int, phrase: str | None = None, n: int = 40) -> str:
    """The words just before `off`, whitespace-collapsed: what tells a ruling's
    copy of a repeated phrase from the others when text around it shifts.
    Lengthened until no other copy of `phrase` has the same lead-in, so an edit
    to this copy's lead-in can only fail to match, never match another copy."""
    others = [h for h in _hits(text, phrase) if h != off] if phrase else []
    while n < off and any(_tail(text, h, n) == _tail(text, off, n) for h in others):
        n += 40
    return _tail(text, off, n)


def ruling_context(text: str, off: int, phrase: str) -> dict:
    """{"before", "from_start"} for a ruling at `off`. A context that reaches the
    chapter start is the whole prefix, which is also the tail of any later copy
    sharing it; `from_start` makes locate require it exactly."""
    before = context(text, off, phrase)
    return {"before": before, "from_start": before == " ".join(text[:off].split())}


def locate(text: str, phrase: str, near: int, before: str | None = None,
           from_start: bool = False) -> int | None:
    """Offset of `phrase` in `text`. Of several copies, the one preceded by
    `before` (exactly the whole prefix, if `from_start`); failing that
    information, the one nearest `near`. Several copies of which none is so
    preceded is unresolvable: None."""
    hits = _hits(text, phrase)
    if len(hits) > 1 and from_start:
        hits = [h for h in hits if " ".join(text[:h].split()) == before]
    elif len(hits) > 1 and before:
        hits = [h for h in hits if " ".join(text[max(0, h - 3 * len(before)):h].split()).endswith(before)]
    return min(hits, key=lambda h: abs(h - near)) if hits else None


def place_click(text: str, phrase: str, shown_from: int, shown_to: int, at: int | None = None) -> int:
    """Where a clicked phrase starts. Pages rendered since 2026-10-25 export the
    click's offset (`at`): it must lie in the shown passage and hold the phrase.
    Older pages export only the text: the click is then the one copy starting
    a word inside text[shown_from:shown_to]; none, or several, is refused."""
    if at is not None:
        pat = _pattern(phrase)
        if pat and shown_from <= at < shown_to and pat.match(text, at):
            return at
        raise ValueError("the click's recorded position does not hold the clicked phrase")
    inside = [h for h in _hits(text, phrase, word_start=True) if shown_from <= h < shown_to]
    if len(inside) != 1:
        raise ValueError(f"clicked phrase found {len(inside)} times in the passage the page showed")
    return inside[0]


def bekker_key(citation: str) -> tuple:
    """Reading order: 1239b5 before 1239b10 (not the text order of the strings)."""
    m = re.match(r"^(\d+)([ab])(\d+)$", citation)
    return (int(m.group(1)), m.group(2), int(m.group(3))) if m else (0, "", 0)


def offsets(rul: dict, prose: dict[tuple[int, int], str]) -> dict[str, dict[str, int]]:
    """{"b:c": {citation: offset}} for every ruling that pins a place. A pinned
    phrase no longer in its chapter's text, or whose own copy can no longer be
    told from another, is an error, named, never skipped or guessed."""
    out: dict[str, dict[str, int]] = {}
    lost = []
    for chap, ticks in rul.items():
        b, c = (int(x) for x in chap.split(":"))
        text = prose.get((b, c), "")
        for cit, r in ticks.items():
            if not r.get("phrase"):
                continue
            off = locate(text, r["phrase"], r.get("near", 0), r.get("before"), r.get("from_start", False))
            if off is None:
                lost.append(f"{chap} {cit}")
            else:
                out.setdefault(chap, {})[cit] = off
    if lost:
        raise ValueError(f"rulings whose phrase is no longer in the text: {lost}")
    return out
