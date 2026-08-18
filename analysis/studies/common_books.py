"""Study 2 -- the Ethics common books.

Nicomachean Ethics V-VII and Eudemian Ethics IV-VI are the SAME TEXT. Every
modern editor prints it once, in the Nicomachean Ethics, and cross-references it
from the Eudemian. The question, argued since the 19th century and put on a
statistical footing by Anthony Kenny (*The Aristotelian Ethics*, 1978), is which
treatise it was written for.

The design here turns on one fact about this corpus: because the common books
are printed inside the Nicomachean Ethics, they are in the SAME FILE, by the
SAME EDITOR (Bywater's 1894 OCT), as the rest of the EN. So:

  * CB vs EN-proper is edition-controlled. Any difference is in the text.
  * CB vs EE is NOT: the EE here is Susemihl's 1884 Teubner. That comparison
    is reported, but it carries an editorial confound and is labelled as such.

Run:  python3 -m studies.common_books
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greekstyle import stylo
from greekstyle.features import FUNCTION_WORDS
from greekstyle.works import BY_ID, load_work

CHUNK = 2000
OUT = Path(__file__).resolve().parents[1] / "results"

CB_BOOKS = {"5", "6", "7"}


def en_split():
    toks = load_work(BY_ID["EN"])
    cb = [t.norm for t in toks if t.get("book") in CB_BOOKS]
    proper = [t.norm for t in toks if t.get("book") not in CB_BOOKS]
    return proper, cb


def build(chunk_size=CHUNK):
    en_proper, cb = en_split()
    ee = [t.norm for t in load_work(BY_ID["EE"])]

    groups = {
        "EN-proper": stylo.chunk(en_proper, chunk_size),
        "CommonBooks": stylo.chunk(cb, chunk_size),
        "EE": stylo.chunk(ee, chunk_size),
    }
    # Reference works, for the scale on which a Delta should be read.
    for wid in ("Meta", "Pol", "Rhet", "Phys", "Top", "DA"):
        groups[wid] = stylo.chunk([t.norm for t in load_work(BY_ID[wid])], chunk_size)
    return groups


def analyse(groups, vocab=FUNCTION_WORDS):
    labels, samples = [], []
    for g, chunks in groups.items():
        for c in chunks:
            labels.append(g)
            samples.append(c)
    labels = np.array(labels)
    m = stylo.matrix(samples, vocab)
    z, _, _ = stylo.zscore(m)
    return labels, z


def loo_centroid_delta(z, labels, target_group, ref_group):
    """Delta from each `target_group` row to the `ref_group` centroid.

    If the two groups are the same, the row itself is left out of the centroid,
    otherwise every point is pulled toward its own group and the comparison is
    rigged.
    """
    tgt = np.where(labels == target_group)[0]
    ref = np.where(labels == ref_group)[0]
    out = []
    for i in tgt:
        use = ref[ref != i]
        out.append(np.abs(z[i] - z[use].mean(axis=0)).mean())
    return np.array(out)


def main():
    results = {"chunk_size": CHUNK, "n_features": len(FUNCTION_WORDS)}
    groups = build()
    results["group_sizes"] = {k: len(v) for k, v in groups.items()}
    labels, z = analyse(groups)

    print("=" * 74)
    print("STUDY 2 -- THE ETHICS COMMON BOOKS")
    print("=" * 74)
    print(f"\n{CHUNK}-token chunks, {len(FUNCTION_WORDS)} function-word features\n")
    for g, c in groups.items():
        print(f"  {g:<13} {len(c):>3} chunks")

    # --- 1. edition-controlled test: CB vs EN-proper, same editor -----------
    print("\n" + "-" * 74)
    print("1. EDITION-CONTROLLED: are the common books unlike the rest of the EN?")
    print("   (same file, same editor Bywater 1894 -- no confound)")
    print("-" * 74)
    d_cb_en = loo_centroid_delta(z, labels, "CommonBooks", "EN-proper")
    d_en_en = loo_centroid_delta(z, labels, "EN-proper", "EN-proper")
    obs, p = stylo.permutation_test(d_cb_en, d_en_en)
    eff = stylo.cliffs_delta(d_cb_en, d_en_en)
    print(f"   Delta(common books -> EN-proper centroid) = {d_cb_en.mean():.3f}"
          f"  95% CI {stylo.bootstrap_ci(d_cb_en)}")
    print(f"   Delta(EN-proper    -> EN-proper centroid) = {d_en_en.mean():.3f}"
          f"  95% CI {stylo.bootstrap_ci(d_en_en)}")
    print(f"   difference = {obs:+.3f}   permutation p = {p:.4f}   Cliff's d = {eff:+.2f}")
    results["cb_vs_en_proper"] = {
        "delta_cb": float(d_cb_en.mean()), "delta_en": float(d_en_en.mean()),
        "diff": float(obs), "p": float(p), "cliffs_delta": float(eff),
    }

    # --- 2. the confounded comparison, reported as such ---------------------
    print("\n" + "-" * 74)
    print("2. CROSS-EDITION (confounded): common books vs the Eudemian Ethics")
    print("   (EE is Susemihl 1884 -- a different editor, so read with care)")
    print("-" * 74)
    d_cb_ee = loo_centroid_delta(z, labels, "CommonBooks", "EE")
    d_ee_ee = loo_centroid_delta(z, labels, "EE", "EE")
    print(f"   Delta(common books -> EE centroid)        = {d_cb_ee.mean():.3f}")
    print(f"   Delta(EE           -> EE centroid)        = {d_ee_ee.mean():.3f}")
    print(f"   Delta(common books -> EN-proper centroid) = {d_cb_en.mean():.3f}")
    closer = "EE" if d_cb_ee.mean() < d_cb_en.mean() else "EN-proper"
    print(f"   -> the common books sit closer to: {closer}")
    results["cb_vs_ee"] = {
        "delta_cb_to_ee": float(d_cb_ee.mean()),
        "delta_ee_to_ee": float(d_ee_ee.mean()),
        "closer_to": closer,
    }

    # --- 3. per-chunk verdicts ---------------------------------------------
    print("\n" + "-" * 74)
    print("3. CHUNK-BY-CHUNK: nearest centroid for each common-book sample")
    print("-" * 74)
    votes = {"EN-proper": 0, "EE": 0}
    for i, (a, b) in enumerate(zip(d_cb_en, d_cb_ee), 1):
        win = "EN-proper" if a < b else "EE"
        votes[win] += 1
        print(f"   chunk {i:>2}:  d(EN)={a:.3f}  d(EE)={b:.3f}   -> {win}")
    print(f"\n   tally: EN-proper {votes['EN-proper']}  |  EE {votes['EE']}")
    results["chunk_votes"] = votes

    # --- 4. scale: how far apart are undisputedly different works? ---------
    print("\n" + "-" * 74)
    print("4. SCALE -- the same statistic on works nobody disputes")
    print("-" * 74)
    scale = {}
    for g in ("Meta", "Pol", "Rhet", "Phys", "Top", "DA"):
        within = loo_centroid_delta(z, labels, g, g).mean()
        to_en = loo_centroid_delta(z, labels, g, "EN-proper").mean()
        scale[g] = {"within": float(within), "to_EN": float(to_en)}
        print(f"   {g:<6} within-work {within:.3f}   to EN-proper {to_en:.3f}")
    results["scale"] = scale

    # --- 5. which words carry the difference -------------------------------
    print("\n" + "-" * 74)
    print("5. THE WORDS DOING THE WORK (common books vs rest of the EN)")
    print("-" * 74)
    zi_cb = z[labels == "CommonBooks"].mean(axis=0)
    zi_en = z[labels == "EN-proper"].mean(axis=0)
    diff = zi_cb - zi_en
    order = np.argsort(-np.abs(diff))[:14]
    feats = []
    for j in order:
        w = FUNCTION_WORDS[j]
        arrow = "more" if diff[j] > 0 else "less"
        print(f"   {w:<10} {arrow:>4} frequent in the common books   (z {diff[j]:+.2f})")
        feats.append({"word": w, "z_diff": float(diff[j])})
    results["discriminating_words"] = feats

    OUT.mkdir(exist_ok=True)
    (OUT / "common_books.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nwrote {OUT/'common_books.json'}")


if __name__ == "__main__":
    main()
