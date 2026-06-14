"""Stage 4: morphological analyses for every corpus token.

Single targeted pass over Diogenes' greek-analyses.txt (115MB): only lines
whose key is needed by some corpus token are parsed and kept — the file is
never loaded wholesale. All homonym candidates are retained.

Keys prefixed '!' in the data (352 of ~950k) are Morpheus artifacts that
Diogenes' own query normalization can never produce; they are ignored.

Unmatched tokens land in build/stage4/unmatched.json — the reviewable patch
file (expected ~2-5% of distinct forms).
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from .beta import lookup_variants
from .config import BUILD_DIR, Manifest

# The digit after the lemma id is a Morpheus flag (9 for ordinary words,
# 0/1 for proper names and rarities); proper-name groups also omit the
# "form," prefix and carry a blank gloss.
_GROUP = re.compile(r"\{(\d+) \d+ ([^\t}]*)\t([^\t}]*)\t([^}]*)\}")


def parse_analysis_line(value: str) -> list[dict]:
    out = []
    for lemma_id, form_lemma, gloss, parse in _GROUP.findall(value):
        form, comma, lemma = form_lemma.partition(",")
        if not comma:
            lemma = form
        out.append(
            {
                "lemma_id": int(lemma_id),
                "form": form,
                "lemma": lemma,
                "gloss": gloss,
                "parse": parse,
            }
        )
    return out


def collect_needed_keys(tokens_doc: dict) -> tuple[set[str], Counter, dict]:
    """All candidate analyses keys, token-key frequencies, and sample refs."""
    freq: Counter = Counter()
    samples: dict[str, dict] = {}
    for seg in tokens_doc["segments"]:
        for line in seg["lines"]:
            for tok in line["tokens"]:
                key = tok.get("k")
                if key is None:
                    continue
                freq[key] += 1
                capitalized = tok["t"][:1].isupper()
                if key not in samples:
                    samples[key] = {
                        "surface": tok["t"],
                        "ref": f"{seg['column']}{line['n']}",
                        "capitalized": capitalized,
                    }
                elif capitalized:
                    samples[key]["capitalized"] = True
    needed: set[str] = set()
    for key in freq:
        needed.update(lookup_variants(key, samples[key]["capitalized"]))
    return needed, freq, samples


def scan_analyses(path: Path, needed: set[str]) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            key, tab, value = line.partition("\t")
            if key in needed:
                found[key] = parse_analysis_line(value)
    return found


def run(manifest: Manifest) -> Path:
    tokens_doc = json.loads(
        (BUILD_DIR / "stage3" / "tokens.json").read_text(encoding="utf-8")
    )
    needed, freq, samples = collect_needed_keys(tokens_doc)
    analyses_path = manifest.diogenes_data() / "greek-analyses.txt"
    found = scan_analyses(analyses_path, needed)

    # Hand-reviewed overrides for forms Morpheus doesn't know (letter
    # labels in the Book V proportions, odd compounds).
    patch_path = manifest.path.parent / f"{manifest.work_id}-analyses-patch.json"
    patches: dict[str, list] = {}
    if patch_path.exists():
        patches = json.loads(patch_path.read_text(encoding="utf-8"))
        found.update({k: v for k, v in patches.items() if v})

    # Resolve each token key to the first variant with an analysis.
    resolved: dict[str, str] = {}
    unmatched: list[dict] = []
    for key, count in freq.most_common():
        hit = next(
            (
                v
                for v in lookup_variants(key, samples[key]["capitalized"])
                if v in found
            ),
            None,
        )
        if hit is not None:
            resolved[key] = hit
        else:
            unmatched.append(
                {
                    "key": key,
                    "surface": samples[key]["surface"],
                    "first_ref": samples[key]["ref"],
                    "count": count,
                    "analyses": [],  # patch slot: fill by hand to override
                }
            )

    analyses_out = {v: found[v] for v in sorted(set(resolved.values()))}
    out_dir = BUILD_DIR / "stage4"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "analyses.json"
    out.write_text(json.dumps(analyses_out, ensure_ascii=False), encoding="utf-8")
    (out_dir / "key_map.json").write_text(
        json.dumps(resolved, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "unmatched.json").write_text(
        json.dumps(unmatched, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    n_tokens = sum(freq.values())
    n_unmatched_tokens = sum(u["count"] for u in unmatched)
    summary = {
        "distinct_keys": len(freq),
        "distinct_matched": len(resolved),
        "distinct_unmatched": len(unmatched),
        "token_count": n_tokens,
        "tokens_unmatched": n_unmatched_tokens,
        "token_match_rate": round(1 - n_unmatched_tokens / n_tokens, 4),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1))
    return out
