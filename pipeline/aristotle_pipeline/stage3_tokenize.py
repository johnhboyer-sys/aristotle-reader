"""Stage 3: tokenize the Greek spine.

Splits each line on whitespace, strips editorial sigla and punctuation from
token edges (logging every sigla strip), keeps elision apostrophes as part
of the token, and attaches a Beta Code lookup key per token along with its
character offset in the line for the frontend.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .beta import to_beta_key
from .config import BUILD_DIR, Manifest
from .quality import check_breathing

# Stripped silently from token edges: ordinary punctuation. The pipe `|` marks
# verse-line divisions inside quoted hexameter (e.g. the Empedocles fragments in
# Metaphysics) — a metrical separator, not part of any word. ‘ (U+2018) opens a
# quotation (e.g. the poets quoted in the Politics); its mate ’ (U+2019) is left
# out because it doubles as the elision apostrophe, which the surface form keeps.
# « » (U+00AB/U+00BB) wrap quoted verse in the TLG (e.g. the Empedocles fragments
# in On Generation and Corruption) — edge punctuation, stripped silently.
_PUNCT = ".,·;—()|\"‘«»" + "·;"  # ano teleia, Greek question mark
# Stripped but logged: editorial sigla found by the stage 2 inventory.
# ⎪ (U+23AA) is the column divider the TLG uses inside Aristotle's inline tables
# (e.g. the De Int 22a modal-opposition square); strip it so the cells tokenize.
# ⟦ ⟧ (U+27E6/U+27E7) are the double brackets marking editorially secluded text
# (e.g. the deleted passages in De Generatione Animalium); treat like [ ].
# ⌜ ⌞ ⌝ ⌟ (U+231C/231E/231D/231F) are the half/corner brackets the TLG uses to
# mark editorial supplements and transpositions (e.g. in the Eudemian Ethics);
# strip like the other seclusion brackets so the bracketed words tokenize.
_SIGLA = "†*<>[]⎪⟦⟧⌜⌞⌝⌟"

_STRIP = _PUNCT + _SIGLA
_APOSTROPHE_END = re.compile(r"['’᾽ʼ]$")


def _clean(raw: str) -> tuple[str, bool]:
    """Strip punctuation/sigla from both edges; keep a trailing elision
    apostrophe. Returns (token, had_sigla)."""
    had_sigla = any(ch in _SIGLA for ch in raw)
    token = raw.strip(_STRIP)
    # Inner sigla (rare: † within a corrupt word, <> around a supplement
    # inside a word) are removed too; the surface form keeps only letters
    # and apostrophes.
    token = "".join(ch for ch in token if ch not in _SIGLA)
    return token, had_sigla


def tokenize(spine: dict) -> tuple[dict, list[dict], list[dict]]:
    segments_out = []
    sigla_log: list[dict] = []
    key_failures: list[dict] = []
    for seg in spine["segments"]:
        lines_out = []
        for line in seg["lines"]:
            # lettered lines (244b5a) share a number with 244b5, so the
            # suffix must be part of the ref or the two collide
            ref = f"{seg['column']}{line['n']}{line.get('sub', '')}"
            text = line["text"]
            tokens = []
            # Em-dashes glue clauses together with no spaces; they are
            # separators, not part of any token.
            for m in re.finditer(r"[^\s—]+", text):
                raw = m.group(0)
                token, had_sigla = _clean(raw)
                if had_sigla:
                    sigla_log.append({"ref": ref, "raw": raw, "kept": token})
                if not token:
                    continue
                entry = {"t": token, "o": m.start()}
                try:
                    entry["k"] = to_beta_key(token)
                except ValueError as err:
                    key_failures.append({"ref": ref, "token": token, "error": str(err)})
                tokens.append(entry)
            entry_line = {"n": line["n"], "tokens": tokens}
            if line.get("sub"):
                entry_line["sub"] = line["sub"]
            lines_out.append(entry_line)
        segments_out.append(
            {"id": seg["id"], "book": seg["book"], "column": seg["column"], "lines": lines_out}
        )
    return (
        {"work": spine["work"], "segments": segments_out},
        sigla_log,
        key_failures,
    )


def _quality_tokens(tokens: dict) -> list[dict]:
    records = []
    for seg in tokens["segments"]:
        for line in seg["lines"]:
            ref = f"{seg['column']}{line['n']}{line.get('sub', '')}"
            records.extend({"ref": ref, "surface": token["t"]} for token in line["tokens"])
    return records


def _quality_markdown(report: dict) -> str:
    check = report["checks"]["breathing_position"]
    lines = [
        "# Stage 3 text quality report",
        "",
        f"Overall: {'PASS' if report['ok'] else 'FAIL'}",
        "",
        "## Breathing position",
        f"- {check['tokens_checked']} tokens checked; {len(check['flagged'])} flagged; "
        f"{len(check['unexpected'])} unexpected; {check['per_10k']:.2f} per 10k",
    ]
    for entry in check["flagged"]:
        status = entry.get("reason", "**UNEXPECTED**")
        lines.append(f"  - {entry['ref']}: {entry['surface']} ({status})")
    return "\n".join(lines) + "\n"


def run(manifest: Manifest) -> Path:
    spine = json.loads(
        (BUILD_DIR / "stage1" / "greek_spine.json").read_text(encoding="utf-8")
    )
    tokens, sigla_log, key_failures = tokenize(spine)
    out_dir = BUILD_DIR / "stage3"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "tokens.json"
    out.write_text(json.dumps(tokens, ensure_ascii=False), encoding="utf-8")
    (out_dir / "sigla_log.json").write_text(
        json.dumps(sigla_log, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (out_dir / "key_failures.json").write_text(
        json.dumps(key_failures, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    quality_report = check_breathing(
        _quality_tokens(tokens),
        manifest.data.get("illegal_breathing_allow", []),
    )
    (out_dir / "quality_report.json").write_text(
        json.dumps(quality_report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (out_dir / "quality_report.md").write_text(
        _quality_markdown(quality_report), encoding="utf-8"
    )
    return out
