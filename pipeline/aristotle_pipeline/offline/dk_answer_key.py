"""Ground truth from the classical-philosophy-reader's fragment frames.

That sibling ships the Presocratics as <author>-fragments works whose
segments carry the quoting-source frame as a negative-numbered greek line
("ARISTOT. Metaph. B 4. 1000b 12 ...") and the DK number as the segment
column (B30). Frames citing Aristotle are therefore a curated answer key for
the quotation matcher: extract_key() lists every attested site, and
annotate_candidates() stamps matching matcher candidates with their DK
citation so the curator sees "attested: Empedocles fr. 30 DK" instead of a
bare guess. Validated 2026-08-19: the Meta pilot found all 5 known
Metaphysics sites at the exact Bekker columns.

Sibling repo path is machine-local; a missing checkout raises (pipeline
tooling assumes its environment).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SIBLING_DIST = Path.home() / "Developer" / "classical-philosophy-reader" / "build" / "dist"

_ARISTOTLE = re.compile(r"ARISTOT", re.IGNORECASE)
_BEKKER = re.compile(r"(\d{2,4})\s*([ab])\s*(\d+)?")


def extract_key(dist: Path = SIBLING_DIST) -> list[dict]:
    """Every fragment whose frame cites Aristotle: [{author, dk, frame, sites}]."""
    if not dist.is_dir():
        raise FileNotFoundError(dist)
    key: list[dict] = []
    for work_dir in sorted(dist.glob("*-fragments")):
        author = work_dir.name.removesuffix("-fragments")
        for book in sorted(work_dir.glob("book-*.json")):
            data = json.loads(book.read_text(encoding="utf-8"))
            for seg in data.get("segments", []):
                for line in seg.get("greek", []):
                    text = line.get("text", "")
                    if line.get("n", 0) < 0 and _ARISTOTLE.search(text):
                        sites = [
                            f"{m.group(1)}{m.group(2)}"
                            for m in _BEKKER.finditer(text)
                        ]
                        key.append({
                            "author": author,
                            "dk": seg.get("column", ""),
                            "frame": text[:160],
                            "sites": sites,
                        })
    if not key:
        raise ValueError(f"no Aristotle frames found under {dist}")
    return key


def _fragment_number(source_loc: str) -> str:
    """'109' from '109', '7' from '7,8', '15a' from '15a'."""
    match = re.match(r"(\d+[a-z]?)", (source_loc or "").strip())
    return match.group(1) if match else ""


def annotate_candidates(candidates: list[dict], key: list[dict]) -> int:
    """Stamp candidates matching an attested site with their DK citation.

    A candidate matches only when BOTH agree: the keyed fragment's frame
    cites the candidate's Bekker column, AND the candidate actually matched
    that fragment's text (its source_loc fragment number equals the DK
    number). Column alone once blurred cites across rows sharing a column —
    the B109 match at 1000b wore B30's citation.
    """
    by_author: dict[str, list[dict]] = {}
    for entry in key:
        by_author.setdefault(entry["author"], []).append(entry)
    stamped = 0
    for cand in candidates:
        author = cand.get("source_author", "").lower()
        fragment = _fragment_number(cand.get("source_loc", ""))
        for entry in by_author.get(author, []):
            if (
                cand.get("column") in entry["sites"]
                and fragment
                and entry["dk"].lstrip("AB") == fragment
            ):
                cand["dk"] = f"{author.capitalize()} fr. {fragment} DK"
                stamped += 1
                break
    return stamped


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", type=Path, help="candidates JSON to annotate in place")
    parser.add_argument("--dist", type=Path, default=SIBLING_DIST)
    args = parser.parse_args(argv)

    key = extract_key(args.dist)
    print(f"answer key: {len(key)} Aristotle-framed fragments")
    if args.candidates:
        candidates = json.loads(args.candidates.read_text(encoding="utf-8"))
        stamped = annotate_candidates(candidates, key)
        args.candidates.write_text(
            json.dumps(candidates, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )
        print(f"stamped {stamped} candidates in {args.candidates}")


if __name__ == "__main__":
    main()
