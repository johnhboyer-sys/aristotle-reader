"""Pipeline CLI: python -m aristotle_pipeline <stage> [...]"""

from __future__ import annotations

import argparse
import json
import sys

from .config import BUILD_DIR, Manifest


def main(argv=None):
    parser = argparse.ArgumentParser(prog="aristotle_pipeline")
    parser.add_argument("stage", choices=["stage1", "stage2", "stage3", "stage4"])
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

    elif args.stage == "stage2":
        from . import stage2_validate

        md_path = stage2_validate.run(manifest)
        report = json.loads(
            (BUILD_DIR / "stage2" / "validation_report.json").read_text()
        )
        print(f"report: {md_path}")
        for name, check in report["checks"].items():
            print(f"  {name}: {'ok' if check['ok'] else 'FAIL'}")
        print(f"overall: {'PASS' if report['ok'] else 'FAIL'}")

    elif args.stage == "stage3":
        from . import stage3_tokenize

        out = stage3_tokenize.run(manifest)
        tokens = json.loads(out.read_text(encoding="utf-8"))
        n = sum(
            len(l["tokens"]) for s in tokens["segments"] for l in s["lines"]
        )
        sigla = json.loads((BUILD_DIR / "stage3" / "sigla_log.json").read_text())
        failures = json.loads((BUILD_DIR / "stage3" / "key_failures.json").read_text())
        print(f"tokens: {out}")
        print(f"  tokens={n} sigla_strips={len(sigla)} key_failures={len(failures)}")
        for fail in failures[:10]:
            print(f"  FAIL {fail['ref']}: {fail['token']} — {fail['error']}")

    elif args.stage == "stage4":
        from . import stage4_morphology

        out = stage4_morphology.run(manifest)
        summary = json.loads((BUILD_DIR / "stage4" / "summary.json").read_text())
        print(f"analyses: {out}")
        for k, v in summary.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    sys.exit(main())
