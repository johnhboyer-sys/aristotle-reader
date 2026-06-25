"""
Pilot comparison: align Claude XML transcript against Kraken plain-text output,
apply digit-guard, and report flag rate.

Usage:
    python -m bonitz_pipeline.compare \\
        --claude  pilot/p15_left_claude.xml \\
        --kraken  pilot/p15_left_kraken.txt \\
        [--gold   pilot/p15_left_gold.txt]
"""

from __future__ import annotations
import argparse
import re
from collections import Counter
from pathlib import Path

from .digit_guard import _parse_bekker_ref, _parse_bekker_kraken_with_hints


# ---------------------------------------------------------------------------
# Text extraction helpers
# ---------------------------------------------------------------------------

def _strip_xml_tags(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)


def _extract_plain(path: Path) -> list[str]:
    raw = path.read_text(encoding='utf-8')
    if path.suffix.lower() in ('.xml', '.html'):
        raw = _strip_xml_tags(raw)
    lines = [ln.strip() for ln in raw.splitlines()]
    return [ln for ln in lines if ln]


# ---------------------------------------------------------------------------
# Column-level CER (edit distance over full joined text)
# ---------------------------------------------------------------------------

def _edit_distance(a: str, b: str) -> int:
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    # Use two-row rolling array to keep memory O(n)
    prev = list(range(n + 1))
    curr = [0] * (n + 1)
    for i in range(1, m + 1):
        curr[0] = i
        for j in range(1, n + 1):
            if a[i-1] == b[j-1]:
                curr[j] = prev[j-1]
            else:
                curr[j] = 1 + min(prev[j-1], prev[j], curr[j-1])
        prev, curr = curr, prev
    return prev[n]


def column_cer(ref_lines: list[str], hyp_lines: list[str]) -> float:
    """CER over the full column as a single concatenated string."""
    ref_text = ' '.join(ref_lines)
    hyp_text = ' '.join(hyp_lines)
    if not ref_text:
        return 0.0
    return _edit_distance(ref_text, hyp_text) / len(ref_text)


# ---------------------------------------------------------------------------
# Column-level Bekker citation extraction
# ---------------------------------------------------------------------------

def _extract_bekker_ref_column(lines: list[str]) -> Counter:
    """Extract all (page, line) pairs from reference (Claude/gold) text."""
    counts: Counter = Counter()
    for ln in lines:
        for pair in _parse_bekker_ref(ln):
            counts[pair] += 1
    return counts


def _extract_bekker_kraken_column(lines: list[str], ref_counter: Counter) -> Counter:
    """Extract all (page, line) pairs from Kraken text, hint-aware."""
    ref_pairs = list(ref_counter.elements())
    counts: Counter = Counter()
    for ln in lines:
        for pair in _parse_bekker_kraken_with_hints(ln, ref_pairs):
            counts[pair] += 1
    return counts


def _bekker_scores(ref: Counter, hyp: Counter) -> tuple[float, float]:
    """Return (recall, precision) as fractions."""
    matched = sum((ref & hyp).values())
    recall    = matched / sum(ref.values())  if ref  else 0.0
    precision = matched / sum(hyp.values()) if hyp else 0.0
    return recall, precision


# ---------------------------------------------------------------------------
# Main comparison
# ---------------------------------------------------------------------------

def run_comparison(
    claude_path: Path,
    kraken_path: Path,
    gold_path: Path | None = None,
) -> None:
    claude_lines = _extract_plain(claude_path)
    kraken_lines = _extract_plain(kraken_path)

    print(f"Claude lines : {len(claude_lines)}")
    print(f"Kraken lines : {len(kraken_lines)}")

    # Column-level CER between Claude and Kraken
    ck_cer = column_cer(claude_lines, kraken_lines)
    print(f"Claude vs Kraken CER : {ck_cer:.3f}  ({ck_cer*100:.1f}%)")

    # Bekker citation comparison: Claude is reference, Kraken is hypothesis
    ref_bekker = _extract_bekker_ref_column(claude_lines)
    kra_bekker = _extract_bekker_kraken_column(kraken_lines, ref_bekker)
    kra_rec, kra_prec = _bekker_scores(ref_bekker, kra_bekker)
    print(f"\n--- Bekker citations (Claude as reference) ---")
    print(f"Claude total citations : {sum(ref_bekker.values())}")
    print(f"Kraken extracted       : {sum(kra_bekker.values())}")
    print(f"Kraken recall          : {kra_rec:.1%}")
    print(f"Kraken precision       : {kra_prec:.1%}")

    if gold_path and gold_path.exists():
        gold_lines = _extract_plain(gold_path)
        print(f"\n--- Gold scoring ---")
        print(f"Gold lines : {len(gold_lines)}")

        cg_cer = column_cer(gold_lines, claude_lines)
        kg_cer = column_cer(gold_lines, kraken_lines)
        print(f"Claude CER vs gold : {cg_cer:.3f}  ({cg_cer*100:.1f}%)")
        print(f"Kraken CER vs gold : {kg_cer:.3f}  ({kg_cer*100:.1f}%)")

        # Bekker recall/precision vs gold as reference
        gold_bekker = _extract_bekker_ref_column(gold_lines)
        cla_bekker  = _extract_bekker_ref_column(claude_lines)
        kra_bekker2 = _extract_bekker_kraken_column(kraken_lines, gold_bekker)

        cla_rec,  cla_prec  = _bekker_scores(gold_bekker, cla_bekker)
        kra_rec2, kra_prec2 = _bekker_scores(gold_bekker, kra_bekker2)

        print(f"\n--- Bekker citations (gold as reference) ---")
        print(f"Gold total    : {sum(gold_bekker.values())}")
        print(f"Claude recall : {cla_rec:.1%}   precision : {cla_prec:.1%}")
        print(f"Kraken recall : {kra_rec2:.1%}   precision : {kra_prec2:.1%}")

        missed_by_claude = sorted(set(gold_bekker) - set(cla_bekker))
        missed_by_kraken = sorted(set(gold_bekker) - set(kra_bekker2))
        both_missed = sorted(set(missed_by_claude) & set(missed_by_kraken))
        if both_missed:
            print(f"\nMissed by both ({len(both_missed)}): {both_missed}")
        only_claude = sorted(set(missed_by_claude) - set(missed_by_kraken))
        only_kraken = sorted(set(missed_by_kraken) - set(missed_by_claude))
        if only_claude:
            print(f"Missed by Claude only ({len(only_claude)}): {only_claude}")
        if only_kraken:
            print(f"Missed by Kraken only ({len(only_kraken)}): {only_kraken}")
    else:
        if gold_path:
            print(f"\n(gold file not found: {gold_path}; skipping gold scoring)")
        else:
            print("\n(no gold file provided; skipping gold scoring)")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Compare Claude vs Kraken pilot transcripts")
    p.add_argument('--claude', required=True, type=Path)
    p.add_argument('--kraken', required=True, type=Path)
    p.add_argument('--gold',   default=None,  type=Path)
    args = p.parse_args(argv)
    run_comparison(args.claude, args.kraken, args.gold)


if __name__ == '__main__':
    main()
