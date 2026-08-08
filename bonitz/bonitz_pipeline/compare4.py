"""
N-way comparison of reader streams, generalising compare3 from three to four.

compare3 hardcodes an Opus spine plus Genie plus LlamaParse, and its vote
classes assume an odd number of readers so that a majority always exists.
Adding kraken breaks that: four readers can split 2-2 with no majority at all.

John's ruling, 2026-08-07: **a 2-2 split always flags.** A genuine deadlock on
this text is exactly what deserves a human, and a tiebreak rule would be
guessing dressed as arithmetic.

Why kraken is worth the fourth slot, in one measurement: on the ou-ligature it
reads 98.58% where Genie reads **zero in 5.7M characters**. Its errors do not
correlate with the language models' because it has no language model to be
talked into plausible Greek. That is the whole argument for the panel.

⚠ kraken trained on the reconciled text of pages 15-52, so on those pages its
agreement is worthless as evidence — it may simply be reciting. Only pages 53+
give it an independent vote. `--min-page` enforces that and defaults to 53.

Output matches compare3's flag records with a `kraken` field added, so
`review_html` and the flag tooling need only learn one new column.
"""

from __future__ import annotations
import difflib
from collections import Counter

from .normalize import fold
from .compare3 import (Segment, _diff_regions, _locate, _spine_missed_ligature,
                       CITE_CHARS, LIGATURES)

# Below this page, kraken saw the text in training and its vote is not evidence.
KRAKEN_INDEPENDENT_FROM = 53


def _merge_all(*region_lists, gap: int = 3) -> list[tuple[int, int]]:
    """Merge N region lists into unified spine intervals (with slop `gap`)."""
    bounds = sorted({(s, e) for rl in region_lists for s, e, _ in rl})
    merged: list[list[int]] = []
    for s, e in bounds:
        if merged and s <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def _slicer(sm: difflib.SequenceMatcher, other: str, spine_len: int):
    """compare3's other_slice, bound to one matcher: spine interval -> other text."""
    ops = sm.get_opcodes()

    def take(s: int, e: int) -> str:
        lo = hi = None
        for tag, i1, i2, j1, j2 in ops:
            if i1 <= s < i2 or (s == i2 and tag == 'equal'):
                lo = j1 + (s - i1 if tag == 'equal' else 0)
            if i1 < e <= i2:
                hi = j1 + (e - i1 if tag == 'equal' else (j2 - j1))
        if lo is None:
            lo = 0 if s == 0 else len(other)
        if hi is None:
            hi = len(other) if e >= spine_len else lo
        return other[lo:hi] if hi >= lo else ''
    return take


def compare(spine: str, segs: list[Segment], readers: dict[str, str],
            context: int = 25,
            kraken_from: int = KRAKEN_INDEPENDENT_FROM) -> list[dict]:
    """Flag/decision list for the spine, voting spine + every reader in `readers`.

    `readers` maps a name ('genie', 'llama', 'kraken') to its canonical stream.
    """
    regions = {k: _diff_regions(spine, v) for k, v in readers.items()}
    matchers = {k: difflib.SequenceMatcher(None, spine, v, autojunk=False)
                for k, v in readers.items()}
    takers = {k: _slicer(matchers[k], v, len(spine))
              for k, v in readers.items()}

    results: list[dict] = []
    for s, e in _merge_all(*regions.values()):
        o = spine[s:e]
        got = {k: takers[k](s, e) for k in readers}
        seg = _locate(segs, s)

        # kraken trained on pages 15-52; on those its agreement is recitation,
        # not evidence, so it does not get a vote there.
        voting = dict(got)
        kraken_muted = 'kraken' in voting and seg.page < kraken_from
        if kraken_muted:
            voting.pop('kraken')

        if all(v == o for v in voting.values()):
            continue
        folds = {'_spine': fold(o), **{k: fold(v) for k, v in voting.items()}}
        ctx = spine[max(0, s - context):min(len(spine), e + context)]
        near_cite = any(c in CITE_CHARS for c in spine[max(0, s - 6):e + 6])

        if len(set(folds.values())) == 1:
            vote, cls, flag = o, 'soft', False
        else:
            tally = Counter(folds.values())
            top = tally.most_common()
            best_n = top[0][1]
            winners = [f for f, n in top if n == best_n]
            if len(winners) > 1:
                # John's ruling: no majority, no guess.  Four readers make this
                # reachable for the first time; three never could.  best_n == 1
                # is not a tie at all — it is every reader disagreeing with
                # every other, which deserves its own name.
                cls = 'all-differ' if best_n == 1 else f'{best_n}-{best_n}-split'
                vote, flag = None, True
            elif folds['_spine'] == winners[0]:
                vote, cls = o, 'majority-spine'
                # The Opus spine and Genie share a ligature blind spot, so a
                # majority that outvotes the ligature-competent readers is
                # systematically wrong on that class — flag it wherever it
                # occurs, not only near a citation.
                flag = near_cite or _spine_missed_ligature(o, *voting.values())
            else:
                vote, cls, flag = None, 'spine-outvoted', True

        rec = {'page': seg.page, 'col': seg.col, 'spine_off': s, 'ctx': ctx,
               'opus': o, **got, 'cls': cls, 'vote': vote, 'flag': flag,
               'citation': near_cite}
        if kraken_muted:
            rec['kraken_muted'] = True   # shown, but did not vote
        results.append(rec)
    return results
