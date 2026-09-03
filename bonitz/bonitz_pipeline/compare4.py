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
import bisect
import difflib
import re
import unicodedata
from collections import Counter

from .normalize import canonical, fold
from .compare3 import (Segment, _diff_regions, _locate, _spine_missed_ligature,
                       CITE_CHARS, LIGATURES)

# Below this page, kraken saw the text in training and its vote is not evidence.
KRAKEN_INDEPENDENT_FROM = 53


def _line_position(text: str, offset: int) -> tuple[int, int, str]:
    """Return 1-based line, line-local offset, and word at `offset`."""
    line = text.count('\n', 0, offset) + 1
    line_start = text.rfind('\n', 0, offset) + 1
    line_end = text.find('\n', offset)
    if line_end < 0:
        line_end = len(text)
    line_text = text[line_start:line_end]
    local = offset - line_start
    word = ''
    for match in re.finditer(r'\S+', line_text):
        if match.start() <= local < match.end():
            word = match.group()
            break
    return line, local, word


def add_locations(
    records: list[dict],
    segs: list[Segment],
    sources: dict[tuple[int, str], tuple[str, list[int]]],
) -> None:
    """Add printed-line locations and the matching raw NFC source slice.

    For a region that stays within one word and line, ``source_opus`` starts
    at ``char`` and canonicalizes to ``opus``. It may have a different byte or
    character length: canonicalization folds apostrophe forms and Latin/Greek
    lookalikes, and can merge an apostrophe with a bare capital vowel.
    """
    for record in records:
        start = record['spine_off']
        end = start + len(record['opus'])
        start_seg = _locate(segs, start)
        start_text, start_offsets = sources[(start_seg.page, start_seg.col)]
        start_text = unicodedata.normalize('NFC', start_text)
        local_start = start - start_seg.start
        start_offset = (start_offsets[local_start]
                        if local_start < len(start_offsets) else len(start_text))

        if end > start:
            end_seg = _locate(segs, end - 1)
            end_text, end_offsets = sources[(end_seg.page, end_seg.col)]
            end_text = unicodedata.normalize('NFC', end_text)
            local_end = end - 1 - end_seg.start
            end_offset = end_offsets[local_end]
            source_end = end_offset + 1
            # canonical() can merge an apostrophe and a bare capital vowel.
            # The capital then has no offset of its own, so include it in the
            # source slice when it completes this region's last stream char.
            if source_end < len(end_text):
                last_source = end_text[end_offset:source_end]
                if (canonical(last_source)[0] != record['opus'][-1]
                        and canonical(end_text[end_offset:source_end + 1])[0]
                        == record['opus'][-1]):
                    source_end += 1
        else:
            end_seg = start_seg
            end_text = start_text
            end_offset = start_offset
            source_end = start_offset

        line, char, start_word = _line_position(start_text, start_offset)
        line_end, _, end_word = _line_position(end_text, end_offset)
        if start_seg is end_seg:
            source_span = start_text[start_offset:source_end]
        else:
            source_span = (start_text[start_offset:] + '\n'
                           + end_text[:source_end])

        spans_word = any(
            ch.isspace() and ch not in '\r\n' for ch in source_span
        )
        spans_line = line_end != line
        starts_word = (start_offset < len(start_text)
                       and unicodedata.category(start_text[start_offset])[0]
                       in {'L', 'M', 'N'})
        record.update({
            'line': line,
            'line_end': line_end,
            'char': char,
            'source_opus': source_span,
            'word': (end_word if (spans_word or spans_line) and not starts_word
                     else start_word),
            'spans_word': spans_word,
            'spans_line': spans_line,
        })


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


def spine_engine_at(twins: list[tuple[int, int, str]], off: int) -> str | None:
    """Which reader IS the spine at this offset, if the spine changes engine.

    `twins` is a sorted, non-overlapping list of (start, end, reader) in spine
    coordinates. Anything not covered is spined by an engine that is not in the
    panel, so nothing is muted there.
    """
    i = bisect.bisect_right(twins, (off, float('inf'), '')) - 1
    if i < 0:
        return None
    start, end, name = twins[i]
    return name if start <= off < end else None


def compare(spine: str, segs: list[Segment], readers: dict[str, str],
            context: int = 25,
            kraken_from: int = KRAKEN_INDEPENDENT_FROM,
            spine_twins: list[tuple[int, int, str]] | None = None) -> list[dict]:
    """Flag/decision list for the spine, voting spine + every reader in `readers`.

    `readers` maps a name ('genie', 'llama', 'kraken') to its canonical stream.

    ⚠ `spine_twins` NAMES THE READER THAT IS THE SPINE, PER INTERVAL, AND MUTES
    IT. `latin_spine` builds a spine that is kraken on a Greek line and
    calamari on a Latin one, so both engines can sit in `readers` and each gets
    a real vote on the lines it did not write. Without the muting the engine
    that wrote the line would agree with itself and the tally would carry that
    reading twice — the two-LlamaParse-variants mistake, in a new place. The
    muted reader is still SHOWN; it is never counted.
    """
    twins = sorted(spine_twins or [])
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
        spine_from = spine_engine_at(twins, s) if twins else None
        if spine_from in voting:
            voting.pop(spine_from)

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
        if spine_from:
            # Which engine's ink this region's spine text is. A card that
            # named the wrong engine over a reading would be the same lie as
            # showing kraken under an Opus label.
            rec['spine_from'] = spine_from
        results.append(rec)
    return results
