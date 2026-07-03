#!/usr/bin/env python3
"""Post-process already-transcribed OCR markdown.

This tool intentionally does not read PDFs or extract OCR/text layers. It only
repairs and validates markdown created by the visual OCR recipe.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


FOOTNOTE_DEF_RE = re.compile(r"^\[\^(\d+)\]:\s*(.*)$", re.MULTILINE)
FOOTNOTE_REF_RE = re.compile(r"\[\^(\d+)\](?!:)")
PANDOC_BAD_NOTE_RE = re.compile(
    r"Note with key|Reference to nonexistent note|nonexistent note|Duplicate note|duplicate"
)


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def write_lines(path: Path, lines: list[str]) -> None:
    text = "\n".join(lines)
    if text:
        text += "\n"
    path.write_text(text, encoding="utf-8")


@dataclass(frozen=True)
class BreakHit:
    blank_index: int
    prev_line_no: int
    next_line_no: int
    prev_context: str
    next_context: str


def scan_break_hits(lines: list[str]) -> list[BreakHit]:
    """Port of Step 4.4's inline scanner."""
    hits: list[BreakHit] = []
    n = len(lines)
    for i in range(n):
        if lines[i].strip():
            continue
        p = i - 1
        while p >= 0 and not lines[p].strip():
            p -= 1
        x = i + 1
        while x < n and not lines[x].strip():
            x += 1
        if p < 0 or x >= n:
            continue
        prev, nxt = lines[p].rstrip(), lines[x].rstrip()
        if prev.lstrip().startswith(("#", ">", "[^")) or nxt.lstrip().startswith(
            ("#", ">", "[^")
        ):
            continue
        if re.match(r"^\s*[a-z]", nxt):
            hits.append(BreakHit(i, p + 1, x + 1, prev[-70:], nxt[:70]))
    return hits


def cmd_scan_breaks(args: argparse.Namespace) -> int:
    path = Path(args.file)
    lines = read_lines(path)
    hits = scan_break_hits(lines)
    for hit in hits:
        print(
            f"{hit.prev_line_no} {hit.next_line_no} | "
            f"{hit.prev_context} | {hit.next_context}"
        )
    if args.fix and hits:
        remove = {hit.blank_index for hit in hits}
        write_lines(path, [line for i, line in enumerate(lines) if i not in remove])
        print(f"fixed: removed {len(remove)} false page-boundary blank line(s)")
    return 1 if hits else 0


@dataclass
class FootnoteDef:
    original_key: str
    final_key: str
    text: str
    line_no: int
    duplicate: bool = False


@dataclass
class FootnoteResult:
    lines: list[str]
    definitions: list[FootnoteDef]
    duplicate_keys: set[str]
    orphaned_defs: set[str]
    undefined_refs: set[str]
    renumbered: list[tuple[str, str, int]]


def replace_ref_key(text: str, old: str, new: str) -> str:
    return re.sub(rf"\[\^{re.escape(old)}\](?!:)", f"[^{new}]", text)


def next_renumbered_key(key: str, used: set[str]) -> str:
    base = int(key)
    candidate = base + 100
    while str(candidate) in used:
        candidate += 100
    return str(candidate)


def trim_trailing_blank(lines: list[str]) -> list[str]:
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def collapse_blank_runs(lines: list[str]) -> list[str]:
    collapsed: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line.strip()
        if blank and previous_blank:
            continue
        collapsed.append(line)
        previous_blank = blank
    return collapsed


def extract_existing_footnotes_section(lines: list[str]) -> list[str]:
    marker = None
    for i, line in enumerate(lines):
        if line.strip() == "## Footnotes":
            marker = i
    if marker is None:
        return lines
    tail = lines[marker + 1 :]
    if any(FOOTNOTE_DEF_RE.match(line) for line in tail):
        return trim_trailing_blank(lines[:marker])
    return lines


def parse_and_relocate_footnotes(lines: list[str]) -> FootnoteResult:
    lines = extract_existing_footnotes_section(list(lines))
    body: list[str] = []
    pending_segment: list[str] = []
    definitions: list[FootnoteDef] = []
    used_def_keys: set[str] = set()
    duplicate_keys: set[str] = set()
    renumbered: list[tuple[str, str, int]] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        match = FOOTNOTE_DEF_RE.match(line)
        if not match:
            pending_segment.append(line)
            i += 1
            continue

        original_key, first_text = match.groups()
        final_key = original_key
        duplicate = original_key in used_def_keys
        if duplicate:
            duplicate_keys.add(original_key)
            final_key = next_renumbered_key(original_key, used_def_keys)
            renumbered.append((original_key, final_key, i + 1))
            pending_segment = [
                replace_ref_key(segment_line, original_key, final_key)
                for segment_line in pending_segment
            ]

        body.extend(pending_segment)
        pending_segment = []

        text_parts = [first_text.rstrip()]
        def_line_no = i + 1
        i += 1
        while i < len(lines) and (lines[i].startswith((" ", "\t")) and lines[i].strip()):
            text_parts.append(lines[i].strip())
            i += 1
        text = " ".join(part for part in text_parts if part).strip()
        definitions.append(
            FootnoteDef(
                original_key=original_key,
                final_key=final_key,
                text=text,
                line_no=def_line_no,
                duplicate=duplicate,
            )
        )
        used_def_keys.add(final_key)

    body.extend(pending_segment)
    body = trim_trailing_blank(collapse_blank_runs(body))

    refs = set(FOOTNOTE_REF_RE.findall("\n".join(body)))
    def_keys = {definition.final_key for definition in definitions}
    orphaned_defs = def_keys - refs
    undefined_refs = refs - def_keys

    output = list(body)
    if definitions:
        if output:
            output.append("")
        output.append("## Footnotes")
        output.append("")
        for definition in sorted(definitions, key=lambda item: int(item.final_key)):
            output.append(f"[^{definition.final_key}]: {definition.text}")
            output.append("")
        output = trim_trailing_blank(output)

    return FootnoteResult(
        lines=output,
        definitions=definitions,
        duplicate_keys=duplicate_keys,
        orphaned_defs=orphaned_defs,
        undefined_refs=undefined_refs,
        renumbered=renumbered,
    )


def print_footnote_report(result: FootnoteResult) -> None:
    print(f"definitions: {len(result.definitions)}")
    if result.renumbered:
        for old, new, line_no in result.renumbered:
            print(f"renumbered duplicate [^{old}] at line {line_no} -> [^{new}]")
    if result.duplicate_keys:
        print("duplicate keys: " + ", ".join(f"[^{k}]" for k in sorted(result.duplicate_keys, key=int)))
    if result.orphaned_defs:
        print(
            "orphaned definitions: "
            + ", ".join(f"[^{k}]" for k in sorted(result.orphaned_defs, key=int))
        )
    if result.undefined_refs:
        print(
            "references with no definition: "
            + ", ".join(f"[^{k}]" for k in sorted(result.undefined_refs, key=int))
        )
    if not (result.duplicate_keys or result.orphaned_defs or result.undefined_refs):
        print("footnotes ok")


def cmd_relocate_footnotes(args: argparse.Namespace) -> int:
    path = Path(args.file)
    result = parse_and_relocate_footnotes(read_lines(path))
    print_footnote_report(result)
    if args.fix or args.write:
        write_lines(path, result.lines)
        print(f"wrote: {path}")
    return 1 if (result.orphaned_defs or result.undefined_refs) else 0


def numbering_gaps(keys: set[str]) -> list[tuple[int, int]]:
    nums = sorted(int(key) for key in keys)
    gaps: list[tuple[int, int]] = []
    for prev, nxt in zip(nums, nums[1:]):
        if nxt - prev > 20:
            continue
        if nxt - prev == 2:
            gaps.append((prev + 1, prev + 1))
        elif nxt - prev > 2:
            gaps.append((prev + 1, nxt - 1))
    return gaps


def local_markdown_note_issues(path: Path) -> tuple[set[str], set[str], set[str], list[tuple[int, int]]]:
    text = path.read_text(encoding="utf-8")
    defs = FOOTNOTE_DEF_RE.findall(text)
    def_keys = [key for key, _ in defs]
    refs = FOOTNOTE_REF_RE.findall(text)
    duplicates = {key for key in def_keys if def_keys.count(key) > 1}
    undefined = set(refs) - set(def_keys)
    orphaned = set(def_keys) - set(refs)
    gaps = numbering_gaps(set(def_keys) | set(refs))
    return duplicates, undefined, orphaned, gaps


def cmd_validate(args: argparse.Namespace) -> int:
    pandoc = shutil.which("pandoc")
    if pandoc is None:
        print("skipped: pandoc not installed")
        return 0

    path = Path(args.file)
    with tempfile.TemporaryDirectory(prefix="ocr-postprocess-") as tmp:
        out = Path(tmp) / "validate.docx"
        proc = subprocess.run(
            [pandoc, str(path), "-o", str(out), "--from=markdown", "--to=docx"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

    if proc.stderr:
        print("=== pandoc warnings ===")
        print(proc.stderr, end="" if proc.stderr.endswith("\n") else "\n")
    else:
        print("=== pandoc warnings ===")
        print("(none)")

    duplicates, undefined, orphaned, gaps = local_markdown_note_issues(path)
    failed = proc.returncode != 0 or bool(PANDOC_BAD_NOTE_RE.search(proc.stderr))
    failed = failed or bool(duplicates or undefined or orphaned or gaps)

    if duplicates:
        print("duplicate notes: " + ", ".join(f"[^{k}]" for k in sorted(duplicates, key=int)))
    if orphaned:
        print("orphaned definitions: " + ", ".join(f"[^{k}]" for k in sorted(orphaned, key=int)))
    if undefined:
        print("references with no definition: " + ", ".join(f"[^{k}]" for k in sorted(undefined, key=int)))
    if gaps:
        formatted = ", ".join(
            str(start) if start == end else f"{start}-{end}" for start, end in gaps
        )
        print(f"suspicious numbering gaps: {formatted}")
    if proc.returncode != 0:
        print(f"pandoc exited with status {proc.returncode}")
    if failed:
        return 1
    print("validation ok")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Post-process already-transcribed OCR markdown."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan-breaks", help="scan for page-boundary paragraph splits")
    scan.add_argument("file", help="markdown file to scan")
    scan.add_argument("--fix", action="store_true", help="remove detected false-break blank lines")
    scan.set_defaults(func=cmd_scan_breaks)

    footnotes = subparsers.add_parser(
        "relocate-footnotes", help="move footnote definitions to one trailing section"
    )
    footnotes.add_argument("file", help="markdown file to process")
    footnotes.add_argument("--fix", action="store_true", help="write changes in place")
    footnotes.add_argument("--write", action="store_true", help="write changes in place")
    footnotes.set_defaults(func=cmd_relocate_footnotes)

    validate = subparsers.add_parser("validate", help="run pandoc and footnote validation")
    validate.add_argument("file", help="markdown file to validate")
    validate.set_defaults(func=cmd_validate)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
