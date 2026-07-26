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

--ranges is OFF by default because the table below is guessed, and a guessed
table manufactures false errors — which is worse than no check. Longest-prefix
matching folded μχ (Mechanica), μν (De memoria) and πν (De spiritu) into μ
(Meteorologica) and reported 103 contradictions, nearly all of them mine
rather than Bonitz's. The real abbreviation key is printed in the volume, on
PDF page 14; until it is transcribed, treat --ranges as exploratory.
"""

from __future__ import annotations
import argparse
import collections
import re
from pathlib import Path

from .batch3 import ROOT, parse_pages
from .lexcheck import nfc

# Bonitz's siglum -> (first Bekker page, last). Longest prefix wins, so πο
# (Poetica) is tried before π (Problemata), and Ζιι before Ζι.
WORKS: dict[str, tuple[int, int]] = {
    'Ζιι': (486, 638),   # Historia animalium, book ι
    'Ζι':  (486, 638),   # Historia animalium
    'Ζμ':  (639, 697),   # De partibus animalium
    'Ζκ':  (698, 714),   # De motu / De incessu animalium
    'Ζγ':  (715, 789),   # De generatione animalium
    'Φ':   (184, 267),   # Physica
    'Ο':   (268, 313),   # De caelo
    'Γ':   (314, 338),   # De generatione et corruptione
    'μ':   (338, 390),   # Meteorologica
    'κ':   (391, 401),   # De mundo
    'ψ':   (402, 435),   # De anima
    'αι':  (436, 449),   # De sensu
    'Μ':   (980, 1093),  # Metaphysica
    'Η':   (1094, 1181), # Ethica Nicomachea
    'ημ':  (1181, 1213), # Magna moralia
    'ηε':  (1214, 1249), # Ethica Eudemia
    'Π':   (1252, 1342), # Politica
    'Ρ':   (1354, 1420), # Rhetorica
    'ρ':   (1420, 1447), # Rhetorica ad Alexandrum
    'πο':  (1447, 1462), # Poetica
    'χ':   (791, 799),   # De coloribus
    'θ':   (830, 847),   # Mirabilia
    'π':   (859, 967),   # Problemata
}
PREFIXES = sorted(WORKS, key=len, reverse=True)

# <siglum><book/chapter letters and digits>. <page><column>  e.g. Ζμδ10. 688a3
CITE = re.compile(r'([Α-Ωα-ωϗȣ]{1,3})[α-ω]{0,2}\s?(\d{0,3})\.?\s*(\d{2,4})\s?([ab])')
IMPOSSIBLE = 1590  # nothing in the corpus, fragments included, runs past this


def work_of(siglum: str) -> str | None:
    for p in PREFIXES:
        if siglum.startswith(p):
            return p
    return None


def scan(page: int, col: str, ranges: bool = False) -> tuple[list[dict], collections.Counter]:
    path = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    if not path.exists():
        return [], collections.Counter()
    bad, unknown = [], collections.Counter()
    for i, line in enumerate(nfc(path.read_text(encoding='utf-8')).splitlines(), 1):
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
    allbad, allunknown, n = [], collections.Counter(), 0
    for p in parse_pages(args.pages):
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
