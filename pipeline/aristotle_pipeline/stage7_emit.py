"""Stage 7: emit the frontend data set under build/dist/ne/.

Per the approved formats:
  - book-{n}.json     spine segments per Bekker column (split per book),
                      Greek lines with token arrays carrying Beta Code
                      analysis keys, paired English chunk with standoff
                      notes/markers.
  - analyses.json     token key -> analyses (lemma, gloss, parse) with the
                      LSJ keys for each lemma merged in.
  - lsj/{letter}.json letter-sharded entries, corpus lemmata only.
  - manifest.json     work metadata and per-book stats.
Reports (validation, unmatched tokens, sigla, missing lemmata) are copied
to build/dist/reports/ for the Milestone 2 review.
"""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from pathlib import Path

from .config import BUILD_DIR, Manifest


def _load(rel: str):
    return json.loads((BUILD_DIR / rel).read_text(encoding="utf-8"))


_COLSEP = "⎪"  # U+23AA — the TLG column divider inside Aristotle's inline tables


def _greek_cells(text: str, tokens: list[dict]):
    """If a Greek line is a table row (contains the ⎪ column divider), split it
    into cells, partitioning the clickable tokens by their char offset and
    rebasing each cell's token offsets to the cell text. Returns a list of
    {text, tokens} cells, or None for an ordinary (non-table) line."""
    if _COLSEP not in text:
        return None
    cells, start = [], 0
    for end in [m for m, ch in enumerate(text) if ch == _COLSEP] + [len(text)]:
        cell_text = text[start:end]
        lead = len(cell_text) - len(cell_text.lstrip())
        cell_toks = [
            {**t, "o": t["o"] - start - lead}
            for t in tokens if start <= t["o"] < end
        ]
        cells.append({"text": cell_text.strip(), "tokens": cell_toks})
        start = end + 1
    return cells


def _chapter_starts(seg_column, line_ns, eng, chapters_in_col, range_map) -> list[dict]:
    """For each chapter starting in this Bekker column, where to break the
    reader. The Greek heading goes before the chapter's ACTUAL Bekker line
    (ch['line'] — exact for grc-aligned chapters); the reader matches the first
    Greek line >= beforeLine, so an exact line lands exactly. The English column
    heading uses the section marker's char offset. (This replaced an earlier
    proportional offset->line estimate that drifted within a column.)"""
    section_offset = {}
    if eng:
        for m in eng["markers"]:
            if m["kind"] == "section":
                section_offset.setdefault(m["n"], m["offset"])
    first_line = line_ns[0] if line_ns else 1
    starts = []
    for ch in chapters_in_col:
        off = section_offset.get(ch["chapter"], 0)
        before = int(ch["line"]) if str(ch.get("line", "")).lstrip("-").isdigit() else first_line
        starts.append(
            {
                "chapter": ch["chapter"],
                "beforeLine": before,
                "wordIndex": int(ch.get("wordIndex", 0) or 0),
                "engOffset": off,
                "bekker": range_map[(ch["book"], ch["chapter"])],
            }
        )
    starts.sort(key=lambda s: (s["beforeLine"], s["wordIndex"]))
    return starts


def chapter_ranges(spine, chapters) -> dict[tuple, str]:
    """(book, chapter) -> Bekker line span, e.g. '1094a1–17' (same column) or
    '1097a15–1098b8' (crossing pages). End = one Bekker line before the next
    chapter begins; the book's last line for the final chapter of a book."""
    book_cols: dict[int, list[str]] = defaultdict(list)
    col_min: dict[tuple, int] = {}
    col_max: dict[tuple, int] = {}
    for seg in spine["segments"]:
        b, c = seg["book"], seg["column"]
        if c not in book_cols[b]:
            book_cols[b].append(c)
        ns = [l["n"] for l in seg["lines"]]
        col_min[(b, c)], col_max[(b, c)] = min(ns), max(ns)

    def step_back(book, col, line):
        """The Bekker position one line before (col, line) within this book."""
        if line > col_min[(book, col)]:
            return col, line - 1
        cols = book_cols[book]
        i = cols.index(col)
        if i > 0:
            pcol = cols[i - 1]
            return pcol, col_max[(book, pcol)]
        return col, line

    by_book: dict[int, list[dict]] = defaultdict(list)
    for ch in chapters:
        by_book[ch["book"]].append(ch)
    ranges: dict[tuple, str] = {}
    for book, chs in by_book.items():
        for i, ch in enumerate(chs):
            scol, sline = ch["column"], int(ch["line"])
            if i + 1 < len(chs):
                ecol, eline = step_back(book, chs[i + 1]["column"], int(chs[i + 1]["line"]))
            else:
                ecol = book_cols[book][-1]
                eline = col_max[(book, ecol)]
            ranges[(book, ch["chapter"])] = (
                f"{scol}{sline}–{eline}" if scol == ecol
                else f"{scol}{sline}–{ecol}{eline}"
            )
    return ranges


def emit_books(spine, tokens_doc, english, range_map, out_dir: Path, ross=None,
               third=None) -> list[dict]:
    tokens_by_id = {s["id"]: s for s in tokens_doc["segments"]}
    english_by_id = {c["id"]: c for c in english["chunks"]}
    ross = ross or {}
    third = third or {}
    chapters_by_col: dict[tuple, list[dict]] = defaultdict(list)
    for ch in english.get("chapters", []):
        chapters_by_col[(ch["book"], ch["column"])].append(ch)
    by_book: dict[int, list[dict]] = defaultdict(list)
    for seg in spine["segments"]:
        tok_seg = tokens_by_id[seg["id"]]
        tok_lines = {l["n"]: l["tokens"] for l in tok_seg["lines"]}
        eng = english_by_id.get(seg["id"])
        line_ns = [line["n"] for line in seg["lines"]]
        chapter_starts = _chapter_starts(
            seg["column"], line_ns, eng,
            chapters_by_col.get((seg["book"], seg["column"]), []),
            range_map,
        )
        by_book[seg["book"]].append(
            {
                "id": seg["id"],
                "column": seg["column"],
                **({"chapterStarts": chapter_starts} if chapter_starts else {}),
                "greek": [
                    {
                        "n": line["n"],
                        "text": line["text"],
                        **({"joined": True} if line.get("joined") else {}),
                        "tokens": tok_lines[line["n"]],
                        **({"cells": cells} if (cells := _greek_cells(line["text"], tok_lines[line["n"]])) else {}),
                    }
                    for line in seg["lines"]
                ],
                "english": (
                    {
                        "text": eng["text"],
                        "notes": eng["notes"],
                        "markers": eng["markers"],
                        "bekker": eng.get("bekker", []),
                    }
                    if eng
                    else None
                ),
                # Second translation (Ross), chapter-anchored: per chapter-block
                # slices the reader pairs to its blocks (cont = continuation of a
                # chapter begun in an earlier column).
                **({"ross": ross[seg["id"]]} if ross.get(seg["id"]) else {}),
                # Optional third translation (same overlay shape as ross).
                **({"third": third[seg["id"]]} if third.get(seg["id"]) else {}),
            }
        )
    stats = []
    for book, segments in sorted(by_book.items()):
        (out_dir / f"book-{book:02d}.json").write_text(
            json.dumps({"book": book, "segments": segments}, ensure_ascii=False),
            encoding="utf-8",
        )
        stats.append(
            {
                "book": book,
                "segments": len(segments),
                "first_column": segments[0]["column"],
                "last_column": segments[-1]["column"],
            }
        )
    return stats


def emit_analyses(out_dir: Path) -> dict:
    analyses = _load("stage4/analyses.json")
    key_map = _load("stage4/key_map.json")
    lemma_map = _load("stage5/lemma_map.json")
    merged: dict[str, list[dict]] = {}
    for token_key, stored_key in key_map.items():
        merged[token_key] = [
            {
                "lemma": g["lemma"],
                "gloss": g["gloss"].strip(),
                "parse": g["parse"],
                "lsj": lemma_map.get(g["lemma"], []),
            }
            for g in analyses[stored_key]
        ]
    (out_dir / "analyses.json").write_text(
        json.dumps(merged, ensure_ascii=False), encoding="utf-8"
    )
    return {"token_keys": len(merged)}


def run(manifest: Manifest) -> Path:
    out_dir = BUILD_DIR / "dist" / manifest.work_id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "lsj").mkdir(parents=True)

    spine = _load("stage1/greek_spine.json")
    tokens_doc = _load("stage3/tokens.json")
    english = _load("stage1/english_chunks.json")
    ross_path = BUILD_DIR / "stage1" / "ross_chunks.json"
    ross = json.loads(ross_path.read_text(encoding="utf-8")) if ross_path.exists() else {}
    third_path = BUILD_DIR / "stage1" / "third_chunks.json"
    third = json.loads(third_path.read_text(encoding="utf-8")) if third_path.exists() else {}
    # A third translation may ship footnotes (NE Ostwald): a {N: html} map the
    # reader loads to fill the footnote popups. Emit it alongside the books.
    footnotes_path = BUILD_DIR / "stage1" / "third_footnotes.json"
    if footnotes_path.exists():
        shutil.copy(footnotes_path, out_dir / "footnotes.json")

    range_map = chapter_ranges(spine, english.get("chapters", []))
    book_stats = emit_books(spine, tokens_doc, english, range_map, out_dir, ross, third)
    analyses_stats = emit_analyses(out_dir)

    # Per-book ordered chapter list for navigation (Work → Book → Chapter).
    chapters_by_book: dict[str, list[dict]] = defaultdict(list)
    for ch in english.get("chapters", []):
        chapters_by_book[str(ch["book"])].append(
            {
                "chapter": ch["chapter"],
                "column": ch["column"],
                "line": ch["line"],
                "bekker": range_map[(ch["book"], ch["chapter"])],
            }
        )
    (out_dir / "chapters.json").write_text(
        json.dumps(chapters_by_book, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # Bekker column -> owning book(s), with each book's line span in that column.
    # Boundary columns (a book starting mid-column) list more than one book, so a
    # citation like 1103a5 can be resolved to the right book by its line number.
    col_ranges: dict[str, dict[int, list]] = defaultdict(dict)
    for seg in spine["segments"]:
        ns = [line["n"] for line in seg["lines"]]
        if ns:
            col_ranges[seg["column"]][seg["book"]] = [min(ns), max(ns)]
    columns_out = {
        col: [
            {"book": b, "lo": rng[0], "hi": rng[1]}
            for b, rng in sorted(books.items())
        ]
        for col, books in col_ranges.items()
    }
    (out_dir / "columns.json").write_text(
        json.dumps(columns_out, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    for shard in sorted((BUILD_DIR / "stage5" / "lsj").glob("*.json")):
        shutil.copy(shard, out_dir / "lsj" / shard.name)

    (out_dir / "search").mkdir(exist_ok=True)
    for f in ["greek_lemma.json", "greek_form.json", "english.json", "meta.json"]:
        shutil.copy(BUILD_DIR / "stage6" / f, out_dir / "search" / f)

    work = manifest.data["work"]
    (out_dir / "manifest.json").write_text(
        json.dumps(
            {
                "work": work,
                "books": book_stats,
                "analyses": analyses_stats,
                "lsj": _load("stage5/summary.json"),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    reports = BUILD_DIR / "dist" / "reports"
    reports.mkdir(exist_ok=True)
    for rel in [
        "stage2/validation_report.md",
        "stage2/validation_report.json",
        "stage3/sigla_log.json",
        "stage4/unmatched.json",
        "stage4/summary.json",
        "stage5/missing_lemmata.json",
    ]:
        shutil.copy(BUILD_DIR / rel, reports / Path(rel).name)
    return out_dir
