"""
Every citation checked against Bonitz's own list of works.

The index is mostly citations, and a citation is the one thing in it that can
be checked without a lexicon, without a scan, and without asking another
reader: it names a WORK and a BEKKER PAGE, and the pages are disjoint per work.
A siglum that disagrees with the page beside it is a misreading, provably.

That matters because the sweeps are BLIND here.  `smyth_sweep` exempts any
siglum-shaped token — it has to, or `Ζιι` fires every accent rule — and the
exemption is what let `Ζιθ28` through on 2026-08-06 with three readers wrong
and no check firing.  A blanket exemption cannot be repaired with more
exemptions; it needs a positive inventory, which `work/sigla/work-sigla.json`
now is: Bonitz's 48 sigla, transcribed from the printed key on PDF p.14.

    python3 -m bonitz_pipeline.siglum_check
    python3 -m bonitz_pipeline.siglum_check --show 40
    python3 -m bonitz_pipeline.siglum_check --pages 15-52

⚠ THE TRAP THIS MODULE EXISTS TO AVOID.  **A bare book letter inherits the
previous citation's work.**  `Ζιε13. 544a32. ζ1. 558b13` is HA book 6, not the
work ζ; `Ηζ2. 1139b9. ζ4. 1140a19` is EN book 6.  29 of the 40 bare-ζ tokens
are this.  A checker that reads them as the work ζ (περὶ Νεότητος, 467b-470b)
condemns 29 correct citations and buries the real errors under them — which is
worse than no checker, because a report nobody trusts is a report nobody reads.

The resolution needs no heuristics, because **the Bekker page adjudicates**.
`ζ1. 558b13`: the work ζ runs 467b-470b, so 558 cannot be it; the inherited
work Ζι (HA, 486a-638b) contains 558, so that is what it is.  Both readings are
offered to the page number and the page decides.  Where neither fits, that is
the finding.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIGLA = ROOT / 'work/sigla/work-sigla.json'

# Greek alphabetic numerals used for BOOK letters, in order.  ϛ (stigma) is 6;
# ς (final sigma) in that slot is a misreading of it and is deliberately NOT
# accepted here — `πκς` against `πκϛ`×14 is a known reader error.
BOOK_LETTERS = 'αβγδεϛζηθικλμνξοπρστυφχψω'

# METAPHYSICS BOOKS ARE NAMED, NOT NUMBERED.  Bonitz writes ΜΑ, Μα, Μβ … Μν,
# using the alphabet as book NAMES — the tradition's Α, α-ελαττον, Β, Γ … — so
# the book letter after Μ may be upper case where nowhere else it may.  Reading
# `ΜΑ3. 983a32` as an unknown siglum reports the whole Metaphysics as broken.
NAMED_BOOKS = {'Μ'}

# LATIN CAPITALS THAT LOOK LIKE THE GREEK ONES BONITZ USES AS SIGLA.  Ρ and P,
# Η and H, Α and A are different codepoints and identical ink, so a reader
# typing the Latin one produces a citation that is right on the page and wrong
# in the file.  67 of them are in the corpus.  Nothing caught this before,
# because every check either exempts siglum-shaped tokens or folds only Greek:
# a Latin P is not a Greek letter, so it never even looked like a siglum.
HOMOGLYPH = {'A': 'Α', 'B': 'Β', 'E': 'Ε', 'H': 'Η', 'I': 'Ι', 'K': 'Κ',
             'M': 'Μ', 'N': 'Ν', 'O': 'Ο', 'P': 'Ρ', 'T': 'Τ', 'X': 'Χ',
             'Y': 'Υ', 'Z': 'Ζ'}

# A citation: Greek letters, an optional chapter, then a Bekker page, column
# and line.  The Greek run is left whole — splitting work from book is the job
# of `resolve`, which has the page number to help it.
#
# ⚠ THE CHAPTER MUST BE FOLLOWED BY A STOP.  Without that the two number
# groups are free to divide any run of digits between them, and `οβ 1352b8`
# parsed as chapter 13, page 52 — reporting a perfectly good Oeconomica
# citation as out of range. Bonitz always sets the stop: `Πε 11. 1315a3`.
CITE = re.compile(
    r'(?<![Α-Ωα-ω])'
    r'([Α-Ωα-ωϗȣϛABEHIKMNOPTXYZ]{1,4})'   # work siglum and/or book letter
    r'\s?(?:(\d{1,3})\s*\.)?\s*'   # chapter, always with its stop
    r'(\d{2,4})\s?([ab])'          # Bekker page and column
)


@dataclass(frozen=True)
class Work:
    siglum: str
    title: str
    manifest: str
    lo: int          # first Bekker page
    hi: int          # last Bekker page

    def holds(self, page: int) -> bool:
        return self.lo <= page <= self.hi


def _range(bekker: str) -> tuple[int, int]:
    """'436a-449b' -> (436, 449)."""
    a, b = bekker.split('-')
    return int(re.sub(r'\D', '', a)), int(re.sub(r'\D', '', b))


def inventory(path: Path = SIGLA) -> dict[str, Work]:
    """siglum -> Work, with Bonitz's three RANGE entries expanded.

    His key prints `Ααβ` for the two books of the Prior Analytics and `τα-θ`
    for the eight of the Topics.  Those are not sigla; they are shorthand for
    a family, and a citation uses one member of it.
    """
    raw = json.loads(path.read_text(encoding='utf-8'))['works']
    out: dict[str, Work] = {}
    for e in raw:
        sig, note = e['siglum'], (e.get('note') or '')
        if not e.get('bekker'):
            continue                      # `f`, the fragments: no Bekker range
        lo, hi = _range(e['bekker'])
        members = [sig]
        if 'RANGE' in note:
            if '-' in sig:                       # τα-θ  ->  τα τβ … τθ
                left, _, last = sig.partition('-')
                stem, first = left[:-1], left[-1]
                span = BOOK_LETTERS[BOOK_LETTERS.index(first):
                                    BOOK_LETTERS.index(last) + 1]
                # The Topics has EIGHT books lettered α…θ.  Bonitz's book
                # letters are the plain alphabet, not the numeral series, so
                # stigma is not among them — including it would invent a τϛ.
                members = [stem + c for c in span if c != 'ϛ']
            else:                                # Ααβ, Αγδ
                stem, letters = sig[:-2], sig[-2:]
                members = [stem + c for c in letters]
        for m in members:
            out[m] = Work(m, e['title'], e.get('manifest', ''), lo, hi)
    return out


def split(token: str, works: dict[str, Work]) -> list[tuple[str, str]]:
    """Every way to read `token` as (work, book), longest work first.

    Ambiguity is the normal case, not the exception: `ζ` is a work AND a book
    letter, `Ζι` is a work whose citations carry a book letter after it.  So
    this ENUMERATES rather than decides, and `resolve` picks with the page.
    """
    out = []
    for n in range(min(len(token), 4), 0, -1):
        head, tail = token[:n], token[n:]
        if head not in works:
            continue
        ok = all(c in BOOK_LETTERS for c in tail)
        if not ok and head in NAMED_BOOKS:
            ok = all(c.lower() in BOOK_LETTERS for c in tail)
        if not tail or ok:
            out.append((head, tail))
    return out


@dataclass
class Cite:
    col: str
    line: int
    raw: str
    token: str
    chapter: str
    page: int
    column: str
    work: str = ''
    book: str = ''
    how: str = ''        # 'explicit' | 'inherited' | 'unresolved'
    why: str = ''


def resolve(cites: list[Cite], works: dict[str, Work]) -> None:
    """Fill in work/book/how, in reading order, letting the page adjudicate.

    Reading order is what makes inheritance possible at all — a bare book
    letter means "the work I last named" — so this walks the list once and
    carries the last RESOLVED work forward.  An unresolved citation does not
    become the context for the next one; a misreading should not propagate.
    """
    last = ''
    for c in cites:
        options = split(c.token, works)
        # 1. an explicit work whose range contains the page
        fit = [(w, b) for w, b in options if works[w].holds(c.page)]
        if fit:
            c.work, c.book = fit[0]
            c.how = 'explicit'
            last = c.work
            continue
        # 2. the whole token as a book letter of the work last named
        if last and all(ch in BOOK_LETTERS for ch in c.token):
            if works[last].holds(c.page):
                c.work, c.book, c.how = last, c.token, 'inherited'
                continue
            c.how, c.why = 'unresolved', (
                f'reads as book {c.token} of {last} (the work last named), '
                f'but {c.page} is outside {last} '
                f'({works[last].lo}-{works[last].hi})')
            continue
        # 3. named a work, but the page is not in it — the Ζιθ28 class
        if options:
            w = options[0][0]
            c.work, c.how = w, 'unresolved'
            c.why = (f'{w} is {works[w].title} at {works[w].lo}-{works[w].hi}, '
                     f'and the page beside it is {c.page}')
            continue
        greek = ''.join(HOMOGLYPH.get(ch, ch) for ch in c.token)
        if greek != c.token and split(greek, works):
            c.work = split(greek, works)[0][0]
            c.how, c.why = 'latin', (
                f'{c.token!r} is written with LATIN letters where the siglum '
                f'is Greek — it should be {greek!r}. Identical ink, different '
                f'codepoints; the citation is right on the page and wrong in '
                f'the file.')
            last = c.work
            continue
        c.how, c.why = 'unresolved', f'{c.token!r} is not one of Bonitz\'s sigla'


def read(pages: range | None = None) -> list[Cite]:
    out = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        n = int(f.stem.split('-')[1])
        if pages is not None and n not in pages:
            continue
        for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            for m in CITE.finditer(line):
                tok, chap, page, col = m.groups()
                out.append(Cite(f.stem, i, m.group(0), tok, chap,
                                int(page), col))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--show', type=int, default=25)
    p.add_argument('--pages', default='')
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/siglum-check.tsv')
    args = p.parse_args(argv)

    rng = None
    if args.pages:
        a, _, b = args.pages.partition('-')
        rng = range(int(a), int(b or a) + 1)

    works = inventory()
    cites = read(rng)
    resolve(cites, works)

    tally = Counter(c.how for c in cites)
    bad = [c for c in cites if c.how == 'unresolved']

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w', encoding='utf-8') as fh:
        fh.write('column\tline\tcitation\ttoken\tpage\twhy\n')
        for c in bad:
            fh.write(f'{c.col}\t{c.line}\t{c.raw}\t{c.token}\t{c.page}\t'
                     f'{c.why}\n')

    print(f'{len(works)} sigla, {len(cites)} citations')
    for k, v in tally.most_common():
        print(f'  {v:5d}  {k}')
    print(f'\n-> {args.out}')
    if bad:
        print(f'\n{len(bad)} citations that do not resolve:')
        for c in bad[:args.show]:
            print(f'  {c.col}:{c.line:<4} {c.raw!r}')
            print(f'      {c.why}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
