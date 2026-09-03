"""
Bekker-range check.

Every citation in the index names a work and a Bekker page. The pages are
disjoint per work, so a siglum that disagrees with the page number beside it
is a misreading — provable without the scan, without a lexicon, and without
asking any reader. This caught ten bad Ζμ/Ζυ sigla on pages 47-51 that were
in fact Ζιι (HA book ι); the reader wrote Ζμ, which is De partibus at
639-697, beside page numbers in the 600s that are Historia animalium.

  python3 -m bonitz_pipeline.bekker --pages 15-51
  python3 -m bonitz_pipeline.bekker --pages 15-51 --unknown

TWO CHECKS, AND ONLY ONE OF THEM IS TRUSTWORTHY YET.

--impossible (default) needs no table at all: nothing in the corpus, the
fragments included, runs past Bekker 1590, so a larger page is wrong whatever
the siglum names. It finds exactly the two known compositor errors on pages
15-51 (Ηε10. 1835b for 1135, Πζ5. 1820a for 1320) and nothing else.

--ranges is OFF by default, still, but for a new reason. The table is no
longer guessed: it is derived from `work/sigla/work-sigla.json`, Bonitz's own
printed key, transcribed and verified against the 400 dpi scan (the guessed
2026-07-25 table folded μχ, μν and πν into μ and manufactured 103 false
contradictions). What remains exploratory is THIS MODULE'S READING of the
siglum: longest-prefix with no inheritance. A bare book letter inherits the
previous citation's work — `ζ1. 558b13` is HA book 6, not the work ζ — and
this check reads it as the work and condemns a correct citation. That
resolution lives in `siglum_check.resolve`, which is the real range gate;
--ranges here stays a coarse cross-check.
"""

from __future__ import annotations
import argparse
import collections
import json
import re
from pathlib import Path

from .batch3 import ROOT, parse_pages
from .normalize import corpus_column, corpus_columns
from .lexcheck import nfc
from .siglum_check import SIGLA, inventory


def load_works(path: Path = SIGLA) -> dict[str, tuple[int, int]]:
    """siglum -> (first Bekker page, last), from Bonitz's own printed key.

    `siglum_check.inventory` does the derivation (and expands his three RANGE
    entries, Ααβ/Αγδ/τα-θ); this wrapper adds two things it does not do:

    - COLLIDING SIGLA MUST AGREE. `ζ` is printed twice — περὶ Ζωῆς and περὶ
      Νεότητος, one treatise under two titles, both 467b-470b. `inventory`
      keeps whichever row comes last, silently; here a duplicate siglum whose
      spans differ raises instead of taking either.
    - THE FRAGMENTS ARE EXCLUDED, EXPLICITLY. `f` has no Bekker span (the
      fragments are cited by fragment number), so an f citation CANNOT be
      range-checked and is left out of the table. CITE's siglum class is
      Greek-only and never matches Latin `f`, so none reaches the range check
      anyway; the --impossible bound (> 1590) still covers every citation,
      fragment pages included — Bonitz cites f pages like 1562b, and those
      must stay legal.

    Private tooling: a missing file or a malformed row raises. No fallback
    table — a guessed table manufactures false errors.
    """
    rows = json.loads(path.read_text(encoding='utf-8'))['works']
    seen: dict[str, str] = {}
    for row in rows:
        sig = row['siglum']              # a row without one is malformed: raise
        span = row.get('bekker')
        if span in (None, '—'):
            continue                     # `f`, the fragments — see above
        if sig in seen and seen[sig] != span:
            raise ValueError(
                f'work-sigla.json: siglum {sig!r} appears twice with '
                f'DIFFERENT spans, {seen[sig]!r} vs {span!r} — the key is '
                f'wrong or misread; refusing to pick one')
        seen[sig] = span
    return {s: (w.lo, w.hi) for s, w in inventory(path).items()}


# Longest prefix wins, so πο (Poetica) is tried before π (Problemata), and
# μν (De memoria) before μ (Meteorologica).
WORKS: dict[str, tuple[int, int]] = load_works()
PREFIXES = sorted(WORKS, key=len, reverse=True)

# <siglum><book/chapter letters and digits>. <page><column>  e.g. Ζμδ10. 688a3
#
# ⚠ THE PERIOD AFTER THE BOOK NUMBER IS LOAD-BEARING. With `(\d{0,3})\.?` the
# separator was optional, so the book-number group ate the leading digits of
# any four-digit Bekker page that lacked one: `οβ 1352b8` resolved to 52b,
# `1306a31` to 06a, `1183b8` to 83b. Every citation above Bekker 1000 without
# a `<book>.` in front of it was validated against the wrong page — and this is
# the check that reported "0 impossible pages". Requiring the period makes the
# page group take every digit that belongs to it. Same fix as quotecheck.
CITE = re.compile(
    r'([Α-Ωα-ωϗȣ]{1,3})[α-ω]{0,2}\s?(?:(\d{1,3})[.,]\s*)?(\d{2,4})\s?([ab])')
IMPOSSIBLE = 1590  # nothing in the corpus, fragments included, runs past this

# ⚠ THE BOUND HAS TO SEE LATIN SIGLA, AND FOR YEARS IT DID NOT. `CITE`'s siglum
# class is Greek-only, so a fragment citation — `f. 596. 1595b25`, `f65.
# 1486b28` — never matched it at all. This module's own docstring said the
# impossible bound "still covers every citation, fragment pages included"; it
# covered NONE of the 333 fragment citations in the corpus, and one of them,
# page-077-L:13, is out of range. John noticed the gap from the outside, asking
# why so few impossible numbers had turned up.
#
# Only the >1590 bound applies here, never the range check. Fragments carry no
# Bekker span of their own to be checked against, which is exactly why `f` is
# kept out of the works table — see `load_works`. Claiming more would
# manufacture false errors across all 333.
FRAGMENT = re.compile(r'\bf\.? ?\d{1,3}[a-z]?\.?\s*(\d{3,4})\s?[ab]\d')


def work_of(siglum: str) -> str | None:
    for p in PREFIXES:
        if siglum.startswith(p):
            return p
    return None


def scan(page: int, col: str, ranges: bool = False) -> tuple[list[dict], collections.Counter]:
    path = corpus_column(page, col, required=False)
    if path is None:
        return [], collections.Counter()
    bad, unknown = [], collections.Counter()
    for i, line in enumerate(nfc(path.read_text(encoding='utf-8')).splitlines(), 1):
        for m in FRAGMENT.finditer(line):
            bpage = int(m.group(1))
            if bpage > IMPOSSIBLE:
                bad.append({'page': page, 'col': col, 'line': i,
                            'cite': m.group(0).strip(), 'siglum': 'f',
                            'work': None, 'range': None, 'bekker': bpage,
                            'fits': [], 'impossible': True,
                            'context': line.strip()[:110]})
        for m in CITE.finditer(line):
            siglum, _, bekker, _ = m.groups()
            bpage = int(bekker)
            if bpage > IMPOSSIBLE:
                bad.append({'page': page, 'col': col, 'line': i,
                            'cite': m.group(0).strip(), 'siglum': siglum,
                            'work': None, 'range': None, 'bekker': bpage,
                            'fits': [], 'impossible': True,
                            'context': line.strip()[:110]})
                continue
            if not ranges:
                continue
            w = work_of(siglum)
            if w is None:
                unknown[siglum] += 1
                continue
            lo, hi = WORKS[w]
            if lo <= bpage <= hi:
                continue
            fits = [k for k, (a, b) in WORKS.items() if a <= bpage <= b]
            bad.append({'page': page, 'col': col, 'line': i,
                        'cite': m.group(0).strip(), 'siglum': siglum,
                        'work': w, 'range': (lo, hi), 'bekker': bpage,
                        'fits': sorted(set(fits)),
                        'impossible': bpage > IMPOSSIBLE,
                        'context': line.strip()[:110]})
    return bad, unknown


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--ranges', action='store_true',
                    help='also check siglum vs page range (GUESSED TABLE)')
    ap.add_argument('--unknown', action='store_true',
                    help='list sigla missing from the table instead')
    args = ap.parse_args()
    pages = parse_pages(args.pages)
    # ⚠ A PAGE IN NO CORPUS STAGE IS NOT A CLEAN PAGE. `scan` looks up
    # its column with required=False and answers [] when there is none,
    # so asking for a page that was never transcribed printed a zero and
    # looked exactly like a page with no defects. This is the residue of
    # the 2026-08-10 five-gate fix: they can SEE reconciled-auto now, but
    # total absence still read as cleanliness. Validate the REQUEST here,
    # once, where the user says which pages they mean.
    corpus_columns(pages)
    allbad, allunknown, n = [], collections.Counter(), 0
    for p in pages:
        for col in ('L', 'R'):
            bad, unk = scan(p, col, args.ranges)
            allbad += bad
            allunknown += unk
            n += len(bad) + sum(unk.values())
    if args.unknown:
        for s, c in allunknown.most_common(40):
            print(f'  {s:6} {c:5} unchecked')
        print(f'{len(allunknown)} sigla not in the table, '
              f'{sum(allunknown.values())} citations unchecked')
        return
    for b in allbad:
        if b['impossible']:
            print(f"  page-{b['page']:03d}-{b['col']}:{b['line']:<3} "
                  f"{b['cite']:18} beyond Bekker {IMPOSSIBLE} — impossible")
        else:
            fits = ', '.join(b['fits']) or 'no work'
            print(f"  page-{b['page']:03d}-{b['col']}:{b['line']:<3} {b['cite']:18} "
                  f"{b['siglum']} is {b['range'][0]}-{b['range'][1]}; page fits {fits}")
    n_imp = sum(1 for b in allbad if b['impossible'])
    print(f'{n_imp} impossible pages' + (
        f", {len(allbad) - n_imp} siglum/range contradictions "
        f"({sum(allunknown.values())} unchecked)" if args.ranges else ''))


if __name__ == '__main__':
    main()
