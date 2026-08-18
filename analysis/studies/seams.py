"""Study 4 -- seams inside single works.

Aristotle's treatises are not books in the modern sense; they are collections of
lecture material, assembled after his death, and philologists have long argued
that particular books sit oddly inside particular treatises. The best-known
cases are in the Metaphysics: book alpha elatton was already attributed to
Pasicles of Rhodes in antiquity, book K reads as a doublet of B-Gamma-E, and
book Lambda is generally taken to be an independent lecture.

Those claims were made on doctrinal and philological grounds. This asks whether
function-word style notices anything at the same places -- scoring every book of
the long treatises against the centroid of the OTHER books of its own treatise,
which holds work, genre and editor constant all at once. It is therefore the
best-controlled comparison in this whole analysis.

One correction matters enormously here and is applied throughout. Shorter books
have noisier frequency estimates and therefore drift further from any centroid
for purely statistical reasons: across the 72 books analysed, the correlation
between log length and raw Delta is about -0.49. Ranking treatise books by raw
Delta would mostly rank them by shortness. So a regression of Delta on log
length is fitted across the whole pooled set, and books are ranked by the
RESIDUAL -- how much odder a book is than a book of its size should be.

The difference is not cosmetic. On raw Delta, Metaphysics alpha elatton is the
single biggest outlier in the treatise, which looks like a striking confirmation
of the ancient ascription to Pasicles. After the length correction it is
unremarkable: it is simply the shortest book in the Metaphysics.

Reported as a ranking, not a verdict. A high residual means "this book's
particle usage is unlike the rest of its treatise, beyond what its length
explains", which has several possible causes -- different date, different
occasion, different subject, or a different hand.

Run:  python3 -m studies.seams
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

OUT = Path(__file__).resolve().parents[1] / "results"
MIN_BOOK = 1000

# Books with a standing question mark in the literature, for scoring afterwards.
NOTED = {
    ("Meta", "2"): "alpha elatton -- ascribed to Pasicles in antiquity",
    ("Meta", "11"): "book K -- doublet of B/Gamma/E, authenticity long doubted",
    ("Meta", "12"): "book Lambda -- independent lecture on substance",
    ("EN", "5"): "common book -- shared with the Eudemian Ethics",
    ("EN", "6"): "common book -- shared with the Eudemian Ethics",
    ("EN", "7"): "common book -- shared with the Eudemian Ethics",
    ("Pol", "7"): "the 'ideal state' books, order disputed since Jaeger",
    ("Pol", "8"): "the 'ideal state' books, order disputed since Jaeger",
    ("Phys", "7"): "book VII -- survives in two recensions, often set apart",
    ("HA", "10"): "book X -- widely rejected as post-Aristotelian",
}


def books_of(wid):
    toks = load_work(BY_ID[wid])
    out = {}
    for t in toks:
        b = t.get("book") or t.get("part")
        if b:
            out.setdefault(b, []).append(t.norm)
    return {k: v for k, v in out.items() if len(v) >= MIN_BOOK}


WORKS_TO_SCAN = ("Meta", "EN", "Pol", "Phys", "HA", "Top", "Rhet", "EE", "GA", "PA")


def collect():
    """Raw leave-one-book-out Delta for every book of every scanned treatise."""
    rows = []
    for wid in WORKS_TO_SCAN:
        bk = books_of(wid)
        if len(bk) < 4:
            continue
        names = sorted(bk, key=lambda x: (len(x), x))
        z, _, _ = stylo.zscore(stylo.matrix([bk[n] for n in names], FUNCTION_WORDS))
        for i, n in enumerate(names):
            others = np.delete(z, i, axis=0).mean(axis=0)
            rows.append({"work": wid, "book": n, "tokens": len(bk[n]),
                         "delta": float(np.abs(z[i] - others).mean()),
                         "noted": NOTED.get((wid, n), "")})
    return rows


def main():
    results = {}
    print("=" * 78)
    print("STUDY 4 -- SEAMS INSIDE SINGLE WORKS")
    print("=" * 78)
    print("\nEach book scored against the centroid of the OTHER books of the same")
    print("treatise. Work, genre, editor and manuscript tradition all held constant.")

    rows = collect()
    L = np.log([r["tokens"] for r in rows])
    D = np.array([r["delta"] for r in rows])
    corr = float(np.corrcoef(L, D)[0, 1])
    slope, icept = np.polyfit(L, D, 1)
    for r in rows:
        r["residual"] = float(r["delta"] - (icept + slope * np.log(r["tokens"])))
    print(f"\nlength correction: {len(rows)} books, corr(log tokens, Delta) = {corr:+.3f}")
    print(f"  fitted Delta = {icept:.3f} {slope:+.4f} * log(tokens); ranking uses the residual")
    results["_length_model"] = {"n": len(rows), "corr": corr,
                                "slope": float(slope), "intercept": float(icept)}

    print("\n" + "=" * 78)
    print("MOST DISTINCTIVE BOOKS IN THE WHOLE CORPUS (length-corrected)")
    print("=" * 78)
    for r in sorted(rows, key=lambda r: -r["residual"])[:10]:
        print(f"   {r['work']:<6} book {r['book']:<3}{r['tokens']:>7} tok  "
              f"residual {r['residual']:+.3f}   {r['noted']}")

    by_work = {}
    for r in rows:
        by_work.setdefault(r["work"], []).append(r)

    for wid in WORKS_TO_SCAN:
        wr = by_work.get(wid)
        if not wr:
            continue
        res = np.array([r["residual"] for r in wr])
        mu, sd = res.mean(), res.std(ddof=1)
        print("\n" + "-" * 78)
        print(f"{wid} -- {BY_ID[wid].title} ({len(wr)} books over {MIN_BOOK} tokens)")
        print("-" * 78)
        for r in sorted(wr, key=lambda r: -r["residual"]):
            zsc = (r["residual"] - mu) / sd if sd > 0 else 0.0
            r["z"] = float(zsc)
            bar = "#" * int(max(0, zsc * 3 + 3))
            print(f"   book {r['book']:<4}{r['tokens']:>7} tok   raw {r['delta']:.3f}  "
                  f"resid {r['residual']:+.3f}  z {zsc:+.2f}  {bar:<10}{r['noted']}")
        results[wid] = wr

        flagged = [r["residual"] for r in wr if r["noted"]]
        plain = [r["residual"] for r in wr if not r["noted"]]
        if flagged and plain:
            a = float((np.array(flagged)[:, None] > np.array(plain)[None, :]).mean())
            print(f"   -> books already questioned in the literature vs the rest: "
                  f"AUC {a:.2f} (length-corrected)")
            results[wid + "_auc"] = a

    OUT.mkdir(exist_ok=True)
    (OUT / "seams.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nwrote {OUT/'seams.json'}")


if __name__ == "__main__":
    main()
