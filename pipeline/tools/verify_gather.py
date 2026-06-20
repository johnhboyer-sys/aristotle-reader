"""Gather Method-A 'uncertain' ticks for the PRODUCTION target (the actual
unmarked translation, e.g. Ross) so a verifier sub-agent can re-place them.

Usage: uv run python build/verify_gather.py <book>
Writes build/align/verify_tasks/EN/<book>-<chapter>.json (only chapters with
uncertain ticks) and merges into build/align/verify_meta.json
(key "book:chapter|citation" -> {a_offset, excerpt_lo}).
"""
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align.aligner import align_chapter
from aristotle_pipeline.align.glossing import chapter_lines, load_gloss, tick_windows
from aristotle_pipeline.align.reference import default_target, load_gloss_chapters

BOOK = int(sys.argv[1])
PAD = int(sys.argv[2]) if len(sys.argv) > 2 else 600
CHAP_FILTER = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
# VERIFY_ALL=1 → verify EVERY real tick (not just 'uncertain') against the full
# chapter text, so flagged-but-reliable ticks that snapped to a sentence start
# (e.g. 1094a20) also get direct-reading placement.
ALL = bool(os.environ.get("VERIFY_ALL"))
WORK = os.environ.get("WORK", "EN")
TASK_DIR = REPO / "build/align/verify_tasks" / WORK
TASK_DIR.mkdir(parents=True, exist_ok=True)
META = REPO / "build/align" / f"verify_meta_{WORK}.json"

_vid, ross = default_target(WORK)
chapters = {(c.book, int(c.chapter)): c for c in load_gloss_chapters(ross, WORK, [BOOK])}

# Greek line text + window citations per chapter (for the verifier's context).
greek = {}
wins = {}
for ch in chapter_lines([BOOK]):
    greek[(ch.book, ch.chapter)] = {ln.citation: ln.text for ln in ch.lines}
    wins[(ch.book, ch.chapter)] = {w.tick: [l.citation for l in w.lines] for w in tick_windows(ch)}

meta = json.loads(META.read_text()) if META.exists() else {}
n_tasks = n_unc = 0
for (b, cp), cr in sorted(chapters.items()):
    if CHAP_FILTER and str(cp) not in CHAP_FILTER:
        continue
    g = load_gloss(WORK, b, cp)
    gk = greek.get((b, cp), {})
    wc = wins.get((b, cp), {})
    text = cr.ross_text
    ticks = []
    for a in align_chapter(cr, "lexical"):
        if a.tier not in ("column", "five_line"):
            continue
        if not ALL and a.confidence != "uncertain":
            continue
        cits = wc.get(a.citation, [a.citation])
        lo = 0 if ALL else max(0, a.offset - PAD)
        # The Greek tick line is the AUTHORITATIVE placement target; the verifier
        # anchors at the English rendering of `greek_tick`'s first word, using the
        # neighbours only to fix the boundary. (`gloss` is now a sense aid only —
        # passing it as the target made ticks drift when the gloss itself started
        # mid-line or couldn't be lexically matched.) Locate the tick within the
        # window by citation, not by index: edge windows have 2 lines.
        ti = cits.index(a.citation) if a.citation in cits else 0
        tick = {
            "citation": a.citation,
            "greek_above": gk.get(cits[ti - 1], "") if ti > 0 else "",
            "greek_tick": gk.get(cits[ti], ""),
            "greek_below": gk.get(cits[ti + 1], "") if ti + 1 < len(cits) else "",
            "greek": " / ".join(gk.get(c, "") for c in cits),
            "gloss": (g.get(a.citation, "") or "").strip(),
            "context_gloss": " ".join((g.get(c, "") or "").strip() for c in cits),
        }
        # The pass-1 lexical guess, so a judge-style verifier can confirm/correct
        # an existing placement rather than produce one from scratch.
        tick["current_placement"] = text[a.offset:a.offset + 90]
        if not ALL:  # windowed mode carries its own excerpt; ALL mode shares chapter text
            tick["excerpt"] = text[lo:min(len(text), a.offset + PAD)]
        ticks.append(tick)
        meta[f"{b}:{cp}|{a.citation}"] = {"a_offset": a.offset, "excerpt_lo": lo}
        n_unc += 1
    if ticks:
        task = {"chapter": f"{b}:{cp}", "ticks": ticks}
        if ALL:
            task["text"] = text       # shared full-chapter text for the verifier
        (TASK_DIR / f"{b}-{cp}.json").write_text(
            json.dumps(task, ensure_ascii=False, indent=1), encoding="utf-8")
        n_tasks += 1

META.write_text(json.dumps(meta, indent=1), encoding="utf-8")
chs = sorted(int(p.stem.split("-")[1]) for p in TASK_DIR.glob(f"{BOOK}-*.json"))
print(f"book {BOOK}: {n_unc} uncertain ticks across {n_tasks} chapters -> chapters {chs}")
