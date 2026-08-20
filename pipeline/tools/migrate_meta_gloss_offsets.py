"""Remap Meta Ross gloss-map offsets after strip_quote_repeats.

The MIT archive transcription of Ross's Metaphysics repeats a `"` at every
paragraph and verse start. `parse_book(..., strip_quote_repeats=True)` now
drops those marks, which shortens each chapter and shifts every stored
alignment-map `offset`. This one-shot remaps `alignment-results/ross/Meta_ross_gloss_map.json`
via SequenceMatcher from the old (flag off) text onto the new (flag on) text.

Idempotent: if every chapter's `ross_len` already matches the new parse,
prints "already migrated" and exits 0 without writing.

Usage (from pipeline/):
    uv run python tools/migrate_meta_gloss_offsets.py
"""
from __future__ import annotations

import difflib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aristotle_pipeline.config import REPO_ROOT, SOURCES_DIR
from aristotle_pipeline.stage1_ross import parse_translation

MAP_PATH = REPO_ROOT / "alignment-results" / "ross" / "Meta_ross_gloss_map.json"
_OK = set('" \t\n\r')


def _map_offset(offset: int, opcodes, old_len: int, new_len: int) -> int:
    """Map a char offset in old text onto new text via SequenceMatcher opcodes."""
    if offset >= old_len:
        return new_len
    for tag, i1, i2, j1, j2 in opcodes:
        if i1 <= offset < i2:
            if tag == "equal":
                return j1 + (offset - i1)
            # delete / replace: inside a deleted region → region's start in new
            return j1
    return new_len


def _opcodes(old: str, new: str):
    # autojunk=False: at chapter length, the default heuristic treats space as
    # junk (~1% of a 200+ char sequence) and yields replace regions that mix
    # quotes with real words.
    sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
    opcodes = sm.get_opcodes()
    for tag, i1, i2, j1, j2 in opcodes:
        if tag not in ("delete", "replace"):
            continue
        old_region = old[i1:i2]
        new_region = new[j1:j2] if tag == "replace" else ""
        if any(ch not in _OK for ch in old_region) or any(ch not in _OK for ch in new_region):
            raise SystemExit(
                f"unexpected {tag} region {i1}:{i2}->{j1}:{j2}: "
                f"old={old_region!r} new={new_region!r}"
            )
    return opcodes


def main() -> int:
    old = parse_translation(SOURCES_DIR / "meta-ross", 14, "part",
                            strip_quote_repeats=False)
    new = parse_translation(SOURCES_DIR / "meta-ross", 14, "part",
                            strip_quote_repeats=True)
    data = json.loads(MAP_PATH.read_text(encoding="utf-8"))

    new_lens = {}
    for key in data:
        book, chap = (int(x) for x in key.split(":"))
        if (book, chap) not in new:
            raise SystemExit(f"{key}: not in new parse")
        new_lens[key] = len(new[(book, chap)])

    if all(data[key]["ross_len"] == new_lens[key] for key in data):
        print("already migrated")
        return 0

    mismatches = []
    trailing = []
    for key in data:
        book, chap = (int(x) for x in key.split(":"))
        old_text = old.get((book, chap))
        if old_text is None:
            mismatches.append(f"{key}: not in old parse")
            continue
        got, want = data[key]["ross_len"], len(old_text)
        max_off = max((a["offset"] for a in data[key]["anchors"]), default=0)
        if got == want:
            if max_off > want:
                mismatches.append(f"{key}: offset {max_off} past old_len {want}")
            continue
        # The stored map predates two trailing-only parser drifts (a chapter-final
        # newline on most chapters; 32–40 chars of leftover/stripped nav on most
        # book-final chapters). Offsets stay valid iff every anchor sits in the
        # shared prefix. A mismatch that would move an anchor aborts.
        shared = min(got, want)
        if max_off > shared:
            mismatches.append(
                f"{key}: ross_len={got} old_len={want} max_off={max_off} (not trailing)"
            )
        else:
            trailing.append(f"{key}: ross_len={got} old_len={want} max_off={max_off}")
    if mismatches:
        raise SystemExit("ross_len mismatch vs old parse:\n" + "\n".join(mismatches))
    if trailing:
        print(f"tolerated trailing ross_len drift on {len(trailing)} chapters")

    chapters = 0
    anchors_shifted = 0
    max_delta = 0
    for key, entry in data.items():
        book, chap = (int(x) for x in key.split(":"))
        old_text = old[(book, chap)]
        new_text = new[(book, chap)]
        opcodes = _opcodes(old_text, new_text)
        new_offsets = []
        for a in entry["anchors"]:
            old_off = a["offset"]
            new_off = _map_offset(old_off, opcodes, len(old_text), len(new_text))
            new_offsets.append(new_off)
            if new_off != old_off:
                anchors_shifted += 1
                max_delta = max(max_delta, abs(old_off - new_off))
            a["offset"] = new_off
        if any(new_offsets[i] < new_offsets[i - 1] for i in range(1, len(new_offsets))):
            raise SystemExit(f"{key}: remapped offsets are not monotonic non-decreasing")
        entry["ross_len"] = len(new_text)
        chapters += 1

    MAP_PATH.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"chapters processed: {chapters}")
    print(f"anchors shifted: {anchors_shifted}")
    print(f"max offset delta: {max_delta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
