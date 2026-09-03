"""
Line check (validator B2) — does the cited line number exist on the cited page?

  python3 -m bonitz_pipeline.linecheck
  python3 -m bonitz_pipeline.linecheck --reconciled work/reconciled --out work/sweeps/linecheck.tsv

Design: docs/sweep-validators-next.md §B2.

`Ζιε13. 544a32` asserts Bekker page 544, column a, line 32. If the corpus's
column 544a ends at line 30, the citation is impossible — a digit error in
exactly the place OCR digit errors do the most harm. Nothing else checks
this: bekker.py never captures the line number, and quotecheck captures it
but silently `continue`s when the cited line's window is empty, so the
impossible address is the one case it structurally cannot report.

Fuzz, demoted to a tier: corpus columns are contiguous, so the only possible
misses are cites past the column's ends — and a cite 1–2 past the end is
exactly the tail slip this check was built to catch (544a32 against a column
ending at 30). Forgiving that band would forgive the motivating case. So it
is not forgiven and not condemned: a cited line absent from its column but
within ±2 of the column's ends is tier `tail`, written to the TSV and counted
in the summary — visible, so the drift rate can be measured and the rule
tightened (the design doc's "start strict-report, measure, tighten"). Beyond
±2 is tier `finding`. Both row kinds carry the column's actual line range.

A finder, never a fixer: findings become cards; the diplomatic rule holds
(a "wrong" address may be exactly what the printer set — see the three
adjudicated printed citation errors in quotecheck.ADJUDICATED).

⚠ VOLUME AS WELL AS VERDICT. A check that can answer "nothing" without
distinguishing *found nothing* from *never looked* repeats the defect fixed
four times already. So: an empty reconciled glob raises; an empty corpus
raises (load_corpus's own guard); a column the corpus does not hold is
reported as skipped `no-corpus` — expected for the 8 works with no Greek
text — never as clean; a double-recension seam column (quotecheck's
exclusion: our 247b stops at line 19 in an edition Bonitz was not citing,
so "line absent" there measures the edition, not the ink) is skipped
`seam`; and a citation-shaped reference without a line number (`544a.`,
Bonitz citing the page) is counted `unparseable`, because this check has
no line to check — UNLESS the line number merely wrapped: a page-cite at
end-of-line whose next line opens with `1.` (page-051-L's `θ20. 832 a` /
`1. eorum…`) is one citation, joined and checked like any other. The
summary states every one of these volumes, and parsed = checked + skipped
by construction.
"""

from __future__ import annotations
import argparse
import collections
import re
import sys
from pathlib import Path

from .batch3 import ROOT
from .lexcheck import nfc
from .quotecheck import CITE_RE, load_corpus

FUZZ = 2  # ±2 lines, per the design doc — editions drift a line or two

# A citation-shaped page reference WITHOUT a line number: `544a.` or
# `1305 b,` — a real Bonitz habit (citing the page), not an OCR defect,
# but this check has no line to test, so it is counted, not checked.
# CITE_RE cannot match here (it requires the trailing line digits), and
# this pattern cannot match inside a CITE_RE hit (the lookahead refuses
# a following digit), so the two counters never double-count a span.
PAGE_CITE = re.compile(r'(?<![0-9])(\d{2,4})\s?([ab])(?![0-9A-Za-zΑ-Ωα-ωἀ-῿])')

# A citation wrapped at the line break: `θ20. 832 a` ends one line and
# `1. eorum…` begins the next (page-051-L, the real shape). CITE_RE cannot
# see it — it allows no whitespace between the column letter and the line
# digits — so a PAGE_CITE at end-of-line whose NEXT line opens with
# `\d{1,3}.` is joined into one citation and checked, not counted
# `unparseable`. Anchored at the PAGE_CITE's end via .match(text, pos).
WRAP_LINE = re.compile(r'[ \t]*\n(\d{1,3})[.,]')

# The siglum preceding a wrapped page-cite — CITE_RE group 1's shape,
# anchored to the end of the text before the cite. For the no-corpus tally.
SIGLUM_BEFORE = re.compile(r'([Α-Ωα-ω]{0,3}[α-ω]?)\s?(?:\d{1,3}[.,]\s*)?$')

TSV_HEADER = 'source\tcite\tcolumn\tline\ttier\tcorpus_lines\n'


def check(text: str, source: str,
          cols: dict[str, dict[int, list[str]]],
          excluded: set[str]) -> tuple[list[dict], collections.Counter]:
    """Scan one reconciled column's text for impossible line numbers.

    Returns (rows, counts). Rows are the reportable states only —
    tier `finding`, `tail`, `no-corpus`, or `seam`; a citation whose line
    exists in its column passes and is only counted. A cited line absent
    but within ±FUZZ of the column's ends is tier `tail` (measured, not
    forgiven); further out is tier `finding`.
    counts['parsed'] == counts['checked'] + the three skip reasons, always.
    """
    text = nfc(text)
    rows: list[dict] = []
    counts: collections.Counter = collections.Counter()
    cites: list[tuple[int, str, str, int, str]] = []
    for m in CITE_RE.finditer(text):
        cites.append((m.start(), m.group(0).strip(),
                      f'{m.group(2)}{m.group(3)}', int(m.group(4)),
                      # the letters of the siglum group, for the no-corpus tally
                      re.sub(r'[^Α-Ωα-ωϗȣȢ]', '', m.group(1)) or '—'))
    for m in PAGE_CITE.finditer(text):
        wrap = WRAP_LINE.match(text, m.end())
        if wrap is None:
            # a genuine page-only cite: no line number anywhere to check
            counts['parsed'] += 1
            counts['unparseable'] += 1
            continue
        # the line number wrapped to the next printed line: one citation
        sig = SIGLUM_BEFORE.search(text[:m.start()])
        cites.append((m.start(),
                      f'{m.group(0).strip()} {wrap.group(1)}',
                      f'{m.group(1)}{m.group(2)}', int(wrap.group(1)),
                      (sig.group(1) if sig else '') or '—'))
    for start, cite, cid, line, siglum in sorted(cites):
        counts['parsed'] += 1
        rec = {
            # the source line the cite STARTS on, even when it wraps
            'source': f"{source}:{text.count(chr(10), 0, start) + 1}",
            # a cite matched across a line break carries the newline:
            # flatten it, or its TSV row splits in two
            'cite': re.sub(r'\s+', ' ', cite), 'column': cid, 'line': line,
            'siglum': siglum, 'corpus_lines': '',
        }
        if cid in excluded:
            counts['seam'] += 1
            rec['tier'] = 'seam'
            rows.append(rec)
            continue
        lines = cols.get(cid)
        if lines is None:
            counts['no-corpus'] += 1
            rec['tier'] = 'no-corpus'
            rows.append(rec)
            continue
        counts['checked'] += 1
        if line in lines:
            continue                     # the cited line exists
        lo, hi = min(lines), max(lines)
        rec['corpus_lines'] = f'{lo}-{hi}'
        if hi < line <= hi + FUZZ or lo - FUZZ <= line < lo:
            # 1-2 past a column end: editions drift ("tick pegs to line
            # bulk"), but this band is also where OCR tail slips live —
            # so it is measured under its own tier, never folded into clean
            counts['tail'] += 1
            rec['tier'] = 'tail'
        else:
            counts['finding'] += 1
            rec['tier'] = 'finding'
        rows.append(rec)
    return rows, counts


def run(files: list[Path],
        index: tuple[dict, set]) -> tuple[list[dict], collections.Counter]:
    """Every reconciled column through check(), volumes summed."""
    cols, excluded = index
    rows: list[dict] = []
    counts: collections.Counter = collections.Counter()
    for f in files:
        r, c = check(f.read_text(encoding='utf-8'), f.stem, cols, excluded)
        rows += r
        counts += c
    return rows, counts


def write_tsv(rows: list[dict], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as fh:
        fh.write(TSV_HEADER)
        for r in rows:
            fh.write(f"{r['source']}\t{r['cite']}\t{r['column']}\t"
                     f"{r['line']}\t{r['tier']}\t{r['corpus_lines']}\n")


def summary(counts: collections.Counter, rows: list[dict]) -> str:
    """The volume report. Every skip reason states its count; the no-corpus
    line also says how many distinct sigla and columns it covers, so the
    8 Greek-less works are visible as themselves, not as silence."""
    skipped = counts['no-corpus'] + counts['seam'] + counts['unparseable']
    nc = [r for r in rows if r['tier'] == 'no-corpus']
    sigla = {r['siglum'] for r in nc}
    ncols = {r['column'] for r in nc}
    return (
        f"{counts['parsed']} citations parsed: "
        f"{counts['checked']} checked, {skipped} skipped\n"
        f"  skipped no-corpus:    {counts['no-corpus']:5d}  "
        f"({len(sigla)} distinct sigla, {len(ncols)} columns not in the corpus)\n"
        f"  skipped seam:         {counts['seam']:5d}  "
        f"(double-recension columns — the edition differs, not the ink)\n"
        f"  skipped unparseable:  {counts['unparseable']:5d}  "
        f"(page cited without a line number)\n"
        f"{counts['tail']} tail (cited line 1-{FUZZ} past a column end — "
        f"measured, not folded into clean)\n"
        f"{counts['finding']} findings "
        f"(cited line absent and beyond the ±{FUZZ} tail band)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--reconciled', type=Path, default=ROOT / 'work/reconciled',
                    help='directory of reconciled column .txt files')
    ap.add_argument('--out', type=Path, default=ROOT / 'work/sweeps/linecheck.tsv')
    args = ap.parse_args(argv)

    files = sorted(args.reconciled.glob('*.txt'))
    if not files:
        # ⚠ An empty scan reported as clean is the defect this pipeline has
        # fixed four times. No columns means we never looked: raise.
        raise SystemExit(f'no reconciled columns match {args.reconciled}/*.txt '
                         '— refusing to report an empty scan')
    index = load_corpus()                # raises if the corpus glob is empty
    rows, counts = run(files, index)
    write_tsv(rows, args.out)
    for r in rows:
        if r['tier'] in ('finding', 'tail'):
            print(f"  {r['tier']:8} {r['source']:15} {r['cite']:18} "
                  f"column {r['column']} has lines {r['corpus_lines']}, "
                  f"no line {r['line']}")
    print(summary(counts, rows))
    print(f'-> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
