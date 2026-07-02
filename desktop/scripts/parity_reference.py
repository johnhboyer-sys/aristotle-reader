"""Reference driver for the TS aligner parity harness.

Reads a chapter-inputs fixture (produced by scripts/parity.mjs from dist
data), runs the REAL Python aligner (align_chapter, lexical backend) on each
chapter, and writes the resulting anchors. The TS port must reproduce these
outputs on the same inputs — that is the port's correctness proof.

Run from pipeline/ so aristotle_pipeline imports resolve:
    uv run python ../desktop/scripts/parity_reference.py <fixture.json> <out.json>
"""

import json
import sys
from pathlib import Path
from dataclasses import asdict

# The pipeline is a path-based package (no build backend), importable from the
# pipeline/ directory only — put it on sys.path relative to this script.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))

from aristotle_pipeline.align.aligner import align_chapter, check_roundtrip
from aristotle_pipeline.align.reference import ChapterRef, GreekLine, RefAnchor


def main(fixture_path: str, out_path: str) -> None:
    fixture = json.loads(open(fixture_path, encoding="utf-8").read())
    out = {}
    for ch in fixture["chapters"]:
        ref = ChapterRef(
            book=ch["book"],
            chapter=str(ch["chapter"]),
            citation=ch["citation"],
            ross_text=ch["targetText"],
            ref_text=ch["refText"],
            ref_anchors=[RefAnchor(a["citation"], a["off"], a["tier"]) for a in ch["refAnchors"]],
            greek_lines=[GreekLine(g["citation"], g["cumWords"]) for g in ch["greekLines"]],
        )
        anchors = align_chapter(ref, backend="lexical", overrides=None)
        check_roundtrip(ref, anchors)
        out[f"{ch['book']}:{ch['chapter']}"] = [asdict(a) for a in anchors]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"aligned {len(out)} chapters -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
