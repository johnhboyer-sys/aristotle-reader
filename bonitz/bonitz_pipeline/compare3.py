"""
Three-way comparison of canonical reader streams (Opus spine vs History
Genie vs LlamaParse).

Approach: the Opus stream is the spine (it is the only reader with per-column
files, so flags map back to page/column). Each other reader is aligned to the
spine with difflib.SequenceMatcher on the whitespace-free canonical streams.
Diff regions from both alignments are merged by spine-interval overlap and
voted:

  - all three agree            -> accept silently
  - folds all equal            -> soft accept (ligature/diacritic-level only)
  - two agree, one differs     -> majority; FLAG if the region touches a
                                  Bekker citation (citations are the
                                  highest-value data)
  - all differ                 -> FLAG for adjudication

Output: JSONL flag queue, one object per region:
  {page, col, spine_ctx, opus, genie, llama, cls, vote}
"""

from __future__ import annotations
import difflib
import json
from dataclasses import dataclass
from pathlib import Path

from .normalize import fold

CITE_CHARS = set('0123456789ab')

LIGATURES = 'ȣϗ'


def _spine_missed_ligature(spine_read: str, *others: str) -> bool:
    """True when the spine lacks a ligature that another reader recorded.

    Only this direction matters: Genie routinely expands ȣ/ϗ to ου/και, so a
    spine ligature the others lack is normal and not worth an adjudicator.
    """
    if any(c in LIGATURES for c in spine_read):
        return False
    return any(c in LIGATURES for r in others for c in r)


@dataclass
class Segment:
    page: int
    col: str
    start: int   # spine offset
    end: int


def build_spine(columns: list[tuple[int, str, str]]) -> tuple[str, list[Segment]]:
    """columns: [(page, 'L'|'R', canonical_text)] in reading order."""
    parts, segs, pos = [], [], 0
    for page, col, text in columns:
        parts.append(text)
        segs.append(Segment(page, col, pos, pos + len(text)))
        pos += len(text)
    return ''.join(parts), segs


def _locate(segs: list[Segment], off: int) -> Segment:
    for s in segs:
        if s.start <= off < s.end:
            return s
    return segs[-1]


def _diff_regions(spine: str, other: str) -> list[tuple[int, int, str]]:
    """(spine_start, spine_end, other_text) for every non-equal opcode."""
    sm = difflib.SequenceMatcher(None, spine, other, autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != 'equal':
            out.append((i1, i2, other[j1:j2]))
    return out


def _merge(regions_a, regions_b, gap: int = 3):
    """Merge two region lists into unified spine intervals (with slop `gap`)."""
    bounds = sorted({(s, e) for s, e, _ in regions_a} | {(s, e) for s, e, _ in regions_b})
    merged = []
    for s, e in bounds:
        if merged and s <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def compare(spine: str, segs: list[Segment], genie: str, llama: str,
            context: int = 25) -> list[dict]:
    """Return the flag/decision list for the whole spine."""
    rg = _diff_regions(spine, genie)
    rl = _diff_regions(spine, llama)
    sm_g = difflib.SequenceMatcher(None, spine, genie, autojunk=False)
    sm_l = difflib.SequenceMatcher(None, spine, llama, autojunk=False)

    def other_slice(sm, other, s, e):
        lo, hi = None, None
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if i1 <= s < i2 or (s == i2 and tag == 'equal'):
                lo = j1 + (s - i1 if tag == 'equal' else 0)
            if i1 < e <= i2:
                hi = j1 + (e - i1 if tag == 'equal' else (j2 - j1))
        if lo is None:
            lo = 0 if s == 0 else len(other)
        if hi is None:
            hi = len(other) if e >= len(spine) else lo
        return other[lo:hi] if hi >= lo else ''

    results = []
    for s, e in _merge(rg, rl):
        o = spine[s:e]
        g = other_slice(sm_g, genie, s, e)
        l = other_slice(sm_l, llama, s, e)
        if o == g == l:
            continue
        fo, fg, fl = fold(o), fold(g), fold(l)
        seg = _locate(segs, s)
        ctx = spine[max(0, s - context):min(len(spine), e + context)]
        near_cite = any(c in CITE_CHARS for c in spine[max(0, s - 6):e + 6])
        if fo == fg == fl:
            vote, cls, flag = o, 'soft', False
        elif fo == fg or fo == fl:
            # The opus reader and Genie share a blind spot for the ligatures
            # (both write a plain vowel where the print has ȣ/ϗ), so a 2-1
            # majority against LlamaParse is systematically wrong on that
            # class — flag it wherever it occurs, not only near a citation.
            vote, cls = o, 'majority-opus'
            flag = near_cite or _spine_missed_ligature(o, g, l)
        elif fg == fl:
            vote, cls, flag = g, 'majority-other', True   # spine outvoted: always review
        else:
            vote, cls, flag = None, 'three-way', True
        results.append({
            'page': seg.page, 'col': seg.col,
            'spine_off': s, 'ctx': ctx,
            'opus': o, 'genie': g, 'llama': l,
            'cls': cls, 'vote': vote, 'flag': flag,
            'citation': near_cite,
        })
    return results


def write_flags(results: list[dict], path: Path) -> tuple[int, int]:
    flags = [r for r in results if r['flag']]
    with open(path, 'w', encoding='utf-8') as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    return len(results), len(flags)
