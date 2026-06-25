"""
Monotonic line alignment between a reference transcript and a verifier
transcript.  Both are plain-text lines; the alignment is done by minimizing
edit distance on a per-line basis while enforcing monotonicity (no crossing
pairs).

This is intentionally simple — suitable for two transcripts of the same
physical column where line order is guaranteed to be the same.  It uses a
standard LCS-style DP to find the best 1-1 pairing and inserts empty strings
as gaps for unmatched lines.
"""

from __future__ import annotations
import difflib
from dataclasses import dataclass


@dataclass
class AlignedLine:
    ref_idx: Optional[int]   # index in ref list, or None if gap
    ver_idx: Optional[int]   # index in ver list, or None if gap
    ref_text: str
    ver_text: str

    @property
    def is_gap(self) -> bool:
        return self.ref_idx is None or self.ver_idx is None


from typing import Optional


def align_lines(ref_lines: list[str], ver_lines: list[str]) -> list[AlignedLine]:
    """
    Align ref_lines against ver_lines monotonically using difflib SequenceMatcher.

    Returns a list of AlignedLine objects.  Gaps (inserted/deleted lines) are
    represented with None for the missing index and '' for the missing text.
    """
    matcher = difflib.SequenceMatcher(None, ref_lines, ver_lines, autojunk=False)
    result: list[AlignedLine] = []
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == 'equal':
            for i, j in zip(range(i1, i2), range(j1, j2)):
                result.append(AlignedLine(i, j, ref_lines[i], ver_lines[j]))
        elif op == 'replace':
            # Pair up as many lines as possible, then pad with gaps.
            ref_chunk = ref_lines[i1:i2]
            ver_chunk = ver_lines[j1:j2]
            for k in range(max(len(ref_chunk), len(ver_chunk))):
                ri = i1 + k if k < len(ref_chunk) else None
                vi = j1 + k if k < len(ver_chunk) else None
                rt = ref_lines[ri] if ri is not None else ''
                vt = ver_lines[vi] if vi is not None else ''
                result.append(AlignedLine(ri, vi, rt, vt))
        elif op == 'delete':
            for i in range(i1, i2):
                result.append(AlignedLine(i, None, ref_lines[i], ''))
        elif op == 'insert':
            for j in range(j1, j2):
                result.append(AlignedLine(None, j, '', ver_lines[j]))
    return result


def paired_texts(aligned: list[AlignedLine]) -> list[tuple[str, str]]:
    """Return just the (ref_text, ver_text) pairs, suitable for digit_guard."""
    return [(a.ref_text, a.ver_text) for a in aligned]
