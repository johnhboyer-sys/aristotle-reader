"""CLI: python -m aristotle_pipeline.align [--version ross] [--backend lexical]
[--books 1,2] [--eval]"""

from __future__ import annotations

import argparse
import json

from .aligner import align


def main(argv=None):
    p = argparse.ArgumentParser(prog="aristotle_pipeline.align")
    p.add_argument("--work", default="ne")
    p.add_argument("--version", default="ross")
    p.add_argument("--backend", default="lexical",
                   help="lexical (zero-dep) | fast | quality | <sbert model id>")
    p.add_argument("--books", default="", help="comma-separated book numbers, e.g. 1,2")
    p.add_argument("--eval", action="store_true", help="run the offset-error eval harness")
    p.add_argument("--html", action="store_true", help="write a side-by-side Rackham|Ross review page")
    args = p.parse_args(argv)

    books = [int(b) for b in args.books.split(",") if b.strip()] or None

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

    summary = align(args.work, args.version, args.backend, books)
    print(f"aligned {summary['chapters']} chapters -> {summary['anchors']} anchors "
          f"({summary['tiers']}); {summary['review']} flagged for review")
    print(f"  wrote {summary['out_dir']}/{args.work}_{args.version}_map.json")


if __name__ == "__main__":
    main()
