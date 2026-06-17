"""Turn verifier phrases into aligner overrides (chapter-grouped, monotonic).

For each chapter, place the verifier's verbatim phrases in Bekker order, each at
or after the previous placement (falling back to the occurrence nearest Method
A's guess, then to shorter prefixes). Records offsets as overrides so a second
`align --provider gloss` pass re-places every tick and re-interpolates.
Usage: uv run python build/verify_to_offsets.py <book>
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align.reference import default_target

BOOK = int(sys.argv[1])
vid, ross = default_target("EN")
OUT = REPO / "build/align/verify_out/EN"
META = json.loads((REPO / "build/align/verify_meta.json").read_text())
OVR_PATH = REPO / "build/align" / f"EN_{vid}_gloss_overrides.json"
overrides = json.loads(OVR_PATH.read_text()) if OVR_PATH.exists() else {}

_CIT = re.compile(r"(\d+[ab])(\d+)")


def cit_key(cit):
    m = _CIT.match(cit)
    return (m.group(1), int(m.group(2))) if m else (cit, 0)


def find_from(text, phrase, start):
    """First occurrence of `phrase` at/after `start`, shrinking to prefixes.
    Floor is min(len, 3) words so short verifier phrases (e.g. a 3-word
    'with being happy') are still searched, not silently dropped."""
    words = phrase.split()
    for k in range(len(words), min(len(words), 3) - 1, -1):
        i = text.find(" ".join(words[:k]), start)
        if i != -1:
            return i
    return None


def find_nearest(text, phrase, near):
    words = phrase.split()
    for k in range(len(words), min(len(words), 3) - 1, -1):
        sub = " ".join(words[:k])
        i, best = text.find(sub), None
        while i != -1:
            if best is None or abs(i - near) < abs(best - near):
                best = i
            i = text.find(sub, i + 1)
        if best is not None:
            return best
    return None


# Group this book's ticks by chapter.
by_chap = defaultdict(list)
for key, m in META.items():
    chap, cit = key.split("|")
    b, cp = (int(x) for x in chap.split(":"))
    if b == BOOK:
        by_chap[(b, cp)].append((cit, m["a_offset"]))

placed = missing = 0
for (b, cp), ticks in by_chap.items():
    text = ross.get((b, cp), "")
    f = OUT / f"{b}-{cp}.json"
    phrases = json.loads(f.read_text()) if f.exists() else {}
    cursor = 0
    for cit, a_off in sorted(ticks, key=lambda t: cit_key(t[0])):
        phrase = (phrases.get(cit) or "").strip()
        if not phrase:
            missing += 1
            continue
        off = find_from(text, phrase, cursor)          # monotonic forward
        if off is None:
            off = find_nearest(text, phrase, a_off)     # else nearest A's guess
        if off is None:
            missing += 1
            continue
        overrides.setdefault(f"{b}:{cp}", {})[cit] = off
        cursor = off
        placed += 1

OVR_PATH.write_text(json.dumps(overrides, indent=1), encoding="utf-8")
print(f"book {BOOK}: {placed} overrides written, {missing} unplaced")
