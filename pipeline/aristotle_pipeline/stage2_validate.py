"""Stage 2: validation of the Stage 1 spine, chunks, and alignment.

Checks:
  1. Column completeness and monotonic order across 1094a-1181b.
  2. Line-number gaps inside columns (book-boundary gaps are expected and
     verified against the manifest; anything else is flagged).
  3. Alignment coverage in both directions.
  4. Greek/English length-ratio outliers (> 1.5 SD from the mean ratio).
  5. Proper-name spot check: names that should co-occur in the same column
     in both languages.
  6. Sigla/character inventory of the Greek text: every non-Greek,
     non-expected character with counts and sample locations.

Emits build/stage2/validation_report.json and .md (human-readable).
"""

from __future__ import annotations

import json
import statistics
import unicodedata
from collections import defaultdict
from pathlib import Path

from .config import BUILD_DIR, Manifest
from .refs import column_key, column_range, ref_key

def _base(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()

# Characters we expect in Bywater's text besides Greek letters.
EXPECTED_NON_GREEK = set(" .,·;'’ʼ—-()[]")


def _is_greek_letter(ch: str) -> bool:
    if not ch.isalpha():
        return False
    try:
        return "GREEK" in unicodedata.name(ch)
    except ValueError:
        return False


def validate(manifest: Manifest, spine: dict, english: dict, alignment: dict) -> dict:
    report: dict = {"checks": {}}
    segments = spine["segments"]
    # A non-Bekker work (citation.scheme: busse) uses a synthetic a-side-only
    # column set ("1a".."22a") and drops the editorial section-heading lines, so
    # the standard Bekker completeness (which expects both a/b sides) and the
    # line-gap check (which sees the dropped heading lines as gaps) don't apply.
    busse = ((manifest.data.get("citation") or {}).get("scheme", "bekker") == "busse")

    # --- 1. column completeness + monotonicity --------------------------
    seen_cols: list[str] = []
    for seg in segments:
        if seg["column"] not in seen_cols:
            seen_cols.append(seg["column"])
    # busse: the spine's own columns ARE the expected set (no a/b pairing).
    expected = list(seen_cols) if busse else column_range(
        manifest.first_column, manifest.last_column)
    missing = sorted(set(expected) - set(seen_cols), key=column_key)
    extra = sorted(set(seen_cols) - set(expected), key=column_key)
    keys = [column_key(c) for c in seen_cols]
    monotonic = all(a <= b for a, b in zip(keys, keys[1:]))
    report["checks"]["columns"] = {
        "expected": len(expected),
        "found": len(seen_cols),
        "missing": missing,
        "extra": extra,
        "monotonic": monotonic,
        "ok": not missing and not extra and monotonic,
    }

    # --- 2. line-number gaps ---------------------------------------------
    # Expected gaps: between one book's end and the next book's start when
    # they share a column (Bekker numbering skips the heading lines).
    expected_gaps = set()
    books = manifest.books
    for prev, nxt in zip(books, books[1:]):
        e_page, e_side, e_line = ref_key(prev["end"])
        s_page, s_side, s_line = ref_key(nxt["start"])
        if (e_page, e_side) == (s_page, s_side):
            expected_gaps.add((f"{e_page}{e_side}", e_line, s_line))
    # Edition quirks declared in the manifest (e.g. a repeated line number).
    for g in manifest.data.get("expected_line_gaps", []):
        expected_gaps.add((g["column"], g["after"], g["next"]))
    gaps = []
    lines_by_col: dict[str, list[int]] = defaultdict(list)
    for seg in segments:
        lines_by_col[seg["column"]].extend(l["n"] for l in seg["lines"])
    for col, nums in lines_by_col.items():
        for a, b in zip(nums, nums[1:]):
            if b != a + 1:
                entry = {
                    "column": col,
                    "after_line": a,
                    "next_line": b,
                    "expected": (col, a, b) in expected_gaps,
                }
                gaps.append(entry)
    # busse: per-page line numbering with the editorial section headings dropped
    # from the spine leaves benign intra-page gaps; they're expected by design.
    if busse:
        for g in gaps:
            g["expected"] = True
    unexpected_gaps = [g for g in gaps if not g["expected"]]
    report["checks"]["line_gaps"] = {
        "gaps": gaps,
        "unexpected": unexpected_gaps,
        "ok": not unexpected_gaps,
    }

    # --- 3. alignment coverage -------------------------------------------
    unmatched = [p["segment"] for p in alignment["pairs"] if p["english"] is None]
    # Columns the English TEI demonstrably cannot cover (Perseus omitted a Bekker
    # page milestone, or assigns a book-straddling column to a single book) are
    # declared in the manifest so they're surfaced but don't fail the build.
    allowed = set(manifest.data.get("alignment_allow_unmatched", []))
    unexpected_unmatched = [s for s in unmatched if s not in allowed]
    # A book-boundary edition mismatch is symmetric: the English TEI places a
    # book division a column off from the Greek, leaving both an unpaired Greek
    # segment and an unpaired English chunk. The allowance covers either side.
    unexpected_english_only = [s for s in alignment["english_only"] if s not in allowed]
    report["checks"]["alignment"] = {
        "pairs": len(alignment["pairs"]),
        "unmatched_segments": unmatched,
        "allowed_unmatched": sorted(allowed & (set(unmatched) | set(alignment["english_only"]))),
        "unexpected_unmatched": unexpected_unmatched,
        "english_only": alignment["english_only"],
        "unexpected_english_only": unexpected_english_only,
        "ok": not unexpected_unmatched and not unexpected_english_only,
    }

    # --- 4. length-ratio outliers ------------------------------------------
    eng_by_id = {c["id"]: c for c in english["chunks"]}
    ratios = []
    for seg in segments:
        eng = eng_by_id.get(seg["id"])
        if eng is None:
            continue
        glen = sum(len(l["text"]) for l in seg["lines"])
        elen = len(eng["text"])
        if glen and elen:
            ratios.append((seg["id"], elen / glen, glen, elen))
    vals = [r[1] for r in ratios]
    mean, sd = statistics.mean(vals), statistics.stdev(vals)
    outliers = [
        {"id": rid, "ratio": round(r, 3), "greek_chars": g, "english_chars": e}
        for rid, r, g, e in ratios
        if abs(r - mean) > 1.5 * sd
    ]
    report["checks"]["length_ratio"] = {
        "mean": round(mean, 3),
        "sd": round(sd, 3),
        "outliers": sorted(outliers, key=lambda o: -abs(o["ratio"] - mean)),
        "ok": True,  # informational; outliers need eyes, not a hard fail
    }

    # --- 5. proper-name spot check ------------------------------------------
    greek_text_by_col: dict[str, str] = defaultdict(str)
    eng_text_by_col: dict[str, str] = defaultdict(str)
    for seg in segments:
        greek_text_by_col[seg["column"]] += " ".join(l["text"] for l in seg["lines"])
    for c in english["chunks"]:
        eng_text_by_col[c["column"]] += c["text"]
    greek_base_by_col = {c: _base(t) for c, t in greek_text_by_col.items()}
    proper_names = [tuple(p) for p in manifest.data.get("proper_names", [])]
    name_results = []
    for grc, eng_name in proper_names:
        grc_cols = {c for c, t in greek_base_by_col.items() if grc in t}
        eng_cols = {c for c, t in eng_text_by_col.items() if eng_name in t}
        # English chunk boundaries sit exactly at milestones, but a sentence
        # begun late in one column is often translated as overflowing the
        # boundary; allow +/- one column of slack.
        def near(col, others):
            i = expected.index(col)
            window = set(expected[max(0, i - 1) : i + 2])
            return bool(window & others)

        only_greek = sorted(c for c in grc_cols if not near(c, eng_cols))
        only_english = sorted(c for c in eng_cols if not near(c, grc_cols))
        name_results.append(
            {
                "greek": grc,
                "english": eng_name,
                "greek_columns": len(grc_cols),
                "english_columns": len(eng_cols),
                "greek_without_english": only_greek,
                "english_without_greek": only_english,
            }
        )
    report["checks"]["proper_names"] = {
        "names": name_results,
        "ok": all(
            not n["greek_without_english"] and not n["english_without_greek"]
            for n in name_results
        ),
    }

    # --- 6. sigla / character inventory ------------------------------------
    inventory: dict[str, dict] = {}
    for seg in segments:
        for line in seg["lines"]:
            for ch in line["text"]:
                if _is_greek_letter(ch) or ch in EXPECTED_NON_GREEK:
                    continue
                entry = inventory.setdefault(
                    ch,
                    {
                        "char": ch,
                        "name": unicodedata.name(ch, "UNKNOWN"),
                        "count": 0,
                        "samples": [],
                    },
                )
                entry["count"] += 1
                if len(entry["samples"]) < 5:
                    entry["samples"].append(
                        {"ref": f"{seg['column']}{line['n']}", "text": line["text"][:80]}
                    )
    report["checks"]["sigla"] = {
        "characters": sorted(inventory.values(), key=lambda e: -e["count"]),
        "ok": True,  # informational
    }

    report["ok"] = all(c.get("ok") for c in report["checks"].values())
    return report


def _to_markdown(report: dict) -> str:
    c = report["checks"]
    lines = ["# Stage 2 validation report", ""]
    lines.append(f"Overall: {'PASS' if report['ok'] else 'FAIL'}")
    cols = c["columns"]
    lines += [
        "",
        "## Columns",
        f"- {cols['found']}/{cols['expected']} columns, monotonic: {cols['monotonic']}",
        f"- missing: {cols['missing'] or 'none'}; extra: {cols['extra'] or 'none'}",
        "",
        "## Line gaps",
        f"- {len(c['line_gaps']['gaps'])} gaps, "
        f"{len(c['line_gaps']['unexpected'])} unexpected",
    ]
    for g in c["line_gaps"]["gaps"]:
        marker = "expected (book boundary)" if g["expected"] else "**UNEXPECTED**"
        lines.append(
            f"  - {g['column']}: {g['after_line']} -> {g['next_line']} ({marker})"
        )
    a = c["alignment"]
    lines += [
        "",
        "## Alignment",
        f"- {a['pairs']} pairs; unmatched segments: {a['unmatched_segments'] or 'none'}; "
        f"english-only: {a['english_only'] or 'none'}",
        "",
        "## Length ratios (english chars / greek chars)",
        f"- mean {c['length_ratio']['mean']}, sd {c['length_ratio']['sd']}, "
        f"{len(c['length_ratio']['outliers'])} outliers > 1.5 SD",
    ]
    for o in c["length_ratio"]["outliers"][:15]:
        lines.append(
            f"  - {o['id']}: ratio {o['ratio']} "
            f"(grc {o['greek_chars']}, eng {o['english_chars']})"
        )
    lines += ["", "## Proper names"]
    for n in c["proper_names"]["names"]:
        status = (
            "ok"
            if not n["greek_without_english"] and not n["english_without_greek"]
            else f"grc-only {n['greek_without_english']} eng-only {n['english_without_greek']}"
        )
        lines.append(
            f"- {n['greek']} / {n['english']}: grc in {n['greek_columns']} cols, "
            f"eng in {n['english_columns']} cols — {status}"
        )
    lines += ["", "## Non-Greek character inventory"]
    for e in c["sigla"]["characters"]:
        sample = e["samples"][0]["ref"] if e["samples"] else ""
        lines.append(
            f"- U+{ord(e['char']):04X} {e['char']!r} {e['name']} x{e['count']} "
            f"(e.g. {sample})"
        )
    return "\n".join(lines) + "\n"


def run(manifest: Manifest) -> Path:
    stage1 = BUILD_DIR / "stage1"
    spine = json.loads((stage1 / "greek_spine.json").read_text(encoding="utf-8"))
    english = json.loads((stage1 / "english_chunks.json").read_text(encoding="utf-8"))
    alignment = json.loads((stage1 / "alignment.json").read_text(encoding="utf-8"))
    report = validate(manifest, spine, english, alignment)
    out_dir = BUILD_DIR / "stage2"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "validation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    md_path = out_dir / "validation_report.md"
    md_path.write_text(_to_markdown(report), encoding="utf-8")
    return md_path
