"""Pipeline CLI: python -m aristotle_pipeline <stage>|all"""

from __future__ import annotations

import argparse
import json
import sys

from .config import BUILD_DIR, Manifest


def _stage1(manifest):
    from . import stage1_greek

    spine_path = stage1_greek.run(manifest)
    spine = json.loads(spine_path.read_text(encoding="utf-8"))

    # build/stage1 is single-work scratch; drop any secondary-translation chunks
    # left by a previous work's build so stage7 never emits a stale overlay. It
    # is rewritten below only when this work declares english.secondary.
    for scratch in ("ross_chunks.json", "third_chunks.json", "third_footnotes.json",
                    "overlays.json"):
        (BUILD_DIR / "stage1" / scratch).unlink(missing_ok=True)

    chapters_cfg = manifest.data.get("chapters", {})
    if chapters_cfg.get("source") in ("grc_tei", "explicit"):
        # Chapter-anchored archive English. Chapters come either from a grc TEI
        # text-aligned onto the spine (e.g. DA) or declared directly as Bekker
        # starts in the manifest (e.g. Categories, keyed from a Bekker-stamped
        # translation). The archive path then handles primary + optional
        # secondary/third translations, each with its own dense anchor gutter.
        from . import stage1_archive, stage1_chapters

        if chapters_cfg["source"] == "explicit":
            chapters = stage1_chapters.extract_chapters_explicit(
                spine, chapters_cfg["list"])
        else:
            chapters = stage1_chapters.extract_chapters_grc(
                spine, chapters_cfg["grc_tei"],
                chapters_cfg.get("chapter_subtype", "chapter"),
                chapters_cfg.get("book_subtype", "book"),
                chapters_cfg.get("chapter_marker", "div"),
                chapters_cfg.get("grc_book"),
                chapters_cfg.get("extra"),
                chapters_cfg.get("skip"),
            )
        # Some source TEIs use zero-based or discontinuous chapter labels.  A
        # chapter-anchored archive translation is numbered in reading order, so
        # a manifest may explicitly request that the extracted spine be
        # renumbered sequentially before its English Parts are attached.
        if chapters_cfg.get("chapter_renumber") == "sequential":
            for n, chapter in enumerate(chapters, 1):
                chapter["chapter"] = str(n)
        # Drop chapters from books the manifest doesn't carry — e.g. History of
        # Animals' spurious, untranslated Book X, whose grc chapter divs would
        # otherwise align past the spine's last assigned book.
        valid_books = {b["n"] for b in manifest.books}
        chapters = [c for c in chapters if c["book"] in valid_books]
        eng_path, align_path = stage1_archive.run(manifest, spine, chapters)
        english = json.loads(eng_path.read_text(encoding="utf-8"))
        how = "explicit" if chapters_cfg["source"] == "explicit" else "grc-aligned"
        print(f"  chapters: {len(chapters)} ({how}) "
              f"english chunks={len(english['chunks'])} ({english['translation']})")
    else:
        # Rackham primary + Ross secondary (EN). Chapters come from the English
        # TEI milestones by default, but if the manifest declares a grc TEI we
        # text-align chapter lines onto the spine (exact) and override.
        from . import stage1_english, stage1_ross

        override = None
        if chapters_cfg.get("grc_tei"):
            from . import stage1_chapters
            override = stage1_chapters.extract_chapters_grc(
                spine, chapters_cfg["grc_tei"],
                chapters_cfg.get("chapter_subtype", "chapter"),
                chapters_cfg.get("book_subtype", "book"),
                chapters_cfg.get("chapter_marker", "div"),
            )
            print(f"  chapters: {len(override)} (grc-aligned, overriding milestones)")
        eng_path, align_path = stage1_english.run(manifest, spine, override)
        english = json.loads(eng_path.read_text(encoding="utf-8"))
        # A second (unmarked) translation is optional. When the manifest declares
        # english.secondary, align it onto the spine via the Bekker-milestoned
        # primary as reference (writing the standoff map stage1_ross reads for
        # real ticks) then chunk it; otherwise the work ships primary-only.
        sec = (manifest.data.get("english") or {}).get("secondary")
        if sec:
            # Tier 0 chapter overlay (no gloss aligner). An archive secondary
            # whose "Part" divisions ARE the Bekker chapters (e.g. Rhetoric:
            # Freese primary on the perseus path, Roberts secondary) is placed
            # straight onto the grc-aligned chapter spine via build_overlay —
            # the same overlay the archive path builds — so a milestoned primary
            # can carry a chapter-anchored secondary without a gloss map. Used
            # only when no gloss map exists for this version (EN's Ross has one,
            # so it keeps the reference-aligner path below) and the grc chapter
            # override is present. build_overlay still honours an anchors.yaml
            # (Tier 1) if the secondary later gains one.
            from .stage1_ross import _load_align_map
            tier0 = (sec.get("model") == "archive"
                     and sec.get("chapter_marker")
                     and override is not None
                     and not _load_align_map(manifest.work_id, sec["id"]))
            if tier0:
                from . import stage1_archive
                ross = stage1_archive.build_overlay(spine, override, sec,
                                                    manifest.work_id)
                (BUILD_DIR / "stage1" / "ross_chunks.json").write_text(
                    json.dumps(ross, ensure_ascii=False, indent=1),
                    encoding="utf-8")
                placed = sum(1 for v in ross.values()
                             if any(p["text"].strip() for p in v))
                print(f"  ross (Tier 0 chapter overlay): segments_with_text="
                      f"{placed} pieces={sum(len(v) for v in ross.values())}")
            else:
                from .align.aligner import align as align_secondary
                from .align.reference import default_target

                version_id, prose = default_target(manifest.work_id)
                stats = align_secondary(manifest.work_id, version_id=version_id,
                                        target_prose=prose)
                print(f"  align({version_id}): chapters={stats['chapters']} "
                      f"anchors={stats['anchors']} tiers={stats['tiers']} "
                      f"review={stats['review']}")
                ross_path = stage1_ross.run(manifest, spine, english)
                ross = json.loads(ross_path.read_text(encoding="utf-8"))
                print(f"  ross: segments_with_text={len(ross)} "
                      f"pieces={sum(len(v) for v in ross.values())}")
        # A third translation (NE Ostwald) whose Markdown carries the Bekker
        # apparatus inline — parsed straight into a real per-line gutter, no
        # aligner needed (see stage1_ostwald). Writes third_chunks.json plus a
        # {N: html} footnote map that stage7 copies into the work's data dir.
        if (manifest.data.get("english") or {}).get("third"):
            from . import stage1_ostwald

            stage1_ostwald.run(manifest, spine, english)
        # Additional overlays (4th translation onward) — chapter-marker archive
        # overlays placed on the grc chapter spine, no aligner. Needs the grc
        # override; perseus-primary works without one carry none.
        from . import stage1_archive
        ov = stage1_archive.run_overlays(manifest, spine, override or [])
        if ov:
            print(f"  overlays: {', '.join(ov)} "
                  f"({sum(sum(len(v) for v in c.values()) for c in ov.values())} pieces)")
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


# Cross-work stages take no --work: they read what every per-work run left
# behind, so they are listed apart from the per-work pipeline and are NOT part
# of "all", which builds a single manifest.
def _stage8():
    from . import stage8_ngrams

    out_root = stage8_ngrams.run()
    summary = json.loads((out_root / "summary.json").read_text(encoding="utf-8"))
    print(f"stage8: {out_root}  works={summary['works']}")
    for stream, s in summary["streams"].items():
        by_n = " ".join(f"n{k}={v:,}" for k, v in s["by_n"].items())
        print(f"  {stream}: {s['kept']:,} phrases of {s['distinct']:,} distinct, "
              f"{s['occurrences']:,} occurrences, {s['shards']} shards  ({by_n})")


_CORPUS_STAGES = {"stage8": _stage8}

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
    parser.add_argument("stage", choices=[*_STAGES, *_CORPUS_STAGES, "all"])
    parser.add_argument(
        "--work", default="EN",
        help="work slug = manifest filename stem (default: EN)",
    )
    parser.add_argument(
        "--public",
        action="store_true",
        help="use manifests/<work>-public.yaml when present",
    )
    args = parser.parse_args(argv)
    if args.stage in _CORPUS_STAGES:
        _CORPUS_STAGES[args.stage]()
        return
    manifest = Manifest.for_work(args.work, public=args.public)
    if args.public:
        print(f"manifest: {manifest.path.relative_to(manifest.path.parents[1])}")
    if args.stage == "all":
        for fn in _STAGES.values():
            fn(manifest)
    else:
        _STAGES[args.stage](manifest)


if __name__ == "__main__":
    sys.exit(main())
