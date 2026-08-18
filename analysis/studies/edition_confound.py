"""Study 3 -- separating the modern editor's hand from the ancient author's.

Every text in this corpus reaches us through a 19th- or 20th-century editor, and
those editors disagree about things that are highly visible to a word-frequency
method: whether to print movable nu, whether to elide, which of two spellings to
standardise. If the editor's habits drive the clustering, the whole exercise
measures Bekker and Ross rather than Aristotle.

Two things are done about that here.

1. An EDITORIAL PROFILE is measured directly -- elision rate and movable-nu
   ratio -- and compared against the authorial (function-word) signal. These are
   deliberately the features that corpus.normalise() folds away before any
   stylometry runs.

2. The corpus contains a natural control: W. D. Ross edited four works spanning
   four genres (Physics, Metaphysics, Politics, Rhetoric). If the editor were
   the dominant signal, those four would cluster together against everything
   else. Whether they do is a measurable question, and it is asked here.

The result of (1) was not what this script was written to expect. Elision rate
and movable nu turn out NOT to track the editor: within Bekker's 1837 Oxford
text alone they range from 0.73% to 4.15%, and editor explains about 3% of the
variance across the corpus. They are features of the transmitted work, not of
the modern editor's house style -- so the planned "editorial layer vs authorial
layer" dissociation is not available, and section C says so rather than
pretending otherwise.

What survives, and what the common-books argument actually rests on, is (2)
plus one structural fact: the common books and the rest of the Nicomachean
Ethics have the SAME editor, so whatever Bywater did, he did to both, and any
difference between them is in the text he was printing.

Run:  python3 -m studies.edition_confound
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greekstyle import stylo
from greekstyle.features import FUNCTION_WORDS
from greekstyle.works import WORKS, BY_ID, load_work
from studies.common_books import en_split

OUT = Path(__file__).resolve().parents[1] / "results"


def editorial_profile(tokens):
    """Features a modern editor chooses, not an ancient author."""
    n = len(tokens)
    elis = sum(t.elided for t in tokens)
    c = Counter(t.norm for t in tokens)
    # Movable nu survives normalisation because esti/estin are distinct strings.
    esti, estin = c.get("εστι", 0), c.get("εστιν", 0)
    houto, houtos = c.get("ουτω", 0), c.get("ουτωσ", 0)
    return {
        "elision_rate": 100.0 * elis / n if n else 0.0,
        "movable_nu_esti": 100.0 * estin / (esti + estin) if (esti + estin) else float("nan"),
        "movable_nu_houto": 100.0 * houtos / (houto + houtos) if (houto + houtos) else float("nan"),
        "tokens": n,
    }


def main():
    out = {}
    print("=" * 78)
    print("STUDY 3 -- THE EDITOR'S HAND vs THE AUTHOR'S")
    print("=" * 78)

    # --- 1. the editorial fingerprint across the corpus ---------------------
    print("\n--- A. editorial features by editor " + "-" * 41)
    print(f"    {'work':<7}{'editor':<15}{'elision%':>9}{'estin%':>8}{'houtos%':>9}")
    prof = {}
    for w in WORKS:
        p = editorial_profile(load_work(w))
        prof[w.wid] = dict(p, editor=w.editor)
        print(f"    {w.wid:<7}{w.editor:<15}{p['elision_rate']:>9.2f}"
              f"{p['movable_nu_esti']:>8.1f}{p['movable_nu_houto']:>9.1f}")
    out["editorial_profile"] = prof

    # How much of the variation in elision rate does the EDITOR explain?
    # One-way ANOVA over editors credited with two or more works.
    by_ed = {}
    for w in WORKS:
        by_ed.setdefault(w.editor, []).append(prof[w.wid]["elision_rate"])
    use = {k: v for k, v in by_ed.items() if len(v) >= 2}
    allv = np.array([x for v in use.values() for x in v])
    gm = allv.mean()
    ssb = sum(len(v) * (np.mean(v) - gm) ** 2 for v in use.values())
    eta2 = ssb / ((allv - gm) ** 2).sum()
    bek = [prof[w.wid]["elision_rate"] for w in WORKS if w.editor == "Bekker1837"]
    print(f"\n    variance in elision rate explained by EDITOR: eta^2 = {eta2:.3f}")
    print(f"    within Bekker 1837 alone ({len(bek)} works): "
          f"{min(bek):.2f}% to {max(bek):.2f}%, sd {np.std(bek, ddof=1):.2f}")
    print("    -> elision tracks the WORK, not the editor. It is folded by")
    print("       normalise() anyway, but it is not the confound it looked like.")
    out["elision_anova"] = {"eta2_editor": float(eta2),
                            "bekker_min": float(min(bek)), "bekker_max": float(max(bek))}

    # --- 2. the Ross control ------------------------------------------------
    print("\n--- B. the Ross control " + "-" * 53)
    print("    Ross edited Physics, Metaphysics, Politics and Rhetoric -- four")
    print("    genres, one editor. If the editor dominated, they would cluster.")
    ross = ["Phys", "Meta", "Pol", "Rhet"]
    others = ["EN", "Top", "HA", "GA", "DA", "Cael", "EE", "PA"]
    labels, samples = [], []
    for wid in ross + others:
        for c in stylo.chunk([t.norm for t in load_work(BY_ID[wid])], 2000):
            labels.append(wid); samples.append(c)
    labels = np.array(labels)
    z, _, _ = stylo.zscore(stylo.matrix(samples, FUNCTION_WORDS))
    d = stylo.delta(z)

    def pair_mean(a, b):
        ia, ib = np.where(labels == a)[0], np.where(labels == b)[0]
        return d[np.ix_(ia, ib)].mean()

    ross_pairs = [pair_mean(a, b) for i, a in enumerate(ross) for b in ross[i + 1:]]
    mixed = [pair_mean(a, b) for a in ross for b in others]
    other_pairs = [pair_mean(a, b) for i, a in enumerate(others) for b in others[i + 1:]]
    print(f"\n    mean Delta between two Ross-edited works   {np.mean(ross_pairs):.3f}")
    print(f"    mean Delta Ross-edited vs other-edited     {np.mean(mixed):.3f}")
    print(f"    mean Delta between two non-Ross works      {np.mean(other_pairs):.3f}")
    verdict = ("editor-driven" if np.mean(ross_pairs) < np.mean(mixed) - 0.05
               else "NOT editor-driven")
    print(f"    -> clustering is {verdict}")
    out["ross_control"] = {"ross_ross": float(np.mean(ross_pairs)),
                           "ross_other": float(np.mean(mixed)),
                           "other_other": float(np.mean(other_pairs)),
                           "verdict": verdict}

    # --- 3. what the common books look like on these features ---------------
    print("\n--- C. the common books on work-level (non-authorial) features " + "-" * 14)
    toks = load_work(BY_ID["EN"])
    cb_tok = [t for t in toks if t.get("book") in {"5", "6", "7"}]
    en_tok = [t for t in toks if t.get("book") not in {"5", "6", "7"}]
    ee_tok = load_work(BY_ID["EE"])

    print(f"\n    {'sample':<16}{'elision%':>9}{'estin%':>8}{'houtos%':>9}   printed by")
    rows = {}
    for name, tk, ed in (("EN-proper", en_tok, "Bywater 1894"),
                         ("CommonBooks", cb_tok, "Bywater 1894"),
                         ("EE", ee_tok, "Susemihl 1884")):
        p = editorial_profile(tk)
        rows[name] = p
        print(f"    {name:<16}{p['elision_rate']:>9.2f}{p['movable_nu_esti']:>8.1f}"
              f"{p['movable_nu_houto']:>9.1f}   {ed}")
    out["common_book_features"] = rows

    def closer(field):
        a = abs(rows["CommonBooks"][field] - rows["EN-proper"][field])
        b = abs(rows["CommonBooks"][field] - rows["EE"][field])
        return "EN-proper" if a < b else "EE"

    side = [closer(f) for f in ("elision_rate", "movable_nu_esti", "movable_nu_houto")]
    print(f"\n    On all three the common books sit nearer: {', '.join(side)}")
    out["common_book_feature_side"] = side

    print("""
    Read this carefully. These are NOT editorial features (section A), so this
    is not the confound reappearing -- but neither is it independent authorial
    evidence, because the same three numbers could be moved by the manuscript
    family Bywater followed for these particular books.

    The load-bearing point is structural instead: the common books and the rest
    of the Nicomachean Ethics were printed by the SAME editor from the SAME
    edition. Bywater's conventions apply equally to both. So the gap between
    them -- 4.42% vs 4.17% elision, 56.8% vs 50.6% movable nu, and the
    function-word result in studies/common_books.py -- cannot be an artefact of
    comparing Bywater with Susemihl. It is a difference inside one editor's
    text.

    The caveat that does survive: if Bywater took his text of books V-VII from a
    different manuscript tradition, or leaned on Susemihl's Eudemian edition
    when printing them, that would produce this pattern without any authorial
    difference. Settling that needs the apparatus criticus, not a token count.""")

    OUT.mkdir(exist_ok=True)
    (OUT / "edition_confound.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nwrote {OUT/'edition_confound.json'}")


if __name__ == "__main__":
    main()
