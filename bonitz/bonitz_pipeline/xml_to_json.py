"""
Convert Bonitz column XML (from transcribe.py) to a JSON data file
suitable for import by the Astro site.

Usage:
    python3 -m bonitz_pipeline.xml_to_json pilot/p15_left_opus48.xml \
        --out app/src/data/bonitz-pilot.json
"""

from __future__ import annotations
import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from .expand_abbrevs import tokenize_segments


def _segments(node: ET.Element) -> list[dict]:
    """
    Walk a <text> or <lemma> element and return raw segments:
      {"kind": "text",    "content": "..."}
      {"kind": "cit",     "content": "1456b27"}
      {"kind": "unclear", "content": "..."}
    Preserves inter-element tail text. Does NOT recurse into <sense> children.
    """
    parts: list[dict] = []

    if node.text:
        parts.append({"kind": "text", "content": node.text})

    for child in node:
        tag = child.tag
        if tag == "cit":
            parts.append({"kind": "cit", "content": (child.text or "").strip()})
        elif tag == "unclear":
            parts.append({"kind": "unclear", "content": (child.text or "")})
        elif tag == "lat":
            parts.append({"kind": "lat", "latin": (child.text or ""),
                          "english": child.get("gloss", "")})
        elif tag != "sense":  # sense children handled separately
            parts.append({"kind": "text", "content": (child.text or "")})

        if child.tail:
            parts.append({"kind": "text", "content": child.tail})

    return parts


def _parse_sense(el: ET.Element) -> dict:
    """Parse a <sense> element recursively."""
    n = el.get("n", "")
    text_el = el.find("text")
    child_senses = el.findall("sense")

    sense: dict = {"n": n}

    # Text content: either in a <text> child or directly in the <sense> element
    if text_el is not None:
        sense["segments"] = tokenize_segments(_segments(text_el))
    else:
        sense["segments"] = tokenize_segments(_segments(el))

    if child_senses:
        sense["children"] = [_parse_sense(s) for s in child_senses]

    return sense


def _parse_entry(child: ET.Element) -> dict:
    """Parse an <entry> element into a JSON dict."""
    entry_type = child.get("type", "entry")
    continues  = child.get("continues")          # "next" if cut off at column end

    lemma_el   = child.find("lemma")
    text_el    = child.find("text")
    sense_els  = child.findall("sense")

    # Opus sometimes nests <sense> elements inside a <text> wrapper instead of
    # placing them directly under <entry>. Treat those as the entry's senses.
    if not sense_els and text_el is not None:
        nested_senses = text_el.findall("sense")
        if nested_senses:
            sense_els = nested_senses

    entry: dict = {"type": entry_type}

    if continues:
        entry["continues"] = True

    if lemma_el is not None:
        raw_segs = _segments(lemma_el)
        entry["lemma"] = "".join(s["content"] for s in raw_segs)

    if sense_els:
        entry["senses"] = [_parse_sense(s) for s in sense_els]
    elif text_el is not None:
        entry["segments"] = tokenize_segments(_segments(text_el))
    else:
        entry["segments"] = []

    return entry


def parse_column_xml(path: Path) -> dict:
    tree = ET.parse(path)
    root = tree.getroot()

    page    = root.get("page", "?")
    col     = root.get("col", "?")
    section = root.get("section", "")

    entries = []
    for child in root:
        if child.tag == "section_head":
            entries.append({"type": "section_head", "content": (child.text or "").strip()})
            continue
        if child.tag == "entry":
            entries.append(_parse_entry(child))

    return {
        "page":    page,
        "col":     col,
        "section": section,
        "entries": entries,
    }


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Convert Bonitz column XML to JSON")
    p.add_argument("xml", type=Path, help="Input XML file")
    p.add_argument("--out", type=Path, required=True, help="Output JSON file")
    args = p.parse_args(argv)

    data = parse_column_xml(args.xml)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(data['entries'])} entries → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
