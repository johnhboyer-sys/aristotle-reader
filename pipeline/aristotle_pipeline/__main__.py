"""Pipeline CLI: python -m aristotle_pipeline <stage> [...]"""

from __future__ import annotations

import argparse
import json
import sys

from .config import BUILD_DIR, Manifest


def main(argv=None):
    parser = argparse.ArgumentParser(prog="aristotle_pipeline")
    parser.add_argument("stage", choices=["stage1"])
    args = parser.parse_args(argv)
    manifest = Manifest.load()

    if args.stage == "stage1":
        from . import stage1_english, stage1_greek

        spine_path = stage1_greek.run(manifest)
        spine = json.loads(spine_path.read_text(encoding="utf-8"))
        eng_path, align_path = stage1_english.run(manifest, spine)
        n_lines = sum(len(s["lines"]) for s in spine["segments"])
        print(f"greek spine : {spine_path}")
        print(f"  segments={len(spine['segments'])} lines={n_lines} "
              f"unassigned={len(spine['unassigned_lines'])}")
        eng = json.loads(eng_path.read_text(encoding="utf-8"))
        print(f"english     : {eng_path}")
        print(f"  chunks={len(eng['chunks'])}")
        align = json.loads(align_path.read_text(encoding="utf-8"))
        unmatched = [p["segment"] for p in align["pairs"] if p["english"] is None]
        print(f"alignment   : {align_path}")
        print(f"  pairs={len(align['pairs'])} unmatched={len(unmatched)} "
              f"english_only={len(align['english_only'])}")
        if unmatched:
            print(f"  unmatched segments: {unmatched[:10]}")


if __name__ == "__main__":
    sys.exit(main())
