"""Pipeline CLI: python -m aristotle_pipeline <stage>|all"""

from __future__ import annotations

import argparse
import json
import sys

from .config import BUILD_DIR, Manifest


def _stage1(manifest):
    from . import stage1_english, stage1_greek, stage1_ross

    spine_path = stage1_greek.run(manifest)
    spine = json.loads(spine_path.read_text(encoding="utf-8"))
    # Chapter heading lines come from the English TEI milestones by default, but
    # if the manifest declares a grc TEI we text-align chapter incipits onto the
    # Greek spine (exact line + in-line word index) and override — fixes headings
    # that the milestone interpolation placed on the wrong line / mid-line.
    override = None
    chapters_cfg = manifest.data.get("chapters", {})
    if chapters_cfg.get("grc_tei"):
        from . import stage1_chapters
        override = stage1_chapters.extract_chapters_grc(
            spine, chapters_cfg["grc_tei"],
            chapters_cfg.get("chapter_subtype", "chapter"),
            chapters_cfg.get("book_subtype", "book"),
        )
        print(f"  chapters: {len(override)} (grc-aligned, overriding milestones)")
    eng_path, align_path = stage1_english.run(manifest, spine, override)
    english = json.loads(eng_path.read_text(encoding="utf-8"))
    # Align the unmarked Ross translation onto the spine (Rackham as reference,
    # zero-dep lexical backend) so Ross gets real Bekker ticks, not just
    # interpolation. Writes build/align/<work>_ross_map.json, read by stage1_ross.
    from .align import align as run_align
    asum = run_align(manifest.work_id, "ross", "lexical")
    print(f"  align(ross): {asum['anchors']} anchors {asum['tiers']} "
          f"({asum['review']} flagged)")
    ross_path = stage1_ross.run(manifest, spine, english)
    ross = json.loads(ross_path.read_text(encoding="utf-8"))
    print(f"  ross: segments_with_text={len(ross)} "
          f"pieces={sum(len(v) for v in ross.values())}")
    n_lines = sum(len(s["lines"]) for s in spine["segments"])
    print(f"stage1: segments={len(spine['segments'])} lines={n_lines} "
          f"unassigned={len(spine['unassigned_lines'])}")
    align = json.loads(align_path.read_text(encoding="utf-8"))
    unmatched = [p["segment"] for p in align["pairs"] if p["english"] is None]
    print(f"  alignment pairs={len(align['pairs'])} unmatched={len(unmatched)} "
          f"english_only={len(align['english_only'])}")
    if unmatched:
        print(f"  unmatched segments: {unmatched[:10]}")


def _stage2(manifest):
    from . import stage2_validate

    stage2_validate.run(manifest)
    report = json.loads(
        (BUILD_DIR / "stage2" / "validation_report.json").read_text()
    )
    checks = " ".join(
        f"{name}={'ok' if c['ok'] else 'FAIL'}" for name, c in report["checks"].items()
    )
    print(f"stage2: {checks}")
    print(f"  overall: {'PASS' if report['ok'] else 'FAIL'}")
    if not report["ok"]:
        raise SystemExit("stage2 validation failed")


def _stage3(manifest):
    from . import stage3_tokenize

    out = stage3_tokenize.run(manifest)
    tokens = json.loads(out.read_text(encoding="utf-8"))
    n = sum(len(l["tokens"]) for s in tokens["segments"] for l in s["lines"])
    sigla = json.loads((BUILD_DIR / "stage3" / "sigla_log.json").read_text())
    failures = json.loads((BUILD_DIR / "stage3" / "key_failures.json").read_text())
    print(f"stage3: tokens={n} sigla_strips={len(sigla)} key_failures={len(failures)}")
    for fail in failures[:10]:
        print(f"  FAIL {fail['ref']}: {fail['token']} — {fail['error']}")


def _stage4(manifest):
    from . import stage4_morphology

    stage4_morphology.run(manifest)
    summary = json.loads((BUILD_DIR / "stage4" / "summary.json").read_text())
    print("stage4: " + " ".join(f"{k}={v}" for k, v in summary.items()))


def _stage5(manifest):
    from . import stage5_lsj

    out_dir = stage5_lsj.run(manifest)
    summary = json.loads((out_dir / "summary.json").read_text())
    print("stage5: " + " ".join(f"{k}={v}" for k, v in summary.items()))


def _stage6(manifest):
    from . import stage6_search

    out_dir = stage6_search.run(manifest)
    summary = json.loads((out_dir / "summary.json").read_text())
    print("stage6: " + " ".join(f"{k}={v}" for k, v in summary.items()))


def _stage7(manifest):
    from . import stage7_emit

    out_dir = stage7_emit.run(manifest)
    man = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    print(f"stage7: {out_dir}")
    print(f"  books={len(man['books'])} token_keys={man['analyses']['token_keys']} "
          f"lsj_entries={man['lsj']['lsj_entries_kept']}")


_STAGES = {
    "stage1": _stage1,
    "stage2": _stage2,
    "stage3": _stage3,
    "stage4": _stage4,
    "stage5": _stage5,
    "stage6": _stage6,
    "stage7": _stage7,
}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="aristotle_pipeline")
    parser.add_argument("stage", choices=[*_STAGES, "all"])
    args = parser.parse_args(argv)
    manifest = Manifest.load()
    if args.stage == "all":
        for fn in _STAGES.values():
            fn(manifest)
    else:
        _STAGES[args.stage](manifest)


if __name__ == "__main__":
    sys.exit(main())
