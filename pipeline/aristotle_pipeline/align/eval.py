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
from .aligner import align_chapter, monotonic_align, split_sentences
from .reference import default_target, load_chapters, load_gloss_chapters


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


def _summarise(err_by_tier: dict[str, list[int]], extra: dict) -> dict:
    report = {**extra, "by_tier": {}}
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
            "median_chars": statistics.median(all_err),
            "max_chars": max(all_err),
            "exact_pct": round(100 * sum(1 for e in all_err if e == 0) / len(all_err), 1),
        }
    return report


def run_gloss_eval(work_id="EN", backend="lexical", books=None):
    """Honest cross-method eval for the gloss provider. We take the *milestoned*
    English (Rackham) as the target — but treat it as unmarked — gloss-align it,
    and score each predicted tick against Rackham's own real embedded Bekker tick
    (column = line 1, half_column ~ line 20). Those are true gold offsets, not a
    self-referential bound: the gloss fingerprints come from the Greek, the gold
    from Rackham's milestones. Only ticks Rackham actually carries are scored
    (column starts + the ~line-20 marks), which is exactly where it can verify."""
    _vid, target = default_target(work_id)
    mile = {(c.book, int(c.chapter)): c for c in load_chapters(target)}
    if books:
        mile = {k: c for k, c in mile.items() if c.book in books}

    # Target prose = each chapter's assembled Rackham; gold = its real tick offsets,
    # snapped to the start of the containing sentence (best achievable granularity).
    rackham_prose = {k: c.ref_text for k, c in mile.items()}
    gloss_chapters = load_gloss_chapters(rackham_prose, work_id, books)

    err_by_tier: dict[str, list[int]] = {}
    matched = unmatched = 0
    for ch in gloss_chapters:
        mc = mile.get((ch.book, int(ch.chapter)))
        if mc is None:
            continue
        starts = [s for s, _ in split_sentences(mc.ref_text)] or [0]
        gold = {a.citation: max((s for s in starts if s <= a.off), default=starts[0])
                for a in mc.ref_anchors if a.tier != "chapter"}
        for a in align_chapter(ch, backend):
            if a.tier in ("chapter", "line"):
                continue
            if a.citation in gold:
                err_by_tier.setdefault(a.tier, []).append(abs(a.offset - gold[a.citation]))
                matched += 1
            else:
                unmatched += 1

    return _summarise(err_by_tier, {
        "mode": "gloss-vs-milestoned", "backend": backend,
        "chapters": len(gloss_chapters), "scored_ticks": matched,
        "gloss_ticks_without_gold": unmatched,
    })
