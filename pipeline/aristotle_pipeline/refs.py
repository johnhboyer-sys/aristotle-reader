"""Bekker reference utilities.

A *column* is a Bekker page+side string like "1094a". A *ref* adds a line
number, e.g. "1094a1". Columns order by (page number, side); refs add the
line as a third key.
"""

from __future__ import annotations

import re

_REF_RE = re.compile(r"^(\d+)([ab])(\d+)?$")


def column_key(column: str) -> tuple[int, str]:
    m = _REF_RE.match(column)
    if not m or m.group(3) is not None:
        raise ValueError(f"not a Bekker column: {column!r}")
    return (int(m.group(1)), m.group(2))


def ref_key(ref: str) -> tuple[int, str, int]:
    """Sort key for a full Bekker ref like '1103a14'."""
    m = _REF_RE.match(ref)
    if not m or m.group(3) is None:
        raise ValueError(f"not a Bekker ref: {ref!r}")
    return (int(m.group(1)), m.group(2), int(m.group(3)))


def line_key(column: str, line: int) -> tuple[int, str, int]:
    page, side = column_key(column)
    return (page, side, line)


def column_range(first: str, last: str) -> list[str]:
    """All columns from `first` to `last` inclusive (sides a and b)."""
    fp, fs = column_key(first)
    lp, ls = column_key(last)
    out = []
    for page in range(fp, lp + 1):
        for side in ("a", "b"):
            if (page, side) < (fp, fs) or (page, side) > (lp, ls):
                continue
            out.append(f"{page}{side}")
    return out
