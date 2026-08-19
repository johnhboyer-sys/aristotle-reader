"""Parse TLG canon author dates into conservative comparison buckets.

Before-counts support "rare/unattested before him", so ambiguity must not
inflate them. Any hit before or contemporary with Aristotle defeats "coined by
Aristotle", so contemporaries count for that test. Both choices make the claim
harder to overstate.
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

STRICT_BEFORE = "strict_before"
CONTEMPORARY = "contemporary"
IGNORED = "ignored"

_FIELD = re.compile(rb"[\x80-\xff](?P<tag>[a-z]{3})[ \t]+")
_KEY = re.compile(r"^(?P<author>\d{4})(?:\s+(?P<work>\d{3}))?$")
_PURE_BC = re.compile(r"^(?P<first>\d+)(?:\s*-\s*(?P<last>\d+))?\s+B\.C\.$")
_ANTE_BC = re.compile(r"^a\.\s*(?P<century>\d+)\s+B\.C\.(?P<uncertain>\?)?$")
_POST_BC = re.compile(r"^p\.\s*(?P<century>\d+)\s+B\.C\.(?P<uncertain>\?)?$")
_BC_SPAN = re.compile(
    r"(?P<first>\d+)\??(?:\s*-\s*(?P<last>\d+)\??)?\s+B\.C\."
)


def _field_value(raw: bytes) -> str:
    return raw.decode("latin-1").strip(" \t\r\n\x00")


def _date_value(raw: bytes) -> str:
    value = _field_value(raw)
    match = re.match(r"[A-Za-z0-9 .?%`-]*", value)
    return match.group(0).strip() if match else ""


def normalize_date(value: str) -> str:
    value = re.sub(r"%\d+`", "-", value)
    value = value.replace("–", "-").replace("—", "-")
    return " ".join(value.split())


def date_bucket(dat_raw: str) -> str:
    """Classify the small, explicit date grammar used for the count."""
    value = normalize_date(dat_raw)

    # TLG's ante/post prefixes describe open ranges, not the named century.
    # Handle them before the ordinary B.C. span grammar sees the embedded
    # century number.
    if value.startswith("a."):
        ante = _ANTE_BC.fullmatch(value)
        if ante and not ante.group("uncertain"):
            return STRICT_BEFORE if int(ante.group("century")) >= 4 else IGNORED
        return IGNORED

    if value.startswith("p."):
        post = _POST_BC.fullmatch(value)
        if post:
            century = int(post.group("century"))
            return CONTEMPORARY if century > 4 else IGNORED

        # A post/ante compound spans forward between its bounds. It can add
        # before-counts only when every bound is certainly earlier than the
        # fourth century B.C.
        spans = list(_BC_SPAN.finditer(value))
        endpoints = [
            century
            for span in spans
            for century in (
                int(span.group("first")),
                int(span.group("last") or span.group("first")),
            )
        ]
        if endpoints and min(endpoints) >= 5 and "?" not in value and "A.D." not in value:
            return STRICT_BEFORE
        return IGNORED

    for match in _BC_SPAN.finditer(value):
        first = int(match.group("first"))
        last = int(match.group("last") or first)
        if min(first, last) <= 4 <= max(first, last):
            return CONTEMPORARY

    pure = _PURE_BC.fullmatch(value)
    if pure and "?" not in value:
        first = int(pure.group("first"))
        last = int(pure.group("last") or first)
        if 5 <= first <= 8 and 5 <= last <= 8:
            return STRICT_BEFORE

    return IGNORED


def parse_canon(data: bytes) -> dict[str, dict[str, str]]:
    """Return ``tlg_author -> {name, dat_raw, bucket}`` from canon bytes."""
    fields = list(_FIELD.finditer(data))
    authors: dict[str, dict[str, str]] = {}
    current: dict[str, str] | None = None
    in_author_header = False

    for index, field in enumerate(fields):
        end = fields[index + 1].start() if index + 1 < len(fields) else len(data)
        tag = field.group("tag").decode("ascii")
        raw = data[field.end():end]

        if tag == "key":
            key_match = _KEY.fullmatch(_field_value(raw))
            if not key_match:
                continue
            if key_match.group("work") is not None:
                in_author_header = False
                continue

            author = key_match.group("author")
            if author in authors:
                raise ValueError(f"duplicate TLG author key: {author}")
            current = {"name": "", "dat_raw": ""}
            authors[author] = current
            in_author_header = True
            continue

        if current is None or not in_author_header:
            continue
        if tag == "nam" and not current["name"]:
            current["name"] = _field_value(raw)
        elif tag == "dat" and not current["dat_raw"]:
            current["dat_raw"] = _date_value(raw)

    for author, record in authors.items():
        bucket = date_bucket(record["dat_raw"])
        record["bucket"] = IGNORED if author == "0086" else bucket
    return authors


_WORK_KEY = re.compile(r"key (\d{4}) (\d{3})")
_WRK_TITLE = re.compile(r"wrk ([^\x80-\xff]+)")


def parse_work_titles(data: bytes) -> dict[tuple[str, str], str]:
    """(author, work) -> canon `wrk` title, markup stripped."""
    text = data.decode("latin-1")
    titles: dict[tuple[str, str], str] = {}
    for match in _WORK_KEY.finditer(text):
        rest = text[match.end() : match.end() + 300]
        wrk = _WRK_TITLE.search(rest)
        if wrk:
            title = re.sub(r"&\d*|`", "", wrk.group(1)).strip()
            titles[(match.group(1), match.group(2))] = title
    return titles


def is_testimonia(title: str) -> bool:
    """DK-style editions ship doxography beside the fragments; testimonia
    text is largely later authors quoting (often Aristotle himself), so it
    must never serve as a quotation SOURCE."""
    return "testimonia" in title.lower()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args(argv)

    authors = parse_canon(args.path.read_bytes())
    counts = Counter(record["bucket"] for record in authors.values())
    for bucket in (STRICT_BEFORE, CONTEMPORARY, IGNORED):
        print(f"{bucket}: {counts[bucket]}")
    print("sample:")
    for author in sorted(authors)[:5]:
        record = authors[author]
        print(
            f"  {author} {record['name']} | {record['dat_raw']} | {record['bucket']}"
        )


if __name__ == "__main__":
    main()
