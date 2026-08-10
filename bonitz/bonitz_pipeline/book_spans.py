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
# Bonitz letters the Topics α…θ with no stigma, so the family expands
# on the plain alphabet — the same series `inventory()` uses.
FAMILY = PLAIN
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
        m, note = e.get('manifest') or '', (e.get('note') or '')
        sig = e['siglum']
        books = sorted(glob.glob(str(dist / m / 'book-*.json'))) if m else []
        if len(books) < 2:
            continue                        # single-book works need no table
        # ⚠ A RANGE ENTRY IS NOT A CITABLE SIGLUM, and keying spans by it made
        # this whole check a no-op for the works it covers. Bonitz's key prints
        # `Ααβ` and `τα-θ` for families; a citation uses a MEMBER — `Αα`, `τζ` —
        # and `inventory()` expands them, so a table keyed `Ααβ` never matched
        # anything resolved. The Analytics and the Topics have never been
        # book-checked, and nothing said so.
        #
        # Worse, the key gives ONE Bekker range per family, so `Αα` and `Αβ`
        # both carried 24-70 — the whole Prior Analytics — and a book-α citation
        # sitting on a book-β page passed. Each member gets its own book here.
        stem, spans = e['siglum'], {}
        if 'RANGE' in note:
            members = ([f'{sig[:-2]}{c}' for c in sig[-2:]] if '-' not in sig
                       else [sig.partition('-')[0][:-1] + c
                             for c in FAMILY[
                                 FAMILY.index(sig.partition('-')[0][-1]):
                                 FAMILY.index(sig.partition('-')[2]) + 1]])
            for i, m in enumerate(members):
                if i < len(books):
                    cols = [g['column'] for g in
                            json.loads(Path(books[i]).read_text())['segments']]
                    out[m] = {'': [int(re.sub(r'\D', '', cols[0])),
                                   int(re.sub(r'\D', '', cols[-1]))]}
                    provenance[m] = f'{m}: {Path(books[i]).name}'
            continue
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
        if c.how not in ('explicit', 'inherited') or not c.work:
            continue
        # ⚠ A FAMILY MEMBER IS ITS OWN BOOK. `Αα` is Prior Analytics book α —
        # there is no separate letter to test — and the key gives ONE Bekker
        # range for the whole family, so both `Αα` and `Αβ` carried 24-70 and a
        # book-α citation on a book-β page passed. The member's own span is
        # derived now, so check it directly.
        if not c.book and c.work in spans and '' in spans[c.work]:
            lo, hi = spans[c.work]['']
            if not (lo - TOLERANCE <= c.page <= hi + TOLERANCE):
                sibs = [w for w, t in spans.items()
                        if '' in t and t[''][0] <= c.page <= t[''][1]
                        and w[:-1] == c.work[:-1]]
                bad.append((c, c.work, lo, hi, sibs[0][-1] if sibs else '?'))
            continue
        if not c.book:
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

    ⚠ INHERITANCE IS TESTED FIRST, and it has to be. John, 2026-08-10: "did you
    not bundle inheritance rule into this rule?" A bare BOOK letter inherits its
    work; the symmetric reading is that a work named with no book inherits the
    BOOK last used for it — `Ζιζ10. 565b1 … Ζι 37. 621a12` would then be book ζ
    again. That is a citation, not a lost letter, and calling it one would put a
    false misprint in the register.

    Here it does not save the case — HA book ζ ends well before 621 — which is
    why the lost-iota reading stands. But the check must run before the verdict,
    not after John asks for it.
    """
    spans = table['spans']
    last_book = {}
    out = []
    for c in cites:
        if c.how not in ('explicit', 'inherited') or c.work not in spans:
            continue
        # ⚠ A FAMILY MEMBER HAS NO BOOK TO MISS. `Αα` IS Prior Analytics book α;
        # its span table is keyed '' because there is no further letter, and
        # reading that as "a book is missing" flagged 246 perfectly good
        # citations at once — the check inventing work for a reader.
        if set(spans[c.work]) == {''}:
            continue
        if c.book:
            last_book[c.work] = c.book
            continue
        prev = last_book.get(c.work)
        if prev:
            span = spans[c.work].get(prev)
            if span and span[0] <= c.page <= span[1]:
                continue          # the book carries over; nothing is missing
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
