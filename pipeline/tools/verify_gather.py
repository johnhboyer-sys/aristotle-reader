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
pad_arg = sys.argv[2] if len(sys.argv) > 2 else None
PAD = int(os.environ.get("VERIFY_PAD", pad_arg or "600"))
CURRENT_PLACEMENT = int(os.environ.get("VERIFY_PLACEMENT", "90"))
CHAP_FILTER = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
# VERIFY_ALL=1 → verify EVERY real tick (not just 'uncertain') against the full
# chapter text, so flagged-but-reliable ticks that snapped to a sentence start
# (e.g. 1094a20) also get direct-reading placement.
ALL = bool(os.environ.get("VERIFY_ALL"))
# VERIFY_FILTER="early,late" → correction-pass scoping: re-gather only ticks the
# PREVIOUS verify pass judged early/late (skip ok/unsure). Safe — the monotonic
# clamp moves 0 non-corrected real ticks, so confirmations don't shift. Reads the
# existing verify_out, so run this BEFORE the correction judge overwrites it.
V_FILTER = set(f.strip() for f in os.environ.get("VERIFY_FILTER", "").split(",") if f.strip())
WORK = os.environ.get("WORK", "EN")
TASK_DIR = REPO / "build/align/verify_tasks" / WORK
TASK_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR = REPO / "build/align/verify_out" / WORK
META = REPO / "build/align" / f"verify_meta_{WORK}.json"


def prev_verdicts(b: int, cp: int) -> dict:
    """{citation: verdict} from the previous verify pass, or {} if unavailable.
    Accepts the verdict-bearing `{chapter, ticks:[{citation, verdict, ...}]}`
    shape; a legacy flat `{citation: phrase}` file carries no verdicts → {}."""
    p = OUT_DIR / f"{b}-{cp}.json"
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    if isinstance(data, dict) and "ticks" in data:
        return {t["citation"]: t.get("verdict") for t in data["ticks"]}
    return {}

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
    vd = prev_verdicts(b, cp) if V_FILTER else {}   # hoisted: one read per chapter
    ticks = []
    for a in align_chapter(cr, "lexical"):
        if a.tier not in ("column", "five_line"):
            continue
        if not ALL and a.confidence != "uncertain":
            continue
        # Correction-pass scoping: skip only ticks we POSITIVELY saw judged with a
        # verdict outside the filter (e.g. ok/unsure). A tick absent from the prior
        # pass (never judged) falls through and is INCLUDED — fail safe = verify.
        if V_FILTER and (v := vd.get(a.citation)) is not None and v not in V_FILTER:
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
        # Per-tick payload kept lean: greek_above/tick/below are the authoritative
        # placement target + neighbours; `gloss` is a sense hint. The old `greek`
        # (the three lines joined) and `context_gloss` (the glosses joined) were
        # fully/largely redundant with these and only inflated the prompt.
        tick = {
            "citation": a.citation,
            "greek_above": gk.get(cits[ti - 1], "") if ti > 0 else "",
            "greek_tick": gk.get(cits[ti], ""),
            "greek_below": gk.get(cits[ti + 1], "") if ti + 1 < len(cits) else "",
            "gloss": (g.get(a.citation, "") or "").strip(),
        }
        # The pass-1 lexical guess, so a judge-style verifier can confirm/correct
        # an existing placement rather than produce one from scratch.
        tick["current_placement"] = text[a.offset:a.offset + CURRENT_PLACEMENT]
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
