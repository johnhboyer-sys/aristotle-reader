"""Offset-error eval harness.

Ross carries no gold anchors, but Rackham does (its real Bekker ticks with known
char offsets). So we treat Rackham as the "unmarked" target, realign its own
anchor segments against its sentence stream, and measure how closely the DP
recovers the true offsets per tier. This is an upper bound on accuracy (matching
a translation against *itself* is easier than Ross↔Rackham) and a regression
guard on the DP / similarity engine.
"""

from __future__ import annotations

import statistics

from . import similarity
from .aligner import monotonic_align, split_sentences
from .reference import default_target, load_chapters


def run_eval(work_id="EN", backend="lexical", books=None):
    _vid, target = default_target(work_id)
    chapters = load_chapters(target)
    if books:
        chapters = [c for c in chapters if c.book in books]

    err_by_tier: dict[str, list[int]] = {}
    n_chapters = 0
    for ch in chapters:
        if len(ch.ref_anchors) < 2 or not ch.ref_text.strip():
            continue
        n_chapters += 1
        refs = ch.ref_incipits()
        sents = split_sentences(ch.ref_text)            # Rackham as the target
        starts = [s for s, _ in sents]
        S = similarity.cos_matrix(refs, [s for _, s in sents], backend)
        for i, j, _score, _margin in monotonic_align(S):
            ra = ch.ref_anchors[i]
            pred = sents[j][0]
            # Gold = start of the sentence that *contains* the true tick. At
            # sentence granularity that is the best achievable target; scoring
            # against the raw mid-sentence tick would penalise correct snapping.
            gold = max((s for s in starts if s <= ra.off), default=starts[0])
            err = abs(pred - gold)
            err_by_tier.setdefault(ra.tier, []).append(err)

    report = {"backend": backend, "chapters": n_chapters, "by_tier": {}}
    all_err: list[int] = []
    for tier, errs in sorted(err_by_tier.items()):
        all_err += errs
        report["by_tier"][tier] = {
            "n": len(errs),
            "mean_chars": round(statistics.mean(errs), 1),
            "median_chars": statistics.median(errs),
            "max_chars": max(errs),
            "exact": sum(1 for e in errs if e == 0),
        }
    if all_err:
        report["overall"] = {
            "n": len(all_err),
            "mean_chars": round(statistics.mean(all_err), 1),
            "max_chars": max(all_err),
            "exact_pct": round(100 * sum(1 for e in all_err if e == 0) / len(all_err), 1),
        }
    return report
