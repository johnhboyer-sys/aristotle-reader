"""Validate one Bonitz column XML file and optional derived JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path


_RAW_LIGATURES = ("ϗ", "ȣ")
_CIT_RE = re.compile(
    r"^(?:\d{1,4}\s*)?[ab]\s*\d+(?:\s*,\s*\d+)*(?:\s*(?:-|–)\s*(?:(?:\d{1,4}\s*)?[ab]\s*)?\d+)?(?:\s*sqq\.?)?$"
)
_BARE_OU_RE = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff\u0300-\u036f]*ου[\u0370-\u03ff\u1f00-\u1fff\u0300-\u036f]*")
_ACCENTS = {"\u0301", "\u0300", "\u0342"}


def _xml_string(root: ET.Element) -> str:
    return ET.tostring(root, encoding="unicode")


def _text_is_nfc(text: str) -> bool:
    return unicodedata.normalize("NFC", text) == text


def _entry_is_empty(entry: dict) -> bool:
    if entry.get("type") == "section_head":
        return not str(entry.get("content", "")).strip()
    if entry.get("lemma") and str(entry["lemma"]).strip():
        return False
    if entry.get("segments"):
        return not any(str(seg.get("content", seg.get("latin", ""))).strip() for seg in entry["segments"])
    if entry.get("senses"):
        return False
    return True


def validate(xml_path: Path, *, json_path: Path | None = None, page: str | None = None, col: str | None = None) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []

    try:
        raw = xml_path.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"cannot read XML: {exc}"], warnings

    if not _text_is_nfc(raw):
        failures.append("XML text is not NFC-normalized")

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        return [f"XML parse error: {exc}"], warnings

    if root.tag != "column":
        failures.append(f"root tag is {root.tag!r}, expected 'column'")

    for attr in ("page", "col", "section"):
        if not root.get(attr):
            failures.append(f"missing required root @{attr}")

    if page is not None and root.get("page") != str(page):
        failures.append(f"root @page is {root.get('page')!r}, expected {page!r}")
    if col is not None and root.get("col") != col:
        failures.append(f"root @col is {root.get('col')!r}, expected {col!r}")

    if root.find(".//entry") is None and root.find(".//section_head") is None:
        failures.append("no <entry> or <section_head> elements found")

    normalized_xml = unicodedata.normalize("NFC", _xml_string(root))
    for ligature in _RAW_LIGATURES:
        if ligature in normalized_xml:
            failures.append(f"raw ligature {ligature!r} remains in XML")

    for cit in root.findall(".//cit"):
        value = "".join(cit.itertext()).strip()
        if value and not _CIT_RE.match(value):
            failures.append(f"<cit> value {value!r} is not Bekker-like")

    for word in _BARE_OU_RE.findall(normalized_xml):
        decomposed = unicodedata.normalize("NFD", word)
        if "ου" in word and not any(mark in decomposed for mark in _ACCENTS):
            warnings.append(f"WARN bare unaccented ου form: {word}")

    if json_path is not None:
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except OSError as exc:
            failures.append(f"cannot read JSON: {exc}")
        except json.JSONDecodeError as exc:
            failures.append(f"JSON parse error: {exc}")
        else:
            for idx, entry in enumerate(data.get("entries", []), start=1):
                if entry.get("type") != "continuation" and _entry_is_empty(entry):
                    failures.append(f"JSON entry {idx} is empty and is not a continuation")

    return failures, warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a Bonitz column XML file")
    parser.add_argument("xml", type=Path, help="XML column file")
    parser.add_argument("--json", type=Path, default=None, help="Optional derived JSON file")
    parser.add_argument("--page", default=None, help="Expected page number")
    parser.add_argument("--col", default=None, choices=("left", "right"), help="Expected column side")
    args = parser.parse_args(argv)

    failures, warnings = validate(args.xml, json_path=args.json, page=args.page, col=args.col)

    for msg in failures:
        print(f"FAIL {msg}", file=sys.stderr)
    for msg in warnings:
        print(msg, file=sys.stderr)

    if failures:
        return 1
    if warnings:
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
