"""Count pre-Aristotle and contemporary uses of Aristotle's LSJ lemmata."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, Mapping

from lxml import etree

from ..beta import lookup_variants
from ..config import BUILD_DIR, REPO_ROOT, Manifest
from ..stage1_greek import _line_text
from ..stage3_tokenize import tokenize
from ..stage4_morphology import parse_analysis_line
from ..stage5_lsj import base_key, fold_key, lemma_candidates
from .tlg_canon import CONTEMPORARY, STRICT_BEFORE, parse_canon

EXPORT_DIR = BUILD_DIR / "offline" / "export"
COUNT_DIR = BUILD_DIR / "offline" / "counts"
OUTPUT_PATH = REPO_ROOT / "pipeline" / "data" / "word_distinctiveness.json"
SMOKE_OUTPUT_PATH = REPO_ROOT / "pipeline" / "data" / "word_distinctiveness.smoke.json"
CACHE_VERSION = 2


def derive_label(before: int, contemporary: int, in_aristotle: int) -> str | None:
    if before == 0 and contemporary == 0 and in_aristotle >= 3:
        return "coined by Aristotle"
    if 0 < before < 5:
        return "rare before Aristotle"
    return None


def exported_work_paths(export_dir: Path, author: str) -> list[Path]:
    root = export_dir / "Diogenes-Resources" / "xml" / "tlg"
    return sorted(root.glob(f"tlg{author}*.xml"))


def export_author(
    author: str,
    export_dir: Path,
    diogenes_server: Path,
    tlg_dir: Path,
) -> list[Path]:
    cached = exported_work_paths(export_dir, author)
    if cached:
        return cached

    exporter = diogenes_server / "xml-export.pl"
    if not exporter.is_file():
        raise FileNotFoundError(exporter)
    if not tlg_dir.is_dir():
        raise FileNotFoundError(tlg_dir)
    export_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "perl",
            "xml-export.pl",
            "-c", "tlg",
            "-n", author,
            "-y",
            "-o", str(export_dir),
        ],
        cwd=diogenes_server,
        # HOME is required: Diogenes::Base resolves its user profile dir from
        # it and dies without (stage1_greek's stripped env predates this and
        # survives only on cached exports).
        env={
            "TLG_DIR": str(tlg_dir),
            "PATH": "/usr/bin:/bin",
            "HOME": os.environ["HOME"],
        },
        check=True,
        capture_output=True,
        text=True,
    )
    paths = exported_work_paths(export_dir, author)
    if not paths:
        raise FileNotFoundError(f"export ran but no XML exists for TLG {author}")
    return paths


def count_exported_tokens(paths: Iterable[Path]) -> tuple[Counter[str], set[str]]:
    counts: Counter[str] = Counter()
    capitalized: set[str] = set()
    for path in paths:
        tree = etree.parse(str(path))
        lines = [
            {"n": number, "text": _line_text(line, strip_bars=True)}
            for number, line in enumerate(tree.iter("{*}l"), start=1)
        ]
        if not lines:
            raise ValueError(f"no line elements in {path}")
        spine = {
            "work": path.stem,
            "segments": [{
                "id": path.stem,
                "book": 1,
                "column": path.stem,
                "lines": lines,
            }],
        }
        tokens, _, _ = tokenize(spine)
        for segment in tokens["segments"]:
            for line in segment["lines"]:
                for token in line["tokens"]:
                    key = token.get("k")
                    if key is None:
                        continue
                    counts[key] += 1
                    if token["t"][:1].isupper():
                        capitalized.add(key)
    return counts, capitalized


def cached_author_counts(
    author: str,
    paths: Iterable[Path],
    count_dir: Path,
) -> tuple[Counter[str], set[str]]:
    cache = count_dir / f"{author}.v{CACHE_VERSION}.json"
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
        return Counter(data["counts"]), set(data["capitalized"])

    counts, capitalized = count_exported_tokens(paths)
    count_dir.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".tmp")
    tmp.write_text(
        json.dumps({"counts": counts, "capitalized": sorted(capitalized)}),
        encoding="utf-8",
    )
    tmp.replace(cache)
    return counts, capitalized


def _lemma_indexes(
    universe: set[str],
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    bases: dict[str, list[str]] = defaultdict(list)
    folds: dict[str, list[str]] = defaultdict(list)
    for key in sorted(universe):
        bases[base_key(key)].append(key)
        folds[fold_key(key)].append(key)
    return bases, folds


def resolve_lsj_key(
    lemma: str,
    universe: set[str],
    bases: Mapping[str, list[str]],
    folds: Mapping[str, list[str]],
) -> str | None:
    for kind, value in lemma_candidates(lemma):
        if kind == "exact" and value in universe:
            return value
        matches = bases.get(value) if kind == "base" else folds.get(value)
        if matches:
            return matches[0]
    return None


def aggregate_lemma_counts(
    form_counts: Mapping[str, Counter[str]],
    capitalized: set[str],
    analysis_lines: Iterable[str],
    universe: set[str],
) -> dict[str, Counter[str]]:
    needed: set[str] = set()
    forms = set().union(*(counts.keys() for counts in form_counts.values()))
    for key in forms:
        needed.update(lookup_variants(key, key in capitalized))

    found: dict[str, list[dict]] = {}
    for line in analysis_lines:
        key, tab, value = line.partition("\t")
        if tab and key in needed:
            found[key] = parse_analysis_line(value)

    bases, folds = _lemma_indexes(universe)
    resolved: dict[str, str] = {}
    for form in forms:
        analysis_key = next(
            (key for key in lookup_variants(form, form in capitalized) if found.get(key)),
            None,
        )
        if analysis_key is None:
            continue
        for analysis in found[analysis_key]:
            lsj_key = resolve_lsj_key(analysis["lemma"], universe, bases, folds)
            if lsj_key is not None:
                resolved[form] = lsj_key
                break

    totals: dict[str, Counter[str]] = defaultdict(Counter)
    for bucket, counts in form_counts.items():
        for form, count in counts.items():
            if form in resolved:
                totals[resolved[form]][bucket] += count
    return dict(totals)


def load_lemma_inputs(dist_dir: Path) -> tuple[set[str], dict[str, int]]:
    shard_dir = dist_dir / "lsj"
    shards = sorted(shard_dir.glob("*.json"))
    if not shards:
        raise FileNotFoundError(f"no LSJ shards in {shard_dir}")
    universe = {
        key
        for path in shards
        for key in json.loads(path.read_text(encoding="utf-8"))
    }

    lemmata_path = dist_dir / "lemmata.json"
    lemmata = json.loads(lemmata_path.read_text(encoding="utf-8"))
    in_aristotle = {key: row["count"] for key, row in lemmata.items()}
    return universe, in_aristotle


def build_table(
    universe: set[str],
    in_aristotle: Mapping[str, int],
    totals: Mapping[str, Counter[str]],
) -> dict[str, dict[str, int | str | None]]:
    table = {}
    for key in sorted(universe.intersection(in_aristotle)):
        in_count = int(in_aristotle[key])
        before = int(totals.get(key, {}).get(STRICT_BEFORE, 0))
        contemporary = int(totals.get(key, {}).get(CONTEMPORARY, 0))
        table[key] = {
            "in_aristotle": in_count,
            "before_aristotle": before,
            "contemporary": contemporary,
            "label": derive_label(before, contemporary, in_count),
        }
    return table


def run(
    canon_path: Path,
    manifest: Manifest,
    limit: int | None = None,
    output_path: Path | None = None,
) -> Path:
    authors = parse_canon(canon_path.read_bytes())
    selected = [
        author
        for author, record in sorted(authors.items())
        if record["bucket"] in {STRICT_BEFORE, CONTEMPORARY}
    ]
    if limit is not None:
        selected = selected[:limit]

    form_counts = {STRICT_BEFORE: Counter(), CONTEMPORARY: Counter()}
    capitalized: set[str] = set()
    for index, author in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] TLG {author} {authors[author]['name']}")
        paths = export_author(
            author,
            EXPORT_DIR,
            manifest.diogenes_server(),
            manifest.tlg_dir(),
        )
        counts, author_capitalized = cached_author_counts(author, paths, COUNT_DIR)
        form_counts[authors[author]["bucket"]].update(counts)
        capitalized.update(author_capitalized)

    analyses_path = manifest.diogenes_data() / "greek-analyses.txt"
    if not analyses_path.is_file():
        raise FileNotFoundError(analyses_path)
    universe, in_aristotle = load_lemma_inputs(BUILD_DIR / "dist")
    with analyses_path.open(encoding="utf-8", errors="replace") as lines:
        totals = aggregate_lemma_counts(form_counts, capitalized, lines, universe)
    table = build_table(universe, in_aristotle, totals)

    destination = output_path or (SMOKE_OUTPUT_PATH if limit is not None else OUTPUT_PATH)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(table, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    return destination


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("canon", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    manifest = Manifest.load(args.manifest)
    print(run(args.canon, manifest, args.limit, args.output))


if __name__ == "__main__":
    main()
