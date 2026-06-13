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


def _chapter_starts(seg_column, line_ns, eng, chapters_in_col) -> list[dict]:
    """For each chapter starting in this Bekker column, where to break the
    reader. The chapter boundary is the English section marker's char offset;
    the matching Greek line is found proportionally (offset / chunk length ->
    line index), which tracks the actual incipit within ~1 line and handles
    mid-column book starts (offset 0 -> the segment's first line, e.g. 14)."""
    eng_text = eng["text"] if eng else ""
    eng_len = max(1, len(eng_text))
    section_offset = {}
    if eng:
        for m in eng["markers"]:
            if m["kind"] == "section":
                section_offset.setdefault(m["n"], m["offset"])
    starts = []
    for ch in chapters_in_col:
        off = section_offset.get(ch["chapter"], 0)
        if line_ns:
            idx = min(len(line_ns) - 1, int(off / eng_len * len(line_ns)))
            before = line_ns[idx]
        else:
            before = 1
        starts.append(
            {"chapter": ch["chapter"], "beforeLine": before, "engOffset": off}
        )
    starts.sort(key=lambda s: s["beforeLine"])
    return starts


def emit_books(spine, tokens_doc, english, out_dir: Path) -> list[dict]:
    tokens_by_id = {s["id"]: s for s in tokens_doc["segments"]}
    english_by_id = {c["id"]: c for c in english["chunks"]}
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
                    }
                    for line in seg["lines"]
                ],
                "english": (
                    {
                        "text": eng["text"],
                        "notes": eng["notes"],
                        "markers": eng["markers"],
                    }
                    if eng
                    else None
                ),
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

    book_stats = emit_books(spine, tokens_doc, english, out_dir)
    analyses_stats = emit_analyses(out_dir)

    # Per-book ordered chapter list for navigation (Work → Book → Chapter).
    chapters_by_book: dict[str, list[dict]] = defaultdict(list)
    for ch in english.get("chapters", []):
        chapters_by_book[str(ch["book"])].append(
            {"chapter": ch["chapter"], "column": ch["column"], "line": ch["line"]}
        )
    (out_dir / "chapters.json").write_text(
        json.dumps(chapters_by_book, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    for shard in sorted((BUILD_DIR / "stage5" / "lsj").glob("*.json")):
        shutil.copy(shard, out_dir / "lsj" / shard.name)

    (out_dir / "search").mkdir(exist_ok=True)
    for f in ["greek.json", "english.json", "meta.json"]:
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
