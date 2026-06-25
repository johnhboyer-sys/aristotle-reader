"""
Digit-guard normalization for aligning Claude vs. Kraken citation strings.

Problem: sophokle1v3soph consistently misreads Bonitz's Bekker column-letter
superscripts (a/b) as spurious digits.  Examples (gold → Kraken):
  1456b27 → 1456227   (b → 22)
  1458a12 → 1458 412  (a → 4)
  1022b32 → 102232    (b → 0, merged)
  964a11  → 964 211   (a → 2)
  277b19  → 277219    (b → 2)
  1426b32 → 1426 932  (b → 9)

Strategy: extract Bekker citations as (page, line) integer pairs from each
line, then compare those pairs.  On the reference (Claude) side use a strict
regex that requires the column letter; on the Kraken side use a looser
heuristic that accepts the corrupted form.  A real page-number or line-number
mismatch still flags; the a/b → digit artifact does not.
"""

from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Optional


# --- Reference-side (Claude / gold): strict Bekker pattern ------------------
# Matches: NNNN[ab]NN or NNN[ab]NN  (3-4 digit page, column letter, 1-2 digit line)
# Column letters: Latin a/b, Greek α/β (U+03B1/U+03B2), Unicode superscripts ᵃᵇ
# Bonitz uses both Latin and Greek forms as superscript column letters.
_BEKKER_REF_RE = re.compile(r'(\d{3,4})\s*[abαβᵃᵇ]\s*(\d{1,2})(?!\d)')

# --- Kraken-side: corrupted Bekker pattern ----------------------------------
# After a 3-4 digit page number there may be 0-2 spurious digits (the
# misread column letter), then the 1-2 digit line number.
# We use a heuristic: find runs of 3+ consecutive digits and try to split
# them into (page, spurious, line) where page is 3-4 digits and line is 1-2.
_LONG_DIGIT_RE = re.compile(r'\d{4,7}')
_DIGIT_RUN_RE  = re.compile(r'\d+')


def _parse_bekker_ref(text: str) -> list[tuple[int, int]]:
    """Extract (page, line) pairs from a reference-side line (strict)."""
    return [(int(m.group(1)), int(m.group(2)))
            for m in _BEKKER_REF_RE.finditer(text)]


def _try_split_kraken_run(run: str, ref_pages: set[int]) -> Optional[tuple[int, int]]:
    """
    Given a long digit run from Kraken (4-7 chars), try to parse it as
    PAGE + [0-2 spurious] + LINE where PAGE is in ref_pages.
    Returns (page, line) on success, None otherwise.
    """
    for page_len in (4, 3):
        if len(run) <= page_len:
            continue
        page = int(run[:page_len])
        if page not in ref_pages:
            continue
        rest = run[page_len:]          # [0-2 spurious] + line digits
        for line_len in (2, 1):
            if len(rest) >= line_len:
                line = int(rest[-line_len:])  # take last 1-2 digits as line
                return (page, line)
    return None


def _parse_bekker_kraken(text: str, ref_pages: set[int]) -> list[tuple[int, int]]:
    """
    Extract (page, line) pairs from a Kraken-side line.
    First try the strict pattern (sometimes Kraken gets it right).
    Then fall back to two corruption-form heuristics:
      (a) Long single run: PPPP[spurious]LL — e.g. 1456227 or 102232
      (b) Space-split pair: PPPP [spurious]LL — e.g. "1458 412" or "1426 932"
    """
    # Strict match first (occasionally works)
    pairs = _parse_bekker_ref(text)
    if pairs:
        return pairs

    # Collect all (run_string, start, end) tuples
    all_runs = [(m.group(), m.start(), m.end()) for m in _DIGIT_RUN_RE.finditer(text)]

    result: list[tuple[int, int]] = []
    used: set[int] = set()

    for i, (run, start, end) in enumerate(all_runs):
        if i in used:
            continue

        # Case (a): long fused run (≥5 digits) containing page + spurious + line
        if len(run) >= 5:
            parsed = _try_split_kraken_run(run, ref_pages)
            if parsed:
                result.append(parsed)
                used.add(i)
                continue

        # Case (b): this run is a page number, and the next run (close by)
        # contains the spurious digit(s) + line number
        if len(run) in (3, 4) and int(run) in ref_pages and i + 1 < len(all_runs):
            next_run, next_start, next_end = all_runs[i + 1]
            gap = next_start - end
            if gap <= 3 and 2 <= len(next_run) <= 3:
                # last 1-2 digits of next_run = line number
                for line_len in (2, 1):
                    line = int(next_run[-line_len:])
                    result.append((int(run), line))
                    used.add(i)
                    used.add(i + 1)
                    break
                continue

    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class FlagResult:
    line_idx: int
    ref_line: str
    ver_line: str
    reason: str
    ref_pairs: list[tuple[int, int]]
    ver_pairs: list[tuple[int, int]]


def _parse_bekker_kraken_with_hints(
    text: str, ref_pairs: list[tuple[int, int]]
) -> list[tuple[int, int]]:
    """
    Extract Bekker (page, line) pairs from a Kraken-side line, using the
    expected pairs from the reference (Claude/gold) to resolve ambiguities.

    Two passes:
    1. Strict: collect all pairs matching the exact `PAGE[col_letter]LINE`
       pattern (Kraken sometimes gets the column letter right, or the image
       has an unambiguous superscript).
    2. Heuristic: for digit runs NOT already covered by a strict match, apply
       the corruption heuristics (fused run or space-split pair).
    """
    ref_pages = {p for p, _ in ref_pairs}
    ref_set   = set(ref_pairs)

    # Pass 1: strict matches, recording which character positions they cover
    strict_pairs: list[tuple[int, int]] = []
    covered_starts: set[int] = set()   # digit-run start positions already used
    for m in _BEKKER_REF_RE.finditer(text):
        strict_pairs.append((int(m.group(1)), int(m.group(2))))
        # Mark the page-number run start so the heuristic skips it
        covered_starts.add(m.start())

    # Pass 2: heuristic over remaining digit runs
    all_runs = [(m.group(), m.start(), m.end()) for m in _DIGIT_RUN_RE.finditer(text)]
    heuristic_pairs: list[tuple[int, int]] = []
    used: set[int] = set()

    for i, (run, start, end) in enumerate(all_runs):
        if i in used or start in covered_starts:
            continue

        # Case (a): long fused run (≥5 digits)
        if len(run) >= 5:
            parsed = _try_split_kraken_run(run, ref_pages)
            if parsed:
                page = parsed[0]
                rest_str = run[len(str(page)):]
                for ll in (1, 2):
                    candidate = (page, int(rest_str[-ll:]))
                    if candidate in ref_set:
                        heuristic_pairs.append(candidate)
                        break
                else:
                    heuristic_pairs.append(parsed)
                used.add(i)
                continue

        # Case (b): space-split pair  PAGE_RUN [SPURIOUS+]LINE_RUN
        if len(run) in (3, 4) and int(run) in ref_pages and i + 1 < len(all_runs):
            next_run, next_start, next_end = all_runs[i + 1]
            if next_start in covered_starts:
                continue
            gap = next_start - end
            if gap <= 3 and 2 <= len(next_run) <= 3:
                page = int(run)
                for ll in (1, 2):
                    candidate = (page, int(next_run[-ll:]))
                    if candidate in ref_set:
                        heuristic_pairs.append(candidate)
                        used.add(i)
                        used.add(i + 1)
                        break
                else:
                    heuristic_pairs.append((page, int(next_run[-2:])))
                    used.add(i)
                    used.add(i + 1)
                continue

    return strict_pairs + heuristic_pairs


def flag_digit_mismatches(
    aligned: list[tuple[str, str]],
) -> list[FlagResult]:
    """
    Given a list of (ref_line, ver_line) pairs from align_lines(),
    return flag records where the Bekker (page, line) pairs differ.

    ref = Claude structured markup (or gold); ver = Kraken.
    Uses ref_pairs as hints to resolve 1-digit line-number ambiguity in Kraken.
    """
    flags: list[FlagResult] = []
    for idx, (ref, ver) in enumerate(aligned):
        ref_pairs = _parse_bekker_ref(ref)
        if not ref_pairs:
            continue  # line has no Bekker citations; nothing to check
        ver_pairs = _parse_bekker_kraken_with_hints(ver, ref_pairs)
        if ref_pairs != ver_pairs:
            flags.append(FlagResult(
                line_idx=idx,
                ref_line=ref,
                ver_line=ver,
                reason='bekker_mismatch',
                ref_pairs=ref_pairs,
                ver_pairs=ver_pairs,
            ))
    return flags


def validate_normalization(examples: Optional[list[tuple[str, str]]] = None) -> None:
    """
    Smoke-test against known gold→Kraken pairs from the spec.
    Each tuple is (gold_text_with_citation, kraken_text).
    After normalization the Bekker pairs should match.
    """
    known = examples or [
        # (gold,            kraken)
        ('Oa 8. 1456b27.', 'Oa 8. 1456227.'),
        ('πο 21. 1458a12.', 'πο 21. 1458 412.'),
        ('Μα 22. 1022b32,', 'Μα 22. 102232,'),
        ('πλδ 7. 964a11.',  'πλδ 7. 964 211.'),
        ('Oα 8. 277b19.',   'Oα 8. 277219.'),
        ('ρ 5. 1426b32.',   'ρ 5. 1426 932.'),
    ]
    all_ok = True
    for gold_text, kraken_text in known:
        ref_p = _parse_bekker_ref(gold_text)
        ref_pages = {p for p, _ in ref_p}
        ver_p = _parse_bekker_kraken(kraken_text, ref_pages)
        ok = ref_p == ver_p
        if not ok:
            all_ok = False
        status = 'OK  ' if ok else 'FAIL'
        print(f"  {status}  gold={gold_text!r:30s}  kraken={kraken_text!r:30s}")
        if not ok:
            print(f"        ref_pairs={ref_p}  ver_pairs={ver_p}")
    if all_ok:
        print("All normalization checks passed.")
    else:
        raise AssertionError("Some normalization checks failed — see above.")


if __name__ == '__main__':
    print("Digit-guard normalization validation:")
    validate_normalization()
