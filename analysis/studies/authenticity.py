"""Study 1 -- does function-word style recover the received view of the corpus?

The Corpus Aristotelicum as printed contains a dozen works that essentially no
one now attributes to Aristotle: De Mundo, Mechanica, De Mirabilibus, On
Colours, De Audibilibus, Physiognomonics, On Indivisible Lines, Situations of
Winds, Melissus/Xenophanes/Gorgias, De Spiritu, Virtues and Vices, Oeconomica.
That consensus was reached philologically, over four centuries, without
counting anything.

This is therefore a scored test with an answer key that was written down in
advance and not by us. The labels in works.py are used ONLY to grade the result
afterwards; the clustering never sees them.

Two confounds are live and are reported rather than hidden:
  * GENRE. The spuria are mostly short technical or paradoxographical pieces,
    and Aristotle's own short technical pieces may look like them for reasons
    that have nothing to do with authorship.
  * LENGTH. A work with three chunks has a noisier mean than one with forty, so
    every distance is given with a bootstrap interval.

Run:  python3 -m studies.authenticity
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greekstyle import stylo
from greekstyle.features import FUNCTION_WORDS
from greekstyle.works import WORKS, load_work

CHUNK = 1500
MIN_TOKENS = 1500
OUT = Path(__file__).resolve().parents[1] / "results"


def build():
    labels, samples, meta = [], [], {}
    for w in WORKS:
        toks = [t.norm for t in load_work(w)]
        if len(toks) < MIN_TOKENS:
            meta[w.wid] = {"skipped": True, "tokens": len(toks)}
            continue
        cs = stylo.chunk(toks, CHUNK)
        if not cs:
            meta[w.wid] = {"skipped": True, "tokens": len(toks)}
            continue
        meta[w.wid] = {"skipped": False, "tokens": len(toks), "chunks": len(cs),
                       "status": w.status, "group": w.group, "editor": w.editor,
                       "title": w.title}
        for c in cs:
            labels.append(w.wid)
            samples.append(c)
    return np.array(labels), samples, meta


def main():
    labels, samples, meta = build()
    z, _, _ = stylo.zscore(stylo.matrix(samples, FUNCTION_WORDS))
    live = [w for w in WORKS if not meta[w.wid]["skipped"]]
    status = {w.wid: w.status for w in live}

    print("=" * 78)
    print("STUDY 1 -- AUTHENTICITY MAP OF THE CORPUS ARISTOTELICUM")
    print("=" * 78)
    skipped = [k for k, v in meta.items() if v["skipped"]]
    print(f"\n{CHUNK}-token chunks, {len(FUNCTION_WORDS)} features, "
          f"{len(live)} works, {len(samples)} chunks")
    if skipped:
        print(f"excluded as too short (<{MIN_TOKENS} tokens): "
              + ", ".join(f"{k} ({meta[k]['tokens']})" for k in skipped))

    # --- distance to the core, leaving the work itself out of the core ------
    core_ids = [w.wid for w in live if w.status == "core"]
    print("\n" + "-" * 78)
    print("DISTANCE FROM THE 'CORE ARISTOTLE' CENTROID")
    print("(leave-one-work-out: a core work is never compared against itself)")
    print("-" * 78)
    print(f"{'work':<8}{'status':<10}{'n':>4}{'Delta':>8}  {'95% CI':<18}nearest neighbour")

    rows = []
    for w in live:
        idx = np.where(labels == w.wid)[0]
        ref = np.where(np.isin(labels, [c for c in core_ids if c != w.wid]))[0]
        d = np.abs(z[idx] - z[ref].mean(axis=0)).mean(axis=1)
        lo, hi = stylo.bootstrap_ci(d) if len(d) > 2 else (float("nan"), float("nan"))
        # nearest other work, by centroid-to-centroid Delta
        me = z[idx].mean(axis=0)
        best, bd = None, 1e9
        for o in live:
            if o.wid == w.wid:
                continue
            dd = np.abs(me - z[labels == o.wid].mean(axis=0)).mean()
            if dd < bd:
                best, bd = o.wid, dd
        rows.append({"wid": w.wid, "status": w.status, "group": w.group,
                     "chunks": len(idx), "delta": float(d.mean()),
                     "ci": [lo, hi], "nearest": best, "nearest_delta": float(bd)})

    for r in sorted(rows, key=lambda r: r["delta"]):
        ci = f"[{r['ci'][0]:.2f}, {r['ci'][1]:.2f}]" if r["ci"][0] == r["ci"][0] else "     --      "
        mark = " *" if r["status"] == "spurious" else ""
        print(f"{r['wid']:<8}{r['status']:<10}{r['chunks']:>4}{r['delta']:>8.3f}  "
              f"{ci:<18}{r['nearest']} ({r['nearest_delta']:.2f}){mark}")

    # --- does it separate? --------------------------------------------------
    core_d = np.array([r["delta"] for r in rows if r["status"] == "core"])
    sp_d = np.array([r["delta"] for r in rows if r["status"] == "spurious"])
    obs, p = stylo.permutation_test(sp_d, core_d)
    eff = stylo.cliffs_delta(sp_d, core_d)
    print("\n" + "-" * 78)
    print("SCORING AGAINST THE RECEIVED VIEW")
    print("-" * 78)
    print(f"  core works    n={len(core_d):>2}  mean Delta to core {core_d.mean():.3f}")
    print(f"  spurious      n={len(sp_d):>2}  mean Delta to core {sp_d.mean():.3f}")
    print(f"  difference {obs:+.3f}   permutation p = {p:.4f}   Cliff's d = {eff:+.2f}")

    # Rank-based: how well does raw distance rank the spuria first?
    order = sorted(rows, key=lambda r: -r["delta"])
    k = len(sp_d)
    hits = sum(1 for r in order[:k] if r["status"] == "spurious")
    print(f"\n  taking the {k} most distant works, {hits} of {k} are the consensus spuria")
    print(f"  (chance would be about {k*k/len(rows):.1f})")

    auc = float((sp_d[:, None] > core_d[None, :]).mean()
                + 0.5 * (sp_d[:, None] == core_d[None, :]).mean())
    print(f"  AUC separating spurious from core by distance alone: {auc:.3f}")

    # --- the misses, named --------------------------------------------------
    print("\n  where it disagrees with the handbooks:")
    for r in order[:k]:
        if r["status"] != "spurious":
            print(f"    {r['wid']:<7} is ranked among the most distant but is "
                  f"considered genuine ({r['group']})")
    for r in order[k:]:
        if r["status"] == "spurious":
            print(f"    {r['wid']:<7} is considered spurious but sits inside the "
                  f"core range (nearest: {r['nearest']})")

    # --- genre-matched comparison ------------------------------------------
    # The misclassifications above are not random: the "genuine but distant"
    # works are the formal ones (Topics, both Analytics, Physics) and PC1 is
    # carried by ει / οτι / τι, which is the vocabulary of logical formalism,
    # not of authorship. So the headline number is partly measuring genre. The
    # fix is to score each spurious work only against genuine works of
    # comparable kind and length.
    SHORT_TREATISE_CORE = ["Sens", "Mem", "Somn", "Insomn", "Long", "Juv", "IA"]
    SHORT_SPURIOUS = ["Col", "Aud", "Phgn", "Lin", "Spir", "Mech", "Mirab", "DM", "MXG"]
    PRACTICAL_CORE = ["EN", "EE", "Pol", "Rhet"]
    PRACTICAL_SPURIOUS = ["Oec"]

    print("\n" + "-" * 78)
    print("GENRE-MATCHED CONTROL")
    print("(each spurious work scored against genuine works of similar kind/length,")
    print(" instead of against the whole core, which is dominated by long treatises)")
    print("-" * 78)
    matched = {}
    for name, core_set, sp_set in (
        ("short natural treatises", SHORT_TREATISE_CORE, SHORT_SPURIOUS),
        ("practical philosophy", PRACTICAL_CORE, PRACTICAL_SPURIOUS),
    ):
        core_set = [c for c in core_set if c in set(labels)]
        sp_set = [c for c in sp_set if c in set(labels)]
        if not core_set or not sp_set:
            continue
        # Genuine works get a leave-one-out centroid (built from the other
        # n-1), spurious works get the full one. A fuller centroid is a slightly
        # easier target, so this asymmetry works AGAINST separation -- the AUC
        # below is a conservative estimate, not a flattering one.
        ref_all = np.where(np.isin(labels, core_set))[0]
        cd, sd = [], []
        print(f"\n  {name}: genuine = {', '.join(core_set)}")
        for wid in core_set:
            idx = np.where(labels == wid)[0]
            ref = np.where(np.isin(labels, [c for c in core_set if c != wid]))[0]
            v = np.abs(z[idx] - z[ref].mean(axis=0)).mean(axis=1).mean()
            cd.append(v)
            print(f"    {wid:<8}{'genuine':<10}{v:.3f}")
        for wid in sp_set:
            idx = np.where(labels == wid)[0]
            v = np.abs(z[idx] - z[ref_all].mean(axis=0)).mean(axis=1).mean()
            sd.append(v)
            flag = "" if v > max(cd) else "   <- inside the genuine range"
            print(f"    {wid:<8}{'spurious':<10}{v:.3f}{flag}")
        cd, sd = np.array(cd), np.array(sd)
        a = float((sd[:, None] > cd[None, :]).mean() + 0.5 * (sd[:, None] == cd[None, :]).mean())
        print(f"    -> genuine mean {cd.mean():.3f}, spurious mean {sd.mean():.3f}, AUC {a:.3f}")
        matched[name] = {"core": core_set, "spurious": sp_set,
                         "core_mean": float(cd.mean()), "spurious_mean": float(sd.mean()),
                         "auc": a}

    # --- PCA ---------------------------------------------------------------
    sc, load, ev = stylo.pca(z, 2)
    print("\n" + "-" * 78)
    print(f"PC1 explains {100*ev[0]:.1f}%, PC2 {100*ev[1]:.1f}% of variance")
    print("-" * 78)
    cen = {w.wid: sc[labels == w.wid].mean(axis=0) for w in live}
    for st in ("core", "disputed", "spurious"):
        ids = [w.wid for w in live if w.status == st]
        if not ids:
            continue
        m = np.array([cen[i] for i in ids])
        print(f"  {st:<9} PC1 mean {m[:,0].mean():+.2f}   PC2 mean {m[:,1].mean():+.2f}")
    top = np.argsort(-np.abs(load[0]))[:8]
    print("  PC1 is carried by: " + ", ".join(FUNCTION_WORDS[j] for j in top))

    results = {"chunk": CHUNK, "works": rows, "meta": meta,
               "core_mean": float(core_d.mean()), "spurious_mean": float(sp_d.mean()),
               "p": float(p), "cliffs_delta": float(eff), "auc": auc,
               "top_k_hits": int(hits), "k": int(k),
               "genre_matched": matched,
               "pca_explained": [float(x) for x in ev],
               "pc1_features": [FUNCTION_WORDS[j] for j in top]}
    OUT.mkdir(exist_ok=True)
    (OUT / "authenticity.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nwrote {OUT/'authenticity.json'}")


if __name__ == "__main__":
    main()
