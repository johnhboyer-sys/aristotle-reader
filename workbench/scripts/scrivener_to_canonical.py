#!/usr/bin/env python3
"""
scrivener_to_canonical.py

Converts a pair of plain-text Scrivener exports (one Greek chapter document,
one English chapter document) into the canonical import format used by the
translation workbench app. See scrivener-import-guide.md for the full
walkthrough; this docstring covers the mechanics.

WHY THIS SCRIPT DOES NOT COMPUTE BEKKER NUMBERS ITSELF
--------------------------------------------------------
Your Scrivener tab-numbers are formatted inconsistently across years of
files -- some parenthesized, some bare, some full references like "1041a6",
some just a bare line offset like "14". Rather than guess at a format that
you've said yourself isn't consistent, this script strips ALL trailing
numeric annotations and discards them entirely. The workbench app holds the
authoritative, correctly-lineated Bekker text for every bundled work (from
TLG); on import, it text-aligns your Greek lines against that authoritative
spine and recovers the real Bekker line numbers from the content match
itself -- not from anything you typed. That's more reliable than parsing
your annotations, and it lets this script stay dumb and robust instead of
smart and fragile.

WHAT YOU NEED TO DO FIRST
--------------------------
In Scrivener: File > Export > Files... for both the Greek doc and the
English doc of one chapter, choosing Plain Text (.txt). This preserves your
verse-mode line breaks (each Greek/English line stays on its own text line)
without RTF markup getting in the way. Do this one chapter pair at a time.

USAGE
-----
    python3 scrivener_to_canonical.py \\
        --greek "Meta 7.17 Greek.txt" \\
        --english "Meta 7.17 (English).txt" \\
        --work metaphysics --book 7 --chapter 17 \\
        --bekker-start 1041a6 \\
        --out "meta-7.17.md"

--bekker-start is optional but recommended when you have it handy: it
narrows the app's search when the same Greek phrase recurs earlier in the
work, so alignment doesn't have to guess which occurrence is yours. If you
don't have it, omit the flag -- the app will still align on content alone,
just check the result once it's imported.

WHAT IT CHECKS
--------------
- Greek and English files must have the same number of content lines. If
  they don't, the script refuses to write output and tells you exactly
  which counts differed, so you can fix the source before re-running. This
  is the single most common way a translation silently goes out of
  alignment, so it's a hard stop, not a warning.
- Warns (without blocking) on any line that's suspiciously long relative to
  its neighbors -- the most common symptom of two Scrivener lines getting
  merged into one during copy/paste.

WHAT IT DOES NOT DO
--------------------
- Does not read .scriv project bundles directly -- export to plain text
  first, per above.
- Does not attempt to recover or validate Bekker numbers -- that's the
  app's job at import time, using the bundled corpus as ground truth.
- Does not handle chapters where a Greek line and its English translation
  were merged or split differently than your original verse-mode layout --
  if the two files don't line up 1:1 by position already, fix that in
  Scrivener (or by hand in the exported .txt) before running this.
"""

import argparse
import re
import sys
from pathlib import Path

# Matches a trailing bare number ("14"), a parenthesized number ("(14)"),
# or a full Bekker-looking reference, parenthesized or not
# ("(1041a6)", "1041b1"), at the end of a line, with any amount of
# preceding whitespace/tabs.
TRAILING_MARKER = re.compile(r"[\s\t]*\(?\s*\d+[a-b]?\d*\s*\)?\s*$")


def strip_marker(line: str) -> str:
    stripped = TRAILING_MARKER.sub("", line)
    return stripped.rstrip()


def read_content_lines(path: Path) -> list[str]:
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        sys.exit(1)
    raw = path.read_text(encoding="utf-8", errors="replace").splitlines()
    # Drop fully blank lines -- Scrivener's plain-text export often carries
    # paragraph-spacing blanks that aren't a real verse-mode line.
    return [ln for ln in raw if ln.strip()]


def flag_long_lines(lines: list[str], label: str) -> None:
    if len(lines) < 3:
        return
    lens = [len(l) for l in lines]
    avg = sum(lens) / len(lens)
    for i, length in enumerate(lens, start=1):
        if length > avg * 2.5 and length > 80:
            print(
                f"WARNING: {label} line {i} is unusually long "
                f"({length} chars vs. average {avg:.0f}) -- check it isn't "
                f"two merged lines.",
                file=sys.stderr,
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--greek", required=True, type=Path)
    parser.add_argument("--english", required=True, type=Path)
    parser.add_argument("--work", required=True, help="e.g. metaphysics")
    parser.add_argument("--book", required=True, help="e.g. 7")
    parser.add_argument("--chapter", required=True, help="e.g. 17")
    parser.add_argument(
        "--bekker-start",
        default=None,
        help="optional hint, e.g. 1041a6 -- not authoritative, see docstring",
    )
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    greek_raw = read_content_lines(args.greek)
    english_raw = read_content_lines(args.english)

    if len(greek_raw) != len(english_raw):
        print(
            f"ERROR: line count mismatch -- {args.greek.name} has "
            f"{len(greek_raw)} content lines, {args.english.name} has "
            f"{len(english_raw)}.",
            file=sys.stderr,
        )
        print(
            "Not writing output. Make each Greek line correspond to exactly "
            "one English line in the source files, then re-run.",
            file=sys.stderr,
        )
        sys.exit(1)

    greek_clean = [strip_marker(ln) for ln in greek_raw]
    english_clean = [strip_marker(ln) for ln in english_raw]

    flag_long_lines(greek_clean, "Greek")
    flag_long_lines(english_clean, "English")

    frontmatter = [
        "---",
        f"work: {args.work}",
        f"book: {args.book}",
        f"chapter: {args.chapter}",
    ]
    if args.bekker_start:
        frontmatter.append(f"bekker_start: {args.bekker_start}")
    frontmatter.append("---")

    out_lines = (
        frontmatter
        + [""]
        + ["[GREEK]"]
        + greek_clean
        + [""]
        + ["[ENGLISH]"]
        + english_clean
        + [""]
    )

    args.out.write_text("\n".join(out_lines), encoding="utf-8")
    print(
        f"Wrote {args.out} -- {len(greek_clean)} lines, "
        f"bekker_start={args.bekker_start or '(none supplied -- app will align on content alone)'}"
    )


if __name__ == "__main__":
    main()
