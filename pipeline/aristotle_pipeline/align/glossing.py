"""Tick-window Greek segmentation for the gloss-based aligner (spec v2 Method A).

The Bekker ticks the reader shows are line 1 + every 5th line of each column
(5, 10, 15, 20, …). To place those ticks in an *unmarked* translation we have
Claude Code translate the Greek at each tick — but a tick line often falls
mid-sentence and the Greek word order won't carry straight into English, so we
hand the translator a small **window**: the line above the tick, the tick line,
and the line below. Each line is translated on its own (verse mode, the way John
translates), and the tick line's own English is the fingerprint the aligner then
hunts for in the translation.

This module only *prepares* the Greek (segmentation + window task files) and
*reads back* the glosses Claude Code writes. It performs no translation itself
and calls no API — the gloss step is done by Claude Code on the Max plan.

Everything is derived from the current work's `build/stage1` artifacts; nothing
re-parses the TLG.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from ..config import BUILD_DIR
from ..stage1_ross import _chapter_segments

_STAGE1 = BUILD_DIR / "stage1"
GLOSS_TASK_DIR = BUILD_DIR / "align" / "gloss_tasks"
GLOSS_DIR = BUILD_DIR / "align" / "glosses"


@dataclass
class Line:
    citation: str   # "1094a5"
    column: str     # "1094a"
    n: int          # 5
    text: str       # the Greek of this line


@dataclass
class TickWindow:
    tick: str              # citation of the anchored (middle) line, e.g. "1094a5"
    is_column_start: bool  # the tick is line 1 of its column
    column: str            # "1094a"
    lines: list            # [Line above, Line tick, Line below], clamped at chapter edges


@dataclass
class ChapterLines:
    book: int
    chapter: int
    lines: list  # ordered [Line, ...] for the whole chapter (document order)


def is_tick(n: int) -> bool:
    """Bekker tick cadence: line 1 of a column, then every 5th line."""
    return n == 1 or n % 5 == 0


def chapter_lines(books=None) -> list[ChapterLines]:
    """Per chapter, the ordered Greek lines (citation + text), built from the
    current work's spine + the same chapter-segmentation the Ross gutter uses."""
    spine = json.loads((_STAGE1 / "greek_spine.json").read_text(encoding="utf-8"))
    eng = json.loads((_STAGE1 / "english_chunks.json").read_text(encoding="utf-8"))
    eng_chapters = eng["chapters"]
    seg_lines = {
        s["id"]: {ln["n"]: ln["text"] for ln in s["lines"]} for s in spine["segments"]
    }
    seg_chapters, chapter_key = _chapter_segments(spine, eng_chapters)

    out: list[ChapterLines] = []
    for gidx, segs in seg_chapters.items():
        book, chap = chapter_key[gidx]
        if books and book not in books:
            continue
        lines: list[Line] = []
        for seg_id, col, line_ns in segs:
            for n in line_ns:
                text = seg_lines.get(seg_id, {}).get(n, "")
                lines.append(Line(f"{col}{n}", col, n, text))
        out.append(ChapterLines(book, chap, lines))
    return out


def tick_windows(ch: ChapterLines) -> list[TickWindow]:
    """A 3-line window (above, tick, below) around each tick line in a chapter,
    clamped at the chapter's first/last line."""
    wins: list[TickWindow] = []
    for i, ln in enumerate(ch.lines):
        if not is_tick(ln.n):
            continue
        window = ch.lines[max(0, i - 1): i + 2]
        wins.append(TickWindow(ln.citation, ln.n == 1, ln.column, window))
    return wins


def emit_gloss_tasks(work_id: str = "EN", books=None) -> int:
    """Write per-chapter window task files for Claude Code to translate.
    `build/align/gloss_tasks/<work>/<book>-<chapter>.json` — a list of windows,
    each {tick, is_column_start, lines:[{citation, greek}, ...]}."""
    work_dir = GLOSS_TASK_DIR / work_id
    work_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for ch in chapter_lines(books):
        data = [
            {
                "tick": w.tick,
                "is_column_start": w.is_column_start,
                "lines": [{"citation": ln.citation, "greek": ln.text} for ln in w.lines],
            }
            for w in tick_windows(ch)
        ]
        (work_dir / f"{ch.book}-{ch.chapter}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        n += 1
    return n


def plan_batches(books=None, max_lines: int = 90) -> list[list[tuple]]:
    """Group consecutive chapters into batches whose total glossed-line count
    stays under `max_lines`, so one sub-agent glosses (or verifies) a whole batch
    and the per-agent fixed overhead is paid once per batch, not once per chapter.
    A/B (NE Bk1, 13 ch → 4 batches) cut gloss tokens ~57% with no accuracy loss.
    A single chapter over the budget gets its own batch. Returns
    [[(book, chapter), ...], ...] in document order."""
    batches: list[list[tuple]] = []
    cur: list[tuple] = []
    cur_n = 0
    for ch in chapter_lines(books):
        n = len({ln.citation for w in tick_windows(ch) for ln in w.lines})
        if cur and cur_n + n > max_lines:
            batches.append(cur)
            cur, cur_n = [], 0
        cur.append((ch.book, ch.chapter))
        cur_n += n
    if cur:
        batches.append(cur)
    return batches


def load_gloss(work_id: str, book: int, chapter: int) -> dict:
    """Read the glosses Claude Code wrote for one chapter:
    `build/align/glosses/<work>/<book>-<chapter>.json` = {line_citation: english}.
    Missing file → {} (the aligner falls back to interpolation)."""
    path = GLOSS_DIR / work_id / f"{book}-{chapter}.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
