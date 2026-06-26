"""Feasibility spike: Greek-sentence ↔ English-sentence alignment.

READ-ONLY. Writes nothing under build/dist, sources/, or the app. Optionally
dumps a scratch JSON under build/align/_sentence_spike/. No model calls.

Question: if we segment the Greek into sentences (it keeps its punctuation) and
bead-align them to the English sentences, does *bounding each Bekker tick to its
sentence* place ticks in the right sentence more reliably than the current
per-tick gloss aligner? And is the sentence the right unit (low bead cardinality)?

Method (all reuse except the two new bits — Greek segmentation + the bead DP):
  - Greek line text + tick cadence:  align.glossing  (chapter_lines, is_tick)
  - Greek glosses (already computed):  align.glossing.load_gloss
  - English sentence split + gold scorer surface:  align.aligner.split_sentences
  - English targets (Rackham gold + Ross) + cum_words:  align.reference.load_chapters
  - lexical similarity for the bead score:  align.similarity.cos_matrix

Gold is measurable only where real Bekker ticks live, i.e. with **Rackham as the
target** (its own embedded ticks, snapped to the containing sentence — exactly the
line-level tolerance the prior feasibility study said is the only defensible one).
This is the clean/optimistic surface; Ross is reported for cardinality/sanity only
(no gold there). See docs/gloss-aligner-recipe.md and the plan.

Usage (from pipeline/):
  uv run python tools/sentence_spike.py --work EN --book 1 --chapters 1,2
  uv run python tools/sentence_spike.py --work EN --book 1 --chapters 1,2 --dump
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aristotle_pipeline.align import similarity
from aristotle_pipeline.align.aligner import align_chapter, split_sentences
from aristotle_pipeline.align.glossing import chapter_lines, is_tick, load_gloss
from aristotle_pipeline.align.reference import default_target, load_chapters, load_gloss_chapters
from aristotle_pipeline.config import BUILD_DIR

# A comma-bound example marker (", οἷον …") is a clause Aristotle keeps inside one
# sentence but translators routinely promote to a NEW sentence — so the Greek grain
# is too coarse there. With examples=True, break the span right before such a οἷον.
_EXAMPLE = re.compile(r",\s+(?=οἷον\b)")
# Hard sentence enders (Greek '.' and the question marks); soft adds the ano teleia.
HARD = {".", ";", ";"}            # . , ; (ascii) , U+037E Greek question mark
SOFT = {"·", "·"}            # middle dot / ano teleia (mid-level pause)

ALPHA = 0.3   # weight on the length-ratio prior
BETA = 1.0    # weight on the lexical (gloss↔english) cosine
DEL = 0.25    # insertion / deletion penalty in the bead DP


# ---------------------------------------------------------------------------
# 1. Greek sentence segmentation (new)
# ---------------------------------------------------------------------------
@dataclass
class GSent:
    span: tuple        # (start_char, end_char) into the joined chapter string
    text: str
    lines: list        # ordered line citations whose start char falls in span
    ticks: list        # tick citations among `lines`
    w_start: int       # cum Greek words before the sentence
    w_end: int         # cum Greek words at the sentence end
    gloss: str         # concatenated line glosses (sense fingerprint, may be sparse)


def segment_greek(lines, gloss_map, soft: bool, examples: bool = False) -> tuple[list[GSent], dict, dict]:
    """lines = ordered glossing.Line for one chapter. Returns (sentences,
    line_start_char, line2sent) where line2sent maps every line citation to the
    index of the sentence its *start* falls in.
    examples=True additionally breaks a span right before a comma-bound `οἷον`
    (the example clause), matching how translators chunk such examples."""
    enders = HARD | SOFT if soft else HARD
    joined_parts, line_start_char, cum_before, wc = [], {}, {}, {}
    pos = words = 0
    for ln in lines:
        line_start_char[ln.citation] = pos
        cum_before[ln.citation] = words
        n = len(ln.text.split())
        wc[ln.citation] = n
        words += n
        joined_parts.append(ln.text)
        pos += len(ln.text) + 1            # +1 for the joining space
    joined = " ".join(joined_parts)

    # split into [start, end) char spans on runs of ender punctuation
    spans, start = [], 0
    i = 0
    while i < len(joined):
        if joined[i] in enders:
            j = i
            while j < len(joined) and (joined[j] in enders or joined[j] == " "):
                j += 1
            seg = joined[start:j].strip()
            if seg:
                spans.append((start, j, seg))
            start = j
            i = j
        else:
            i += 1
    tail = joined[start:].strip()
    if tail:
        spans.append((start, len(joined), tail))
    if not spans:
        spans = [(0, len(joined), joined)]

    # refine: split each span before a comma-bound `οἷον` so the example is its own
    # unit (operate on raw joined[s:e] to keep offsets aligned with line_start_char).
    if examples:
        refined = []
        for (s, e, _txt) in spans:
            cuts = [s + m.end() for m in _EXAMPLE.finditer(joined[s:e])]
            for a, b in zip([s] + cuts, cuts + [e]):
                seg = joined[a:b].strip()
                if seg:
                    refined.append((a, b, seg))
        spans = refined or spans

    ordered = [(c, line_start_char[c]) for c in line_start_char]
    sents, line2sent = [], {}
    for si, (s, e, txt) in enumerate(spans):
        mem = [c for c, lp in ordered if s <= lp < e]
        if not mem:                       # a sentence wholly inside one line
            owner = max((c for c, lp in ordered if lp <= s), default=ordered[0][0])
            mem = [owner]
        for c in mem:
            line2sent.setdefault(c, si)   # first sentence a line's start lands in
        ticks = [c for c in mem if is_tick(_line_n(c))]
        gl = " ".join(g for c in mem if (g := gloss_map.get(c, "").strip()))
        sents.append(GSent((s, e), txt, mem,
                           ticks, cum_before[mem[0]],
                           cum_before[mem[-1]] + wc[mem[-1]], gl))
    return sents, line_start_char, line2sent


def _line_n(citation: str) -> int:
    k = len(citation)
    while k > 0 and citation[k - 1].isdigit():
        k -= 1
    return int(citation[k:]) if k < len(citation) else 0


# ---------------------------------------------------------------------------
# 3. Many-to-many monotonic bead alignment (new)
# ---------------------------------------------------------------------------
OPS = [(1, 1), (1, 2), (2, 1), (2, 2), (1, 0), (0, 1)]


def _bead_score(gsents, esents, i, a, j, b) -> float:
    if a == 0 or b == 0:
        return -DEL
    gl = " ".join(gsents[i + k].gloss for k in range(a)).strip()
    en = " ".join(esents[j + k][1] for k in range(b)).strip()
    sim = similarity.cos_matrix([gl], [en], "lexical")[0][0] if gl and en else 0.0
    la, lb = len(gl), len(en)
    lp = 1.0 - abs(la - lb) / max(la + lb, 1)
    return BETA * sim + ALPHA * lp


def bead_align(gsents, esents) -> list[tuple]:
    """Monotonic bead DP over the two sentence streams. Returns ordered beads
    (i, a, j, b): greek[i:i+a] ↔ english[j:j+b]."""
    Ng, Ne = len(gsents), len(esents)
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def f(i, j):
        if i == Ng and j == Ne:
            return 0.0, None
        best, bestop = -1e9, None
        for a, b in OPS:
            if i + a > Ng or j + b > Ne or (a == 0 and b == 0):
                continue
            if (i == Ng and a) or (j == Ne and b):
                continue
            sc = _bead_score(gsents, esents, i, a, j, b) + f(i + a, j + b)[0]
            if sc > best:
                best, bestop = sc, (a, b)
        if bestop is None:                 # only a pure consume remains
            if i < Ng:
                return _bead_score(gsents, esents, i, 1, j, 0) + f(i + 1, j)[0], (1, 0)
            return _bead_score(gsents, esents, i, 0, j, 1) + f(i, j + 1)[0], (0, 1)
        return best, bestop

    beads, i, j = [], 0, 0
    while i < Ng or j < Ne:
        _sc, op = f(i, j)
        a, b = op
        beads.append((i, a, j, b))
        i, j = i + a, j + b
    return beads


# ---------------------------------------------------------------------------
# tick placement + scoring helpers
# ---------------------------------------------------------------------------
def containing_start(starts: list[int], off: int) -> int:
    return max((s for s in starts if s <= off), default=starts[0])


def interp_loo(knots, w: int, own_off: int) -> int | None:
    """Naive placement: linear interpolation by Greek word position `w` between
    the nearest knots, with THIS tick's own knot removed (leave-one-out). Knots
    include the chapter start/end so every interior tick is bracketed."""
    cand = sorted(p for p in set(knots) if p != (w, own_off))
    left = [p for p in cand if p[0] <= w]
    right = [p for p in cand if p[0] >= w]
    if not left or not right:
        return None
    lw, lo = max(left)
    rw, ro = min(right)
    if rw == lw:
        return lo
    return int(round(lo + (w - lw) / (rw - lw) * (ro - lo)))


def place_bounded(gsents, esents, beads, line2sent, cum_before, tick_cit) -> int | None:
    """Sentence-bounded offset for one tick: find its Greek sentence, its bead's
    English span, then proportional placement by Greek-word position."""
    si = line2sent.get(tick_cit)
    if si is None:
        return None
    bead = next((b for b in beads if b[0] <= si < b[0] + b[1] and b[3] > 0), None)
    if bead is None:
        return None
    _i, _a, j, b = bead
    c0 = esents[j][0]
    c1 = esents[j + b][0] if j + b < len(esents) else len(esents[-1][1]) + esents[-1][0]
    sg = gsents[si]
    span_w = sg.w_end - sg.w_start
    if span_w <= 0 or c1 <= c0:
        return c0
    rel = (cum_before.get(tick_cit, sg.w_start) - sg.w_start) / span_w
    return int(round(c0 + min(max(rel, 0.0), 1.0) * (c1 - c0)))


# ---------------------------------------------------------------------------
# driver
# ---------------------------------------------------------------------------
def _ostwald_target(book: int):
    """Ostwald prose + its DENSE, semantically-corrected inline Bekker markers as
    real gold (not Rackham-vs-itself). {(b,c): prose}, {(b,c): [(cit, off, 'dense')]}."""
    import json as _json
    from aristotle_pipeline.config import SOURCES_DIR
    from aristotle_pipeline.stage1_ostwald import apply_corrections, parse_ostwald
    op, oalign, *_ = parse_ostwald(SOURCES_DIR / "ostwald" / "ostwald-ethics.md")
    cp = SOURCES_DIR / "ostwald" / "bekker_corrections.json"
    if cp.exists():
        apply_corrections(op, oalign, _json.loads(cp.read_text(encoding="utf-8")))
    prose = {k: v for k, v in op.items() if k[0] == book}
    gold = {}
    for key, d in oalign.items():
        b, c = (int(x) for x in key.split(":"))
        if b == book:
            gold[(b, c)] = [(a["citation"], a["offset"], "dense") for a in d["anchors"]]
    return prose, gold


def run(work_id: str, book: int, chapters: list[int], dump: bool, which: str = "rackham"):
    _vid, sec = default_target(work_id)
    mile = {(c.book, int(c.chapter)): c for c in load_chapters(sec)}
    greek = {(c.book, c.chapter): c.lines for c in chapter_lines([book])}

    # The scored TARGET surface + its gold ticks.
    if which == "ostwald":
        tprose, tgold = _ostwald_target(book)
    else:
        tprose = {(b, c): mc.ref_text for (b, c), mc in mile.items() if b == book}
        tgold = {(b, c): [(a.citation, a.off, a.tier) for a in mc.ref_anchors if a.tier != "chapter"]
                 for (b, c), mc in mile.items() if b == book}
    tlabel = "Ostwald" if which == "ostwald" else "Rackham"
    # gloss-aligner (the real current method) reads the SAME target prose.
    glcs = {(c.book, int(c.chapter)): c
            for c in load_gloss_chapters(tprose, work_id, [book])}

    report = {"work": work_id, "book": book, "chapters": chapters, "target": which, "policies": {}}
    for soft in (False, True):
        pol = "soft(.;·)" if soft else "hard(.;)"
        sent_lens, n_sents, straddle_lines, total_lines = [], 0, 0, 0
        card = {"Rackham": {}, "Ross": {}, "Ostwald": {}}
        wrong = {"gloss": {}, "naive": {}, "bounded": {}}   # method -> tier -> [bool, ...]
        per_ch = {}

        for chap in chapters:
            mc = mile.get((book, chap))
            lines = greek.get((book, chap))
            prose_t = tprose.get((book, chap), "")
            if not mc or not lines or not prose_t.strip():
                continue
            gloss_map = load_gloss(work_id, book, chap)
            gsents, line_start, line2sent = segment_greek(lines, gloss_map, soft)
            cum_before = {c: 0 for c in line_start}
            w = 0
            for ln in lines:
                cum_before[ln.citation] = w
                w += len(ln.text.split())

            # metric 1 — Greek segmentation sanity
            n_sents += len(gsents)
            sent_lens += [len(s.text.split()) for s in gsents]
            for ln in lines:
                total_lines += 1
                a = line_start[ln.citation]
                b = a + len(ln.text)
                hit = {si for si, s in enumerate(gsents) if not (b <= s.span[0] or a >= s.span[1])}
                if len(hit) > 1:
                    straddle_lines += 1

            # metric 2 — bead cardinality across translations (Rackham/Ross/Ostwald)
            tbeads = tes = None
            for label, prose in (("Rackham", mc.ref_text), ("Ross", mc.ross_text),
                                 ("Ostwald", tprose.get((book, chap), "") if which == "ostwald" else "")):
                if not prose.strip():
                    continue
                esents = split_sentences(prose)
                beads = bead_align(gsents, esents)
                for (_i, a, _j, b) in beads:
                    card[label][f"{a}:{b}"] = card[label].get(f"{a}:{b}", 0) + 1
                if label == tlabel:
                    tbeads, tes = beads, esents
            if tbeads is None:                      # target not in the metric-2 list (Rackham case)
                tes = split_sentences(prose_t)
                tbeads = bead_align(gsents, tes)

            # metric 3 — tick tightening vs gold on the TARGET surface.
            # naive = proportional interp between TRUE neighbouring ticks (LOO);
            # gloss = the real gloss-aligner (cadence ticks only — where it predicts);
            # bounded = sentence-bounded placement (uses NO gold ticks).
            starts = [s for s, _ in tes] or [0]
            tot_w = (cum_before[lines[-1].citation] + len(lines[-1].text.split())) if lines else 1
            ref = [(cit, off, t) for (cit, off, t) in tgold.get((book, chap), []) if cit in cum_before]
            knots = [(0, 0), (tot_w, len(prose_t))] + [(cum_before[cit], off) for cit, off, _ in ref]
            gc = glcs.get((book, chap))
            gloss_off = {a.citation: a.offset for a in align_chapter(gc, "lexical")} if gc else {}
            ch_rows = []
            for cit, off, t in ref:
                gstart = containing_start(starts, off)
                w = cum_before[cit]
                naive_off = interp_loo(knots, w, off)
                bnd_off = place_bounded(gsents, tes, tbeads, line2sent, cum_before, cit)
                naive_wrong = naive_off is None or containing_start(starts, naive_off) != gstart
                bnd_wrong = bnd_off is None or containing_start(starts, bnd_off) != gstart
                wrong["naive"].setdefault(t, []).append(naive_wrong)
                wrong["bounded"].setdefault(t, []).append(bnd_wrong)
                row = {"cit": cit, "tier": t, "gold_sent": gstart,
                       "naive": naive_off, "naive_wrong": naive_wrong,
                       "bnd": bnd_off, "bnd_wrong": bnd_wrong}
                if is_tick(_line_n(cit)):            # gloss aligner only predicts cadence ticks
                    gl_off = gloss_off.get(cit)
                    gl_wrong = gl_off is None or containing_start(starts, gl_off) != gstart
                    wrong["gloss"].setdefault(t, []).append(gl_wrong)
                    row.update(gloss=gl_off, gloss_wrong=gl_wrong)
                ch_rows.append(row)
            per_ch[chap] = ch_rows

        report["policies"][pol] = {
            "greek_seg": {
                "sentences": n_sents,
                "median_words": statistics.median(sent_lens) if sent_lens else 0,
                "max_words": max(sent_lens) if sent_lens else 0,
                "straddle_lines_pct": round(100 * straddle_lines / max(total_lines, 1), 1),
            },
            "cardinality": {k: _card_pct(v) for k, v in card.items()},
            "tick_tightening": {
                "gloss": _wrong_summary(wrong["gloss"]),
                "naive": _wrong_summary(wrong["naive"]),
                "bounded": _wrong_summary(wrong["bounded"]),
            },
            "_per_chapter": per_ch if dump else None,
        }
    _print(report)
    if dump:
        out = BUILD_DIR / "align" / "_sentence_spike"
        out.mkdir(parents=True, exist_ok=True)
        p = out / f"{work_id}_b{book}_{report['target']}_{'-'.join(map(str, chapters))}.json"
        p.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n[dump] {p}")
    return report


def _card_pct(counts: dict) -> dict:
    tot = sum(counts.values()) or 1
    low = sum(c for k, c in counts.items()
              if k in ("1:1", "1:2", "2:1"))
    return {"counts": dict(sorted(counts.items())),
            "low_card_pct": round(100 * low / tot, 1), "beads": tot}


def _wrong_summary(by_tier: dict) -> dict:
    out, allv = {}, []
    for t, vals in sorted(by_tier.items()):
        allv += vals
        out[t] = {"n": len(vals), "wrong_sent_pct": round(100 * sum(vals) / len(vals), 1)}
    if allv:
        out["overall"] = {"n": len(allv), "wrong_sent_pct": round(100 * sum(allv) / len(allv), 1)}
    return out


def _print(r: dict):
    print(f"\n=== sentence-alignment spike — {r['work']} book {r['book']} ch {r['chapters']} "
          f"| TARGET={r['target']} (gold) ===")
    for pol, d in r["policies"].items():
        g = d["greek_seg"]
        print(f"\n--- Greek policy: {pol} ---")
        print(f"  [1] greek-seg: {g['sentences']} sentences | "
              f"median {g['median_words']}w, max {g['max_words']}w | "
              f"lines straddling a boundary: {g['straddle_lines_pct']}%")
        for label, c in d["cardinality"].items():
            if not c["beads"]:
                continue
            print(f"  [2] beads vs {label:8s}: {c['beads']} beads | "
                  f"low-cardinality (1:1/1:2/2:1) {c['low_card_pct']}% | {c['counts']}")
        tt = d["tick_tightening"]
        print(f"  [3] wrong-sentence rate ({r['target']} gold; gloss-aligner vs naive interp vs sentence-bounded):")
        for method in ("gloss", "naive", "bounded"):
            parts = [f"{t}={v['wrong_sent_pct']}%(n{v['n']})"
                     for t, v in tt[method].items() if t != "overall"]
            ov = tt[method].get("overall", {})
            print(f"        {method:8s}: overall {ov.get('wrong_sent_pct','-')}% "
                  f"(n{ov.get('n','-')}) | " + "  ".join(parts))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="EN")
    ap.add_argument("--book", type=int, default=1)
    ap.add_argument("--chapters", default="1,2")
    ap.add_argument("--dump", action="store_true")
    ap.add_argument("--target", default="rackham", choices=["rackham", "ostwald"],
                    help="scored gold surface: rackham (self) or ostwald (dense, paraphrase)")
    a = ap.parse_args()
    run(a.work, a.book, [int(x) for x in a.chapters.split(",")], a.dump, a.target)
