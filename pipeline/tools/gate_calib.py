"""Confidence-gate calibration harness — decide which beads need Opus verify.

READ-ONLY research tool. No model calls, no writes outside optional scratch.

Principle: the free DP aligner is already near the off-by-<=1 ceiling on the easy
beads; the LLM only *beats* it where the matcher is confidently wrong (global
context the local signals can't see). So we test whether any FREE signal can flag
those beads cheaply, so Opus verify is spent only there.

Per-bead signals, all free:
  card  : bead is non-1:1  (a!=1 or b!=1)
  dup   : Greek sentence near-duplicates another nearby Greek sentence (lexical)
  margin: S[i][j] - max(S[i][j-1], S[i][j+1])   (how close to sliding by one)
  abs   : S[i][j]                               (absolute match strength)
  xdis  : CROSS-TRANSLATION disagreement. With >=2 translations aligned to the
          SAME Greek, each Greek sentence sg gets a fractional English position
          frac_t(sg) = mean(bead english idx) / n_e   in each translation t.
          xdis(sg) = max_t frac - min_t frac. High => the translations disagree
          about where sg lands => a likely slip in at least one. Uses redundancy,
          not local confidence — structurally different from the other four.

Gate: verify if  card OR dup>=tau OR margin<m0 OR abs<s0 OR xdis>=x0.

Calibration is against the REAL anchor gold (anchors.yaml), measuring
verify_fraction (Opus cost) vs catch_rate (P(gated | DP wrong)) and a projected
post-gate accuracy (gated bead -> LLM rate; un-gated -> DP outcome).

Usage (from pipeline/):
  uv run python tools/gate_calib.py --work Cat --trans edghill,taylor,ackrill
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sentence_interp as si
from aristotle_pipeline.align import similarity

LLM_EXACT, LLM_OFF1 = 0.774, 0.966
DP_CFG = dict(matcher="lexical", gloss="tick", length="gloss",
              names=False, alpha=0.3, beta=1.0)
DUP_WINDOW = 8


def greek_dup_scores(gtexts, window):
    n = len(gtexts)
    if n < 2:
        return [0.0] * n
    G = similarity.cos_matrix(gtexts, gtexts, "lexical")
    out = []
    for i in range(n):
        best = 0.0
        for k in range(n):
            if k == i or (window and abs(k - i) > window):
                continue
            best = max(best, G[i][k])
        out.append(best)
    return out


def chapter_dp(work, chap, gsents, sents, dup):
    """Run the free DP; return (feat_per_bead, greek_to_feat, greek_to_frac, g2e)."""
    eng_txt = [t for _, t in sents]
    n_e = len(eng_txt) or 1
    fps = si.fingerprints(gsents, work, chap, DP_CFG["gloss"])
    S = similarity.cos_matrix(fps, eng_txt, DP_CFG["matcher"])
    score = si.make_scorer(gsents, sents, fps, DP_CFG, 1.0)
    beads = si.bead_align(len(gsents), len(sents), score)
    g2e = si.gsent_to_engspan(beads, len(gsents))

    feats, g2f, gidx_of = [], {}, []
    for (i, a, b_j, b) in beads:
        card = (a != 1 or b != 1)
        d = max((dup[i + t] for t in range(a)), default=0.0)
        if not card:
            j = b_j
            s = S[i][j]
            left = S[i][j - 1] if j > 0 else -1.0
            right = S[i][j + 1] if j + 1 < len(eng_txt) else -1.0
            m = s - max(left, right)
        else:
            s = m = None
        feat = {"card": card, "s": s, "m": m, "d": d, "x": 0.0}
        feats.append(feat)
        gidx_of.append(list(range(i, i + a)))
        for t in range(a):
            g2f[i + t] = feat
    # fractional english position per Greek sentence (for cross-translation xdis)
    frac = {}
    for sg, span in g2e.items():
        if span:
            frac[sg] = (sum(span) / len(span)) / n_e
    return feats, gidx_of, g2f, frac, g2e


def collect(work, trans, soft=True):
    gch = si.greek_chapters(soft)
    l2c = si.line_to_chapter()
    dup_by_chap = {c: greek_dup_scores([g.text for g in gch[c][1]], DUP_WINDOW) for c in gch}
    man = si.Manifest.for_work(work).data["english"]
    slot_of = {man[s]["id"]: s for s in ("primary", "secondary", "third") if man.get(s)}

    # pass 1: run DP per (vid, chap); stash feats + per-greek fracs + gold
    stash = []          # (chap, feats, gidx_of)
    fracs = {}          # (chap, sg) -> [frac across vids]
    gold_raw = []       # (chap, sg, d, g2f_ref)
    for vid in trans:
        slot = slot_of.get(vid)
        if not slot:
            continue
        _id, prose, anchors = si.load_translation(work, slot)
        esent = {c: si.eng_sentences(prose[(1, c)], fine=soft) for c in gch if (1, c) in prose}
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
            gold.append((chap, sg, se))

        for chap in sorted({g[0] for g in gold}):
            feats, gidx_of, g2f, frac, g2e = chapter_dp(
                work, chap, gch[chap][1], esent[chap][0], dup_by_chap[chap])
            stash.append((chap, feats, gidx_of))
            for sg, fr in frac.items():
                fracs.setdefault((chap, sg), []).append(fr)
            for (gc, sg, se) in gold:
                if gc != chap:
                    continue
                d = min((abs(e - se) for e in g2e.get(sg, set())), default=99)
                gold_raw.append((chap, sg, d, g2f.get(sg)))

    # pass 2: cross-translation spread, then attach x to every feat
    spread = {}
    for key, vals in fracs.items():
        spread[key] = (max(vals) - min(vals)) if len(vals) >= 2 else 0.0
    all_beads = []
    for chap, feats, gidx_of in stash:
        for feat, gidx in zip(feats, gidx_of):
            feat["x"] = max((spread.get((chap, sg), 0.0) for sg in gidx), default=0.0)
            all_beads.append(feat)
    gold = [(g2f, d) for (chap, sg, d, g2f) in gold_raw if g2f is not None]
    return all_beads, gold


def gated(f, tau, m0, s0, x0, use_card=True):
    if use_card and f["card"]:
        return True
    if f["d"] >= tau:
        return True
    if f["s"] is not None and f["s"] < s0:
        return True
    if f["m"] is not None and f["m"] < m0:
        return True
    if f["x"] >= x0:
        return True
    return False


def evaluate(all_beads, gold, tau=2.0, m0=-1.0, s0=-1.0, x0=99, use_card=True):
    nb = len(all_beads) or 1
    vfrac = sum(gated(f, tau, m0, s0, x0, use_card) for f in all_beads) / nb
    N = len(gold) or 1
    wrong = [(f, d) for (f, d) in gold if d >= 1]
    sev = [(f, d) for (f, d) in gold if d >= 2]
    caught = sum(gated(f, tau, m0, s0, x0, use_card) for (f, d) in wrong)
    caught_sev = sum(gated(f, tau, m0, s0, x0, use_card) for (f, d) in sev)
    pe = po = 0.0
    for (f, d) in gold:
        if gated(f, tau, m0, s0, x0, use_card):
            pe += LLM_EXACT; po += LLM_OFF1
        else:
            pe += 1.0 if d == 0 else 0.0
            po += 1.0 if d <= 1 else 0.0
    return dict(vfrac=vfrac, catch=caught / (len(wrong) or 1),
                catch_sev=caught_sev / (len(sev) or 1),
                proj_exact=pe / N, proj_off1=po / N,
                n_beads=len(all_beads), n_gold=N, n_wrong=len(wrong), n_sev=len(sev))


def main(work, trans):
    beads, gold = collect(work, trans)
    N = len(gold) or 1
    pure_exact = sum(1 for (f, d) in gold if d == 0) / N
    pure_off1 = sum(1 for (f, d) in gold if d <= 1) / N
    full = evaluate(beads, gold, tau=-1.0)

    print(f"\n=== gate calibration (+cross-translation) — {work} | {', '.join(trans)} ===")
    print(f"beads={full['n_beads']}  gold={N}  DP-wrong(d>=1)={full['n_wrong']}  severe(d>=2)={full['n_sev']}")
    print(f"pure DP   : exact {100*pure_exact:.1f}  off1 {100*pure_off1:.1f}")
    print(f"verify-all: exact {100*full['proj_exact']:.1f}  off1 {100*full['proj_off1']:.1f}\n")

    # Is cross-translation disagreement predictive ON ITS OWN? (no cardinality)
    print("xdis ALONE (no cardinality) — is disagreement predictive at all?")
    print(f"  {'x0':>6} {'vfrac%':>7} {'catch%':>7} {'catchSev%':>9}")
    for x0 in (0.02, 0.05, 0.10, 0.15, 0.20, 0.30):
        r = evaluate(beads, gold, x0=x0, use_card=False)
        print(f"  {x0:6.2f} {100*r['vfrac']:7.1f} {100*r['catch']:7.1f} {100*r['catch_sev']:9.1f}")

    # xdis added on top of cardinality
    print("\ncardinality + xdis:")
    print(f"  {'x0':>6} {'vfrac%':>7} {'catch%':>7} {'catchSev%':>9} {'proj_off1':>10}")
    for x0 in (0.30, 0.20, 0.15, 0.10, 0.05):
        r = evaluate(beads, gold, x0=x0)
        print(f"  {x0:6.2f} {100*r['vfrac']:7.1f} {100*r['catch']:7.1f} "
              f"{100*r['catch_sev']:9.1f} {100*r['proj_off1']:10.1f}")

    # full gate incl xdis: min verify-fraction to reach catch targets
    print("\nfull gate (card OR dup>=tau OR margin<m0 OR abs<s0 OR xdis>=x0):")
    print("min verify-fraction to reach a catch target —")
    wide = []
    for tau in (0.40, 0.55, 0.70):
        for m0 in (0.05, 0.10, 0.20):
            for s0 in (0.05, 0.15, 0.30):
                for x0 in (0.05, 0.10, 0.20, 0.99):
                    wide.append(evaluate(beads, gold, tau, m0, s0, x0))
    for target in (0.80, 0.90, 0.95):
        ok = [r for r in wide if r["catch"] >= target]
        if ok:
            b = min(ok, key=lambda r: r["vfrac"])
            print(f"  catch >={int(target*100)}%  ->  verify {100*b['vfrac']:.0f}% of beads "
                  f"(off1 {100*b['proj_off1']:.1f})")
        else:
            mx = max(wide, key=lambda r: r["catch"])
            print(f"  catch >={int(target*100)}%  ->  UNREACHABLE (max {100*mx['catch']:.0f}% "
                  f"at verify {100*mx['vfrac']:.0f}%)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="Cat")
    ap.add_argument("--trans", default="edghill,taylor,ackrill")
    a = ap.parse_args()
    main(a.work, a.trans.split(","))
