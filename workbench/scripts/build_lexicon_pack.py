#!/usr/bin/env python3
"""Build a Translation Workbench lexicon pack.

A pack is one language's COMPLETE dictionary plus its COMPLETE morphology, in
one .zip the user installs from Settings › Lexicon. The app ships without any
pack: word lookup is wired up but has no data until one is installed, which is
what keeps the download small and lets a user take only the language they work
in.

    Greek  — Liddell & Scott, all 116,728 entries + every Greek form Morpheus
             knows (~234 MB installed)
    Latin  — Lewis & Short, all 51,674 entries + every Latin form Morpheus
             knows (~129 MB installed)

WHAT A PACK MAY CONTAIN, AND MAY NOT
------------------------------------
Only openly-licensed reference data: Perseus' LSJ and Lewis & Short (CC BY-SA)
and the Morpheus analyses that ship with Diogenes. NO TLG TEXT, ever — the
user's Greek corpus is theirs, licensed to them, and stays on their machine.
A pack is a dictionary and a parser, never a text.

This runs on the PACKAGER's machine (it needs a Diogenes install as its
source), not the user's. The resulting .zip is what gets distributed.

WHY IT ISN'T PART OF EITHER READER'S PIPELINE
---------------------------------------------
The pipelines' own stage 5 emits only the entries their corpus uses — 14,049
of LSJ's 116,728, 11,367 of Lewis & Short's 51,674 — because a reader only
ever renders words that occur in its texts. A workbench user can open any
author at all, so a pack takes the whole dictionary. The TEI→HTML conversion
is the same either way, so this script IMPORTS that conversion from the
classical-philosophy-reader pipeline rather than growing a second copy of it:
one implementation, two callers with different scopes.

USAGE
    python3 scripts/build_lexicon_pack.py --language lat --out dist/
    python3 scripts/build_lexicon_pack.py --language grc --out dist/

Needs lxml, which the classical-philosophy-reader pipeline's venv already has:
    /Users/johnboyer/Developer/classical-philosophy-reader/pipeline/.venv/bin/python

Options:
    --language grc|lat      which pack to build (required)
    --out DIR               where to write <lang>-lexicon-pack.zip (required)
    --diogenes-data DIR     source data dir (default: the standard install)
    --pipeline DIR          classical-philosophy-reader/pipeline (for the
                            TEI→HTML conversion; default: the sibling checkout)
    --keep-dir              also leave the unzipped pack next to the .zip,
                            for inspection
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

DEFAULT_DIOGENES_DATA = Path("/Applications/Diogenes.app/Contents/dependencies/data")
DEFAULT_PIPELINE = Path("/Users/johnboyer/Developer/classical-philosophy-reader/pipeline")

# The pack format version the app checks. Bump only on a BREAKING layout
# change — the app refuses a pack whose version it doesn't know, which is
# kinder than half-reading one.
PACK_FORMAT = 1

LANGUAGES = {
    "grc": {
        "name": "Greek",
        "dictionary": "Liddell & Scott",
        "shard_dir": "lsj",
        "analyses": "greek-analyses.txt",
        "index": "greek-analyses.idt",
    },
    "lat": {
        "name": "Latin",
        "dictionary": "Lewis & Short",
        "shard_dir": "ls",
        "analyses": "latin-analyses.txt",
        "index": "latin-analyses.idt",
    },
}


def load_conversion(pipeline_dir: Path):
    """Import the TEI→HTML conversion from the reader pipeline (see module
    docstring for why this is imported rather than copied)."""
    if not (pipeline_dir / "reader_pipeline" / "stage5_lsj.py").exists():
        sys.exit(
            f"Can't find the reader pipeline at {pipeline_dir}.\n"
            f"Pass --pipeline <classical-philosophy-reader>/pipeline."
        )
    sys.path.insert(0, str(pipeline_dir))
    try:
        from reader_pipeline.stage5_lsj import (  # type: ignore
            _DICTIONARY_FILENAMES,
            _DIV_TAG,
            derive_short_def,
            entry_html,
            shard_letter,
        )
    except ImportError as err:
        sys.exit(
            f"Couldn't import the conversion from {pipeline_dir}: {err}\n"
            f"It needs lxml — try that pipeline's venv python."
        )
    return _DICTIONARY_FILENAMES, _DIV_TAG, entry_html, derive_short_def, shard_letter


def build_shards(xml_path: Path, language: str, conversion) -> tuple[dict, dict, int]:
    """Convert EVERY entry in the dictionary to the app's shard format.

    Streams the file line by line rather than parsing it whole: these are
    108 MB (LSJ) and 76 MB (Lewis & Short) of a flat run of per-entry TEI
    fragments with no root element, so there is nothing to parse as one
    document anyway. Each entry is parsed on its own, as the pipeline does.
    """
    filenames, div_tags, entry_html, derive_short_def, shard_letter = conversion
    from lxml import etree  # provided by the pipeline venv

    div_open = f"<{div_tags[language]} "
    div_close = f"</{div_tags[language]}>"
    import re

    key_re = re.compile(r'\bkey="([^"]*)"')

    shards: dict[str, dict] = defaultdict(dict)
    short_defs: dict[str, str] = {}
    kept = 0
    buf: list[str] = []
    inside = False
    key = ""

    with open(xml_path, encoding="utf-8") as f:
        for line in f:
            if div_open in line:
                m = key_re.search(line)
                key = m.group(1) if m else ""
                inside = bool(key)
                buf = []
            if not inside:
                continue
            buf.append(line)
            if div_close not in line:
                continue

            fragment = "".join(buf)
            start = fragment.index(div_open)
            end = fragment.rindex(div_close) + len(div_close)
            try:
                entry_el = etree.fromstring(fragment[start:end])
            except etree.XMLSyntaxError as err:
                # One unparsable entry must not cost the other 116,727. Report
                # it and carry on — a pack short a malformed entry is far
                # better than no pack.
                print(f"  ! skipping unparsable entry {key!r}: {err}", file=sys.stderr)
                inside = False
                continue

            shards[shard_letter(key)][key] = {
                "key": key,
                "head": entry_el.findtext("head") or key,
                "html": entry_html(entry_el),
            }
            if language == "grc":
                # Greek only: every Latin analysis ships with an empty gloss,
                # so there is no short definition to derive there (measured by
                # the pipeline at 0 of 231,938).
                short_def = derive_short_def(entry_el)
                if short_def:
                    short_defs[key] = short_def
            kept += 1
            inside = False
            if kept % 20000 == 0:
                print(f"  … {kept:,} entries converted")

    return shards, short_defs, kept


def human(n: int) -> str:
    return f"{n / 1_048_576:.0f} MB"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--language", required=True, choices=sorted(LANGUAGES))
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--diogenes-data", type=Path, default=DEFAULT_DIOGENES_DATA)
    ap.add_argument("--pipeline", type=Path, default=DEFAULT_PIPELINE)
    ap.add_argument("--keep-dir", action="store_true")
    args = ap.parse_args()

    language = args.language
    spec = LANGUAGES[language]
    data = args.diogenes_data
    if not data.is_dir():
        sys.exit(f"No Diogenes data directory at {data} — pass --diogenes-data.")

    conversion = load_conversion(args.pipeline)
    filenames = conversion[0]
    xml_path = data / filenames[language]
    analyses_path = data / spec["analyses"]
    index_path = data / spec["index"]
    for path in (xml_path, analyses_path, index_path):
        if not path.exists():
            sys.exit(f"Missing source file: {path}")

    out_root: Path = args.out
    out_root.mkdir(parents=True, exist_ok=True)
    staging = out_root / f"{language}-lexicon-pack"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / spec["shard_dir"]).mkdir(parents=True)
    (staging / "morphology").mkdir(parents=True)

    print(f"Building the {spec['name']} pack")
    print(f"  dictionary: {spec['dictionary']} ({xml_path.name}, {human(xml_path.stat().st_size)})")
    shards, short_defs, kept = build_shards(xml_path, language, conversion)

    shard_bytes = 0
    for letter, entries in sorted(shards.items()):
        target = staging / spec["shard_dir"] / f"{letter}.json"
        target.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
        shard_bytes += target.stat().st_size
    if short_defs:
        (staging / "short_defs.json").write_text(
            json.dumps(short_defs, ensure_ascii=False), encoding="utf-8"
        )

    # Morphology travels VERBATIM: these files are already sorted and carry
    # their own byte-offset index, which is exactly what the app reads them
    # with (src/lib/lexicon/morphology.ts). Re-encoding them as JSON would
    # multiply their size for nothing.
    print(f"  morphology: {analyses_path.name} ({human(analyses_path.stat().st_size)})")
    shutil.copyfile(analyses_path, staging / "morphology" / spec["analyses"])
    shutil.copyfile(index_path, staging / "morphology" / spec["index"])

    manifest = {
        "format": PACK_FORMAT,
        "language": language,
        "name": f"{spec['name']} dictionary and word parsing",
        "dictionary": spec["dictionary"],
        "entries": kept,
        "shardDir": spec["shard_dir"],
        "analysesFile": spec["analyses"],
        "indexFile": spec["index"],
        # Provenance, so an installed pack can say where it came from.
        "source": "Perseus Digital Library (CC BY-SA), via Diogenes",
    }
    (staging / "pack.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")

    zip_path = out_root / f"{language}-lexicon-pack.zip"
    if zip_path.exists():
        zip_path.unlink()
    print("  compressing…")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(staging))

    installed = shard_bytes + analyses_path.stat().st_size + index_path.stat().st_size
    print()
    print(f"  {kept:,} dictionary entries, {len(shards)} shards")
    if short_defs:
        print(f"  {len(short_defs):,} short definitions")
    print(f"  installed size ≈ {human(installed)}")
    print(f"  download size   = {human(zip_path.stat().st_size)}")
    print(f"  → {zip_path}")

    if not args.keep_dir:
        shutil.rmtree(staging)


if __name__ == "__main__":
    main()
