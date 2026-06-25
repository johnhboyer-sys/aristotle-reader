"""Apply the spurious-parse filter to already-built analyses.json artifacts.

Stage 7 now filters parses at emit time (see aristotle_pipeline.parse_filter),
but the committed build/dist/<WORK>/analyses.json files were generated before
that. Regenerating them needs the ~115 MB Diogenes Morpheus source, which only
lives on the build machine. This script applies the identical filter directly to
the existing artifacts so the fix ships without a full pipeline rerun.

Idempotent: re-running drops nothing further. Run from the repo root:

    python pipeline/tools/apply_parse_filter.py            # all works
    python pipeline/tools/apply_parse_filter.py EN Pol     # specific works
    python pipeline/tools/apply_parse_filter.py --dry-run  # report only
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))

from aristotle_pipeline.parse_filter import filter_parses  # noqa: E402

DIST = Path(__file__).resolve().parents[2] / "build" / "dist"


def main(argv: list[str]) -> int:
    dry = "--dry-run" in argv
    works = [a for a in argv if not a.startswith("--")]

    files = (
        [DIST / w / "analyses.json" for w in works]
        if works
        else sorted(DIST.glob("*/analyses.json"))
    )

    grand_before = grand_after = 0
    for f in files:
        if not f.exists():
            print(f"  SKIP  {f} (not found)")
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        before = after = 0
        for key, parses in data.items():
            before += len(parses)
            kept = filter_parses(parses)
            after += len(kept)
            data[key] = kept
        dropped = before - after
        grand_before += before
        grand_after += after
        tag = "(dry-run) " if dry else ""
        print(f"  {tag}{f.parent.name:8} {before:7} -> {after:7}  dropped {dropped}")
        if not dry and dropped:
            f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    print(
        f"\nTOTAL {grand_before} -> {grand_after}  dropped {grand_before - grand_after}"
        + (" (dry-run, nothing written)" if dry else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
