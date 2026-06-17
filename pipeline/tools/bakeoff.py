"""Bake-off: score gloss variants against Rackham's real ticks (NE Book 1).

For each gloss directory (neutral / standard-terminology / Ross-style) and each
matcher (lexical word-overlap, mpnet meaning), build the window-fingerprint gloss
chapters, align onto Rackham (treated as unmarked), and score predicted ticks
against Rackham's real embedded Bekker ticks. Window fingerprint throughout.
"""
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))

from aristotle_pipeline.align.aligner import align_chapter, split_sentences
from aristotle_pipeline.align.glossing import chapter_lines, tick_windows
from aristotle_pipeline.align.reference import (ChapterRef, GreekLine, RefAnchor,
                                                default_target, load_chapters)

BOOKS = [1]
ROOTS = {
    "neutral": "build/align/glosses/EN",
    "stdterm": "build/align/glosses-stdterm/EN",
    "ross-style": "build/align/glosses-ross/EN",
}
REPO = Path(__file__).resolve().parents[2]


def load(root, b, c):
    p = REPO / root / f"{b}-{c}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def build(root):
    _v, target = default_target("EN")
    mile = {(c.book, int(c.chapter)): c for c in load_chapters(target) if c.book in BOOKS}
    rack = {k: c.ref_text for k, c in mile.items()}
    out = []
    for ch in chapter_lines(BOOKS):
        b, cp = ch.book, ch.chapter
        rt = rack.get((b, cp))
        gl = load(root, b, cp)
        if not rt or not gl or not ch.lines:
            continue
        cc = ch.lines[0].citation
        anchors = [RefAnchor(cc, 0, "chapter")]
        inc = [gl.get(cc, "").strip()]
        base = 0
        for w in tick_windows(ch):
            if not gl.get(w.tick, "").strip() or w.tick == cc:
                continue
            fp = " ".join(gl.get(l.citation, "").strip() for l in w.lines).strip()
            anchors.append(RefAnchor(w.tick, base, "column" if w.is_column_start else "five_line"))
            inc.append(fp)
            base += len(fp) + 1
        glines, cum = [], 0
        for ln in ch.lines:
            glines.append(GreekLine(ln.citation, cum))
            cum += len(ln.text.split())
        cr = ChapterRef(b, str(cp), cc, rt, " ".join(inc[1:]), anchors, glines, gloss_incipits=inc)
        out.append((cr, mile[(b, cp)]))
    return out


def score(root, backend):
    et = {}
    for cr, mc in build(root):
        starts = [s for s, _ in split_sentences(mc.ref_text)] or [0]
        gold = {a.citation: max((s for s in starts if s <= a.off), default=starts[0])
                for a in mc.ref_anchors if a.tier != "chapter"}
        for a in align_chapter(cr, backend):
            if a.tier in ("chapter", "line"):
                continue
            if a.citation in gold:
                et.setdefault(a.tier, []).append(abs(a.offset - gold[a.citation]))
    allv = [e for v in et.values() for e in v]
    ex = sum(1 for e in allv if e == 0)
    return (f"exact {ex}/{len(allv)} ({100*ex/len(allv):.0f}%)  "
            f"mean={statistics.mean(allv):.0f}  median={statistics.median(allv):.0f}  max={max(allv)}")


print(f"{'variant':12} {'backend':9} result")
print("-" * 64)
for name, root in ROOTS.items():
    for backend in ("lexical", "quality"):
        print(f"{name:12} {backend:9} {score(root, backend)}")
