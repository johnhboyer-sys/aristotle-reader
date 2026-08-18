"""Study 2b -- attempts to break the common-books result.

A single configuration agreeing with Kenny proves very little; what matters is
whether the finding survives choices that were made arbitrarily. This script
varies each of them in turn:

  chunk size          1000 / 1500 / 2000 / 2500 / 3000 tokens
  feature set         all function words / particles only / article only /
                      prepositions only / top discriminators ABLATED
  unit of analysis    per book, because the eight chunks are contiguous text
                      and therefore not independent samples
  centroid fairness   jackknifed EE centroids, so the CB and EE distances are
                      computed against centroids built from the same number of
                      chunks

Run:  python3 -m studies.robustness
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greekstyle import stylo
from greekstyle import features as F
from greekstyle.works import BY_ID, load_work
from studies.common_books import en_split, loo_centroid_delta

OUT = Path(__file__).resolve().parents[1] / "results"

SETS = {
    "all function words": F.FUNCTION_WORDS,
    "particles only": sorted(set(F.PARTICLES)),
    "connectives only": sorted(set(F.CONNECTIVES)),
    "prepositions only": sorted(set(F.PREPOSITIONS)),
    "article only": sorted(set(F.ARTICLE)),
    "no article, no pronouns": sorted(
        set(F.FUNCTION_WORDS) - set(F.ARTICLE) - set(F.PRONOUNS)
    ),
}


def frame(chunk_size, books_split=False):
    en_proper, cb = en_split()
    ee = [t.norm for t in load_work(BY_ID["EE"])]
    g = {
        "EN-proper": stylo.chunk(en_proper, chunk_size),
        "CommonBooks": stylo.chunk(cb, chunk_size),
        "EE": stylo.chunk(ee, chunk_size),
    }
    return g


def verdict(groups, vocab):
    """Return (mean d(CB->EN), mean d(CB->EE), votes_for_EE, n_chunks)."""
    labels, samples = [], []
    for gname, chunks in groups.items():
        for c in chunks:
            labels.append(gname)
            samples.append(c)
    labels = np.array(labels)
    m = stylo.matrix(samples, vocab)
    z, _, _ = stylo.zscore(m)

    cb = z[labels == "CommonBooks"]
    en = z[labels == "EN-proper"]
    ee = z[labels == "EE"]

    # Jackknifed centroids: build each reference centroid from n-1 chunks so
    # that CB and the in-group members face equally noisy targets.
    def jack(sample_rows, ref_rows):
        d = []
        for r in sample_rows:
            per = [np.abs(r - np.delete(ref_rows, k, axis=0).mean(axis=0)).mean()
                   for k in range(len(ref_rows))]
            d.append(np.mean(per))
        return np.array(d)

    d_en = jack(cb, en)
    d_ee = jack(cb, ee)
    return d_en, d_ee, int((d_ee < d_en).sum()), len(cb)


def main():
    out = {}
    print("=" * 78)
    print("STUDY 2b -- ROBUSTNESS OF THE COMMON-BOOKS RESULT")
    print("=" * 78)

    print("\n--- A. chunk size (all function words) " + "-" * 38)
    print(f"    {'size':>6} {'n':>3}  {'d(CB->EN)':>10} {'d(CB->EE)':>10}   verdict")
    out["chunk_size"] = {}
    for cs in (1000, 1500, 2000, 2500, 3000):
        d_en, d_ee, votes, n = verdict(frame(cs), F.FUNCTION_WORDS)
        v = f"EE {votes}/{n}"
        print(f"    {cs:>6} {n:>3}  {d_en.mean():>10.3f} {d_ee.mean():>10.3f}   {v}")
        out["chunk_size"][cs] = {"d_en": float(d_en.mean()), "d_ee": float(d_ee.mean()),
                                 "votes_ee": votes, "n": n}

    print("\n--- B. feature set (2000-token chunks) " + "-" * 38)
    print(f"    {'set':<26}{'k':>4}  {'d(CB->EN)':>10} {'d(CB->EE)':>10}   verdict")
    out["feature_set"] = {}
    g = frame(2000)
    for name, vocab in SETS.items():
        d_en, d_ee, votes, n = verdict(g, vocab)
        print(f"    {name:<26}{len(vocab):>4}  {d_en.mean():>10.3f} {d_ee.mean():>10.3f}   EE {votes}/{n}")
        out["feature_set"][name] = {"k": len(vocab), "d_en": float(d_en.mean()),
                                    "d_ee": float(d_ee.mean()), "votes_ee": votes, "n": n}

    print("\n--- C. ablating the strongest discriminators " + "-" * 32)
    print("    (drop the top-k words separating CB from EN-proper, then retest)")
    labels, samples = [], []
    for gname, chunks in g.items():
        for c in chunks:
            labels.append(gname); samples.append(c)
    labels = np.array(labels)
    m = stylo.matrix(samples, F.FUNCTION_WORDS)
    z, _, _ = stylo.zscore(m)
    diff = z[labels == "CommonBooks"].mean(axis=0) - z[labels == "EN-proper"].mean(axis=0)
    ranked = [F.FUNCTION_WORDS[j] for j in np.argsort(-np.abs(diff))]
    out["ablation"] = {}
    for k in (0, 5, 10, 20, 40):
        vocab = [w for w in F.FUNCTION_WORDS if w not in set(ranked[:k])]
        d_en, d_ee, votes, n = verdict(g, vocab)
        print(f"    drop top {k:>2}  ({len(vocab):>3} left)  d(EN)={d_en.mean():.3f}  "
              f"d(EE)={d_ee.mean():.3f}   EE {votes}/{n}")
        out["ablation"][k] = {"d_en": float(d_en.mean()), "d_ee": float(d_ee.mean()),
                              "votes_ee": votes, "n": n}

    print("\n--- D. per book (the 8 chunks are contiguous, so not independent) " + "-" * 11)
    toks = load_work(BY_ID["EN"])
    en_proper = [t.norm for t in toks if t.get("book") not in {"5", "6", "7"}]
    ee = [t.norm for t in load_work(BY_ID["EE"])]
    out["per_book"] = {}
    for b in ("5", "6", "7"):
        bt = [t.norm for t in toks if t.get("book") == b]
        gg = {"EN-proper": stylo.chunk(en_proper, 2000),
              "CommonBooks": [bt],           # the whole book as ONE sample
              "EE": stylo.chunk(ee, 2000)}
        d_en, d_ee, votes, n = verdict(gg, F.FUNCTION_WORDS)
        who = "EE" if d_ee[0] < d_en[0] else "EN-proper"
        print(f"    EN book {b} ({len(bt):>5} tokens):  d(EN)={d_en[0]:.3f}  "
              f"d(EE)={d_ee[0]:.3f}  -> {who}")
        out["per_book"][b] = {"tokens": len(bt), "d_en": float(d_en[0]),
                              "d_ee": float(d_ee[0]), "closer": who}

    print("\n--- E. falsification check: does the method mislabel a KNOWN book? " + "-" * 9)
    print("    EN books I-IV and VIII-X are not disputed. Held out one at a time,")
    print("    each should prefer the EN centroid. If they prefer EE, the test is broken.")
    out["falsification"] = {}
    for b in ("1", "2", "3", "4", "8", "9", "10"):
        held = [t.norm for t in toks if t.get("book") == b]
        rest = [t.norm for t in toks if t.get("book") not in {"5", "6", "7", b}]
        gg = {"EN-proper": stylo.chunk(rest, 2000),
              "CommonBooks": [held],
              "EE": stylo.chunk(ee, 2000)}
        d_en, d_ee, votes, n = verdict(gg, F.FUNCTION_WORDS)
        who = "EE" if d_ee[0] < d_en[0] else "EN"
        flag = "  <-- MISLABELLED" if who == "EE" else ""
        print(f"    EN book {b:>2} ({len(held):>5} tokens):  d(EN)={d_en[0]:.3f}  "
              f"d(EE)={d_ee[0]:.3f}  -> {who}{flag}")
        out["falsification"][b] = {"tokens": len(held), "d_en": float(d_en[0]),
                                   "d_ee": float(d_ee[0]), "closer": who}

    print("\n--- F. random feature subsets (unbiased; C selects on the tested contrast) " + "-" * 1)
    print("    Draw random halves of the 161 function words and retest. Unlike C,")
    print("    this cannot be rigged by choosing features on the same comparison.")
    rng = np.random.default_rng(7)
    wins, margins = 0, []
    trials = 200
    for _ in range(trials):
        sub = list(rng.choice(F.FUNCTION_WORDS, len(F.FUNCTION_WORDS) // 2, replace=False))
        d_en, d_ee, votes, n = verdict(g, sub)
        margins.append(d_en.mean() - d_ee.mean())
        if d_ee.mean() < d_en.mean():
            wins += 1
    margins = np.array(margins)
    print(f"    EE is closer in {wins}/{trials} random half-vocabularies "
          f"({100*wins/trials:.0f}%)")
    print(f"    mean margin d(CB->EN) - d(CB->EE) = {margins.mean():+.3f} "
          f"(sd {margins.std(ddof=1):.3f}, min {margins.min():+.3f})")
    out["random_subsets"] = {"trials": trials, "ee_wins": wins,
                             "mean_margin": float(margins.mean()),
                             "min_margin": float(margins.min())}

    print("\n--- G. exact test on the book-level verdicts " + "-" * 32)
    print("    Section E classified all 10 surviving EN books. Under the null that")
    print("    the 3 books preferring EE are an arbitrary 3 of the 10, the chance")
    print("    that they are exactly the 3 traditionally identified as the common")
    print("    books is 1 / C(10,3).")
    from math import comb
    n_ee = sum(1 for v in out["falsification"].values() if v["closer"] == "EE")
    n_ee += sum(1 for v in out["per_book"].values() if v["closer"] == "EE")
    p_exact = 1 / comb(10, 3)
    print(f"    books preferring EE: {n_ee} of 10 "
          f"(the common books V, VI, VII: {sum(1 for v in out['per_book'].values() if v['closer']=='EE')}/3)")
    print(f"    p = 1/{comb(10,3)} = {p_exact:.4f}" if n_ee == 3 else
          f"    (marginal not 3; exact test does not apply as stated)")
    out["exact_test"] = {"books_preferring_ee": int(n_ee), "p": p_exact if n_ee == 3 else None}

    OUT.mkdir(exist_ok=True)
    (OUT / "robustness.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nwrote {OUT/'robustness.json'}")


if __name__ == "__main__":
    main()
