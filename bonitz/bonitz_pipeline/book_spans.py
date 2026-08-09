"""Where each BOOK of each work runs, derived from our own corpus.

`siglum_check` knows where a WORK runs and stops there, so `Μδ2. 1031b26` passes
— 1031b is inside the Metaphysics, and that is all it can see.  But 1031b is book
Ζ, not Δ, and Bonitz's own book letter says otherwise.  Twenty-odd citations in
the index are wrong at that level and invisible at this one.

The reason it was not built earlier is that per-book Bekker spans are reference
data, and inventing 48 works' worth of it is exactly the failure this pipeline
keeps having to avoid.  It turns out not to need inventing: `build/dist` already
carries the corpus split by book with its Bekker columns, verified and shipped.
This module reads the spans off that and writes them down with their provenance.

    python3 -m bonitz_pipeline.book_spans            # regenerate the table
    python3 -m bonitz_pipeline.book_spans --check    # report the mismatches

⚠ BONITZ USES THREE LETTERING SYSTEMS, AND THEY DISAGREE FROM BOOK 6 ON.  This
was settled by measurement, not assumption — each system scored against every
book letter in the corpus:

    PLAIN ALPHABET   α β γ δ ε ζ η θ ι κ …  for every ordinary work.
                     Physics 65/65, De caelo 43/43, Meteor. 53/53, De an. 35/35,
                     De gen. et corr. 21/21, Hist. an. 122/127, EN 91/97.
    ITS OWN SERIES   ΜΑ Μα Μβ Μγ … Μν       for the Metaphysics alone, whose
                     books are NAMED — 100/108, against 10/97 for plain.
    GREEK NUMERALS   with stigma at 6       for the Problemata alone, which has
                     38 books and cannot letter that far: πκϛ is 26, πλη is 38.

The numeral series is what `BOOK_LETTERS` in siglum_check encodes, and for every
work but the Problemata it is wrong — stigma displaces ζ and everything after it
by one, which is why it scores 74/127 on the Historia animalium against 122.  It
does no damage there because nothing outside the Metaphysics goes past book κ,
but do not reason from it about which book a letter names.

⚠ A BOOK BOUNDARY FALLS INSIDE A COLUMN.  Book Β of the Metaphysics ends at
1003a17 and Γ opens at 1003a21, so the column 1003a belongs to both and our
spans, being column-granular, cannot say which.  `TOLERANCE` is what that costs:
a page within one column of a boundary is not reported.
"""

from __future__ import annotations
import argparse
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = Path('/Users/johnboyer/Developer/aristotle-reader/build/dist')
OUT = ROOT / 'work/sigla/book-spans.json'

PLAIN = 'αβγδεζηθικλμνξοπρστυφχψω'
META = 'Ααβγδεζηθικλμν'
TOLERANCE = 1          # columns, for a boundary that falls inside a column


def series(stem: str) -> str:
    """The letters this work numbers its books with, in order."""
    return META if stem == 'Μ' else PLAIN


def book_number(stem: str, letter: str) -> int | None:
    s = series(stem)
    return s.index(letter) + 1 if len(letter) == 1 and letter in s else None


def derive(dist: Path = DIST) -> dict:
    """siglum -> {book letter: [lo, hi]}, read off the built corpus."""
    key = json.loads((ROOT / 'work/sigla/work-sigla.json').read_text(encoding='utf-8'))
    out, provenance = {}, {}
    for e in key['works']:
        m = e.get('manifest') or ''
        books = sorted(glob.glob(str(dist / m / 'book-*.json'))) if m else []
        if len(books) < 2:
            continue                        # single-book works need no table
        stem, spans = e['siglum'], {}
        for p in books:
            n = int(re.search(r'book-(\d+)', p).group(1))
            cols = [s['column'] for s in json.loads(Path(p).read_text())['segments']]
            letter = series(stem)[n - 1] if n <= len(series(stem)) else None
            if letter is None:
                continue
            spans[letter] = [int(re.sub(r'\D', '', cols[0])),
                             int(re.sub(r'\D', '', cols[-1]))]
        if spans:
            out[stem] = spans
            provenance[stem] = f'{m}: {len(spans)} books'
    return {'_': [
        "Per-book Bekker spans, DERIVED from build/dist and not transcribed from",
        "Bonitz. Regenerate with `python3 -m bonitz_pipeline.book_spans`.",
        "Column-granular: a book boundary inside a column is why the check allows",
        f"a tolerance of {TOLERANCE}. Letters follow the work's own series — plain",
        "alphabet everywhere, the named series for the Metaphysics; the Problemata",
        "uses numerals and has no table here because it is not in build/dist.",
        "⚠ A MISSING BOOK IS NOT AN ERROR. The Historia animalium runs to book κ in",
        "Bonitz and to book ι in our corpus, because book X is held spurious and",
        "was not built. Citations of a book with no span are not checked.",
    ], 'provenance': provenance, 'spans': out}


def check(cites, table: dict) -> list[tuple]:
    """Citations whose own book letter excludes the page they carry."""
    spans = table['spans']
    bad = []
    for c in cites:
        if c.how not in ('explicit', 'inherited') or not c.book or not c.work:
            continue
        stem = c.work[:-len(c.book)] if c.work.endswith(c.book) else c.work
        if stem not in spans or c.book not in spans[stem]:
            continue                        # no data for this book: not a finding
        lo, hi = spans[stem][c.book]
        if lo - TOLERANCE <= c.page <= hi + TOLERANCE:
            continue
        owner = [b for b, (l, h) in spans[stem].items() if l <= c.page <= h]
        bad.append((c, stem, lo, hi, owner[0] if owner else '?'))
    return bad


def missing_book(cites, table: dict) -> list[tuple]:
    """Citations that name a multi-book work and no book at all.

    ⚠ THIS IS THE ONE PLACE BOTH OTHER CHECKS ARE BLIND.  `Ζι 37. 621a` passes
    the work check, because Ζι really does contain 621; and `check` above never
    looks at it, because there is no book letter to test.  But the Historia
    animalium has nine books and Bonitz does not cite it without naming one —
    99 of his 100 book-ι citations write `Ζιι`.  The hundredth lost an iota.

    John, 2026-08-09: *"we've had numbers cases of Ζιι misread."*  He was right
    and I had been looking in the wrong place — at ιι inside Greek words, where
    the lexical sweep finds nothing, instead of at this siglum, which is the
    hardest thing in the book to read: `Ζιι` has been written `Ζυ` twice, `Ζιθ`
    once, and here dropped to `Ζι`.
    """
    spans = table['spans']
    out = []
    for c in cites:
        if c.how not in ('explicit', 'inherited') or c.book or c.work not in spans:
            continue
        owner = [b for b, (lo, hi) in spans[c.work].items() if lo <= c.page <= hi]
        out.append((c, c.work, owner[0] if owner else '?'))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--check', action='store_true',
                   help='report mismatches instead of regenerating')
    args = p.parse_args(argv)

    if not args.check:
        table = derive()
        OUT.write_text(json.dumps(table, ensure_ascii=False, indent=1) + '\n',
                       encoding='utf-8')
        n = sum(len(v) for v in table['spans'].values())
        print(f'{len(table["spans"])} works, {n} books -> {OUT}')
        return 0

    from bonitz_pipeline.siglum_check import inventory, read, resolve
    table = json.loads(OUT.read_text(encoding='utf-8'))
    cites = read()
    resolve(cites, inventory())
    bad = check(cites, table)

    # ⚠ A SITE JOHN HAS ALREADY RULED IS NOT A FINDING.  Twenty-one of these are
    # Bonitz's own errors, preserved on purpose and banked in work/corrigenda —
    # they will disagree with the table for as long as the transcription is
    # diplomatic, which is forever.  A check that reports them every run is a
    # check that stops being read, and this module exists because of exactly
    # that failure mode elsewhere in the pipeline.
    ruled = {}
    store = ROOT / 'work/sweeps/book-rulings.json'
    if store.exists():
        ruled = json.loads(store.read_text(encoding='utf-8'))
    fresh = [t for t in bad
             if f'{t[0].col}:{t[0].line}:{t[0].token}:{t[0].page}' not in ruled]
    settled = len(bad) - len(fresh)

    print(f'{len(bad)} citations whose book letter excludes the page — '
          f'{settled} already ruled, {len(fresh)} new:\n')
    for c, stem, lo, hi, owner in sorted(fresh, key=lambda t: (t[0].col, t[0].line)):
        n = book_number(stem, c.book)
        print(f'  {c.col}:{c.line:<4} {c.raw!r}')
        print(f'      {stem}{c.book} is book {n} at {lo}-{hi}; {c.page} is in '
              f'book {owner!r}')
    if not fresh:
        print('  (nothing new — the settled ones are preserved by ruling and '
              'recorded in work/corrigenda/entries.json)')

    gap = [t for t in missing_book(cites, table)
           if f'{t[0].col}:{t[0].line}:{t[0].token}:{t[0].page}' not in ruled]
    if gap:
        print(f'\n{len(gap)} name a multi-book work and no book at all — the '
              f'blind spot between the two checks:')
        for c, w, owner in sorted(gap, key=lambda t: (t[0].col, t[0].line)):
            print(f'  {c.col}:{c.line:<4} {c.raw!r}')
            print(f'      {w} has {len(table["spans"][w])} books and none is '
                  f'named; {c.page} is in book {owner!r}, so read {w}{owner}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
