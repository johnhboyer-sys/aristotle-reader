"""CLI: python -m aristotle_pipeline.align [--version ross] [--backend lexical]
[--books 1,2] [--eval]"""

from __future__ import annotations

import argparse
import json

from .aligner import align


def main(argv=None):
    p = argparse.ArgumentParser(prog="aristotle_pipeline.align")
    p.add_argument("--work", default="EN")
    p.add_argument("--version", default=None,
                   help="secondary translation id; default from manifest english.secondary")
    p.add_argument("--backend", default="lexical",
                   help="lexical (zero-dep) | fast | quality | <sbert model id>")
    p.add_argument("--books", default="", help="comma-separated book numbers, e.g. 1,2")
    p.add_argument("--provider", default="milestoned", choices=["milestoned", "gloss"],
                   help="alignment reference: milestoned English (default) | Greek glosses")
    p.add_argument("--eval", action="store_true", help="run the offset-error eval harness")
    p.add_argument("--emit-gloss-tasks", action="store_true",
                   help="write per-chapter tick-window Greek for Claude Code to gloss")
    p.add_argument("--gloss-eval", action="store_true",
                   help="score the gloss aligner against the milestoned English's real ticks")
    p.add_argument("--plan-gloss-batches", action="store_true",
                   help="print chapter batches (bundle small chapters per sub-agent)")
    p.add_argument("--html", action="store_true", help="write a side-by-side Rackham|Ross review page")
    args = p.parse_args(argv)

    books = [int(b) for b in args.books.split(",") if b.strip()] or None

    if args.emit_gloss_tasks:
        from .glossing import GLOSS_TASK_DIR, emit_gloss_tasks
        n = emit_gloss_tasks(args.work, books)
        print(f"wrote {n} gloss-task file(s) -> {GLOSS_TASK_DIR / args.work}/")
        return

    if args.plan_gloss_batches:
        from .glossing import plan_batches
        batches = plan_batches(books)
        for i, batch in enumerate(batches, 1):
            chaps = ", ".join(f"{b}-{c}" for b, c in batch)
            print(f"batch {i}: {chaps}")
        print(f"{len(batches)} batch(es) for "
              f"{sum(len(b) for b in batches)} chapter(s)")
        return

    if args.gloss_eval:
        from .eval import run_gloss_eval
        for backend in ("lexical", "quality"):
            print(f"=== backend: {backend} ===")
            try:
                print(json.dumps(run_gloss_eval(args.work, backend, books), indent=2))
            except ImportError as e:
                print(f"  skipped ({e})")
        return

    if args.html:
        from .review_html import write_html
        path = write_html(args.work, args.version, args.backend, books)
        print(f"wrote {path}")
        return

    if args.eval:
        from .eval import run_eval
        report = run_eval(args.work, args.backend, books)
        print(json.dumps(report, indent=2))
        return

    summary = align(args.work, version_id=args.version, backend=args.backend,
                    books=books, provider=args.provider)
    print(f"aligned {summary['chapters']} chapters -> {summary['anchors']} anchors "
          f"({summary['tiers']}); {summary['review']} flagged for review")
    print(f"  wrote {summary['out_dir']}/ ({args.work} map)")


if __name__ == "__main__":
    main()
