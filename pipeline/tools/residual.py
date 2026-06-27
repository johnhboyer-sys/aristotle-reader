"""Human-pass workload inventory for the INTERPOLATION edition.

READ-ONLY. For one work + translation, list the rows a human would have to fix in
the parallel/interpolated edition under (a) the FREE DP and (b) the already-run
Sonnet LLM beads. Shows, per off-row, the Greek clause, where the aligner placed
it, and the gold anchor's true English sentence, so the actual correction effort
is visible — and the marginal gap Opus would close.

Tiers: off-by-1 = adjacent (usually invisible in an edition); off-by>=2 = a row a
reader would see as misaligned = the real hand-correction workload.

Usage (from pipeline/):
  uv run python tools/residual.py --work Cat --trans edghill
  uv run python tools/residual.py --work Cat --trans edghill --list   # show off>=2 rows
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sentence_interp as si
from aristotle_pipeline.align import similarity

DP_CFG = dict(matcher="lexical", gloss="tick", length="gloss",
              names=False, alpha=0.3, beta=1.0)


def trunc(s, n=64):
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n - 1] + "…"


def dp_g2e(work, chap, gsents, sents):
    eng_txt = [t for _, t in sents]
    fps = si.fingerprints(gsents, work, chap, DP_CFG["gloss"])
    si.similarity = similarity  # ensure same module
    score = si.make_scorer(gsents, sents, fps, DP_CFG, 1.0)
    beads = si.bead_align(len(gsents), len(sents), score)
    return si.gsent_to_engspan(beads, len(gsents))


def main(work, trans, show_list):
    ex = si.detect_examples(work)   # segment at the grain the beads index into
    gch = si.greek_chapters(soft=True, examples=ex)
    l2c = si.line_to_chapter()
    man = si.Manifest.for_work(work).data["english"]
    slot_of = {man[s]["id"]: s for s in ("primary", "secondary", "third") if man.get(s)}
    slot = slot_of[trans]
    _id, prose, anchors = si.load_translation(work, slot)
    esent = {c: si.eng_sentences(prose[(1, c)], fine=True) for c in gch if (1, c) in prose}

    # gold: (chap, sg, se, bekker, phrase)
    gold = []
    for a in anchors:
        chap = l2c.get(a["bekker"])
        if chap is None or (1, chap) not in prose:
            continue
        sg = gch[chap][2].get(a["bekker"])
        off = prose[(1, chap)].find(a["at"])
        if sg is None or off < 0:
            continue
        se = si.eng_sent_index(esent[chap][1], off)
        gold.append((chap, sg, se, a["bekker"], a["at"]))

    have_llm = (si.BUILD_DIR / "align" / "interp_out" / work).exists()

    rows = []  # (chap, bekker, d_dp, d_llm, greek, placed_dp, target)
    per_chap = {}
    for chap in sorted({g[0] for g in gold}):
        gsents = gch[chap][1]
        sents = esent[chap][0]
        eng = [t for _, t in sents]
        g2e = dp_g2e(work, chap, gsents, sents)
        g2e_llm = si.llm_beads(work, chap) if have_llm else None
        for (gc, sg, se, bek, phr) in gold:
            if gc != chap:
                continue
            d_dp = min((abs(e - se) for e in g2e.get(sg, set())), default=99)
            d_llm = (min((abs(e - se) for e in g2e_llm.get(sg, set())), default=99)
                     if g2e_llm is not None else None)
            placed = " ".join(eng[e] for e in sorted(g2e.get(sg, set()))) or "—"
            target = eng[se] if se < len(eng) else "—"
            rows.append((chap, bek, d_dp, d_llm, gsents[sg].text, placed, target, phr))
            c = per_chap.setdefault(chap, dict(n=0, dp1=0, dp2=0, llm1=0, llm2=0))
            c["n"] += 1
            c["dp1"] += d_dp >= 1; c["dp2"] += d_dp >= 2
            if d_llm is not None:
                c["llm1"] += d_llm >= 1; c["llm2"] += d_llm >= 2

    N = len(rows)
    dp1 = sum(r[2] >= 1 for r in rows); dp2 = sum(r[2] >= 2 for r in rows)
    llm1 = sum((r[3] or 0) >= 1 for r in rows) if have_llm else None
    llm2 = sum((r[3] or 0) >= 2 for r in rows) if have_llm else None

    print(f"\n=== interpolation human-pass inventory — {work} / {trans} ===")
    print(f"anchored rows checked: {N}  (across {len(per_chap)} chapters)\n")
    print(f"{'tier':28} {'free DP':>10} {'Sonnet LLM':>12}")
    print(f"{'off-by-1 (adjacent, usually ok)':28} {dp1-dp2:>10} "
          f"{(llm1-llm2) if have_llm else '-':>12}")
    print(f"{'off-by>=2 (REAL fix workload)':28} {dp2:>10} {llm2 if have_llm else '-':>12}")
    print(f"{'  -> rows a human must nudge':28} {dp2:>10} {llm2 if have_llm else '-':>12}")
    if have_llm:
        print(f"\nSonnet already removes {dp2-llm2} of the {dp2} free-DP problem rows; "
              f"{llm2} remain. Opus would target those {llm2}.")
    print(f"\nper-chapter off>=2:  " + "  ".join(
        f"ch{c}:{per_chap[c]['dp2']}/{per_chap[c].get('llm2','-') if have_llm else '-'}"
        for c in sorted(per_chap)) + "   (free / Sonnet)")

    if show_list:
        worst = sorted([r for r in rows if r[2] >= 2 or (r[3] or 0) >= 2],
                       key=lambda r: -(max(r[2], r[3] or 0)))
        print(f"\n--- off-by>=2 rows (the actual hand-fix list) ---")
        for (chap, bek, d_dp, d_llm, gk, placed, target, phr) in worst:
            tag = f"DP off{d_dp}" + (f" / LLM off{d_llm}" if d_llm is not None else "")
            print(f"\n[{bek}] {tag}")
            print(f"  Greek : {trunc(gk)}")
            print(f"  placed: {trunc(placed)}")
            print(f"  should: …{trunc(phr,40)}… in “{trunc(target)}”")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--trans", default="edghill")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    main(a.work, a.trans, a.list)
