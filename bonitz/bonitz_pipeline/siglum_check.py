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
import bisect
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

# The alphabetic numerals, for reading a book letter as the NUMBER it is.  This
# is what tells `πο` from a book: read as a numeral it is 80 + 70 = 150, and no
# work of Aristotle has 150 books — so `πο8. 1408b` is περὶ Ποιητικῆς misread or
# mispaged, not the 150th book of the Rhetoric, which is what the checker used to
# call it (silently, because 1408 really is in the Rhetoric).
NUMERAL = dict(zip(BOOK_LETTERS,
                   (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80,
                    100, 200, 300, 400, 500, 600, 700, 800)))

# The longest work in the corpus is the Problemata, and Bonitz cites `πλη` — book
# 38.  Nothing legitimate goes higher, so a token that reads as a larger numeral
# is not a book letter at all.  The bound is deliberately the OBSERVED maximum
# rather than a per-work book count: inventing 48 book counts would be inventing
# data, and this one number is in the corpus and can be pointed at.
MAX_BOOK = 38

# ⚠ THE METAPHYSICS IS EXEMPT FROM THAT BOUND, because its book letters are NAMES
# and not numerals — Α α Β Γ … Μ Ν, the tradition's own titles for the fourteen
# books.  Read as numerals its last books are μ = 40 and ν = 50, both over the
# bound, and applying it would condemn `Μν` and every bare `ν` after it.
NAMED_SERIES = 'αβγδεζηθικλμν'

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
# ⚠ THE GUARD MUST COVER ACCENTED LETTERS.  It used to read `(?<![Α-Ωα-ω])`, which
# is U+0391-U+03A9 and U+03B1-U+03C9 — the UNACCENTED letters only.  Every accented
# Greek letter sits outside that span (precomposed from U+03AC, Greek Extended from
# U+1F00) and a decomposed one ends in a combining mark from U+0300, so the guard
# passed exactly the case that occurs: a word accented early and ending in plain
# letters.  `θέσιν 32. 88a` parsed as a citation of a work called `σιν`.
CITE = re.compile(
    r'(?<![̀-ͯͰ-Ͽἀ-῿ȣ])'
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


def value(token: str) -> int:
    """`λβ` -> 32.  A book letter read as the number it is."""
    return sum(NUMERAL[c] for c in token)


def book_ok(work: str, token: str) -> bool:
    """Can `token` be a book of `work`?  A numeral question, not a lexical one.

    Every character of `token` is already known to be a book letter; what is not
    known is whether they make a possible NUMBER.  `πο` does not: 80 + 70 = 150.
    """
    # A work cited with NO book letter is the ordinary case for a single-book
    # work, and the Metaphysics carries eleven of them. There is no numeral to
    # judge, so there is nothing to refuse.
    if not token:
        return True
    if work in NAMED_BOOKS:            # the Metaphysics letters are names
        return len(token) == 1 and token.lower() in NAMED_SERIES
    # ⚠ THE CALLER MAY NOT HAVE CHECKED. `resolve` only reaches here behind
    # `all(ch in BOOK_LETTERS ...)`, but `by_page` does not, so a token carrying
    # a ligature or a capital used to raise KeyError out of a predicate — a
    # function whose whole job is to answer yes or no. Answer no.
    if any(c not in NUMERAL for c in token):
        return False
    values = [NUMERAL[c] for c in token]
    if values != sorted(values, reverse=True):
        return False                   # numerals are written high to low: κϛ, λβ
    return sum(values) <= MAX_BOOK


def by_page(token: str, page: int, works: dict[str, Work]) -> tuple[str, str] | None:
    """The work the PAGE names, for a bare book letter whose context failed.

    The module's promise is that the page adjudicates, but step 2 only ever put
    one candidate to it — the work last named.  When that is wrong the page still
    knows the answer, because Bekker spans are disjoint: 731 is De generatione and
    can be nothing else.

    Returns None where the page is genuinely ambiguous, which happens only at a
    RANGE family (Αα/Αβ share a span, τα…τθ share a span) that the book letter
    cannot pick a member of.
    """
    holders = sorted(s for s, w in works.items() if w.holds(page))
    if not holders:
        return None
    if len(holders) > 1:               # an expanded family; the letter picks
        for stem in {s[:-1] for s in holders}:
            if stem + token in works and works[stem + token].holds(page):
                return stem + token, token
        return None
    return (holders[0], token) if book_ok(holders[0], token) else None


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
        good = [(w, b) for w, b in fit if book_ok(w, b)]
        if good:
            c.work, c.book = good[0]
            c.how = 'explicit'
            last = c.work
            continue
        # THE WORK IS RIGHT AND THE BOOK LETTER IS IMPOSSIBLE.  `Πο4. 1290b`
        # resolved as healthy Politics — book ο, which is 70.  This is where a
        # wholly corrupt book letter most often sits, and it is the one place
        # nothing else can catch it: 1290 really is in the Politics, so the page
        # agrees with the work and only the numeral objects.
        if fit:
            c.work, c.book = fit[0]
            c.how = 'unresolved'
            c.why = (f'{c.page} is inside {c.work} ({works[c.work].title}), but '
                     f'{c.book!r} reads as book {value(c.book)} and no work of '
                     f'Aristotle has that many')
            last = c.work        # the WORK is not in doubt, only its book
            continue
        # 2. the whole token as a book letter of the work last named
        #
        # ⚠ THE NUMERAL BOUND GATES THE INHERITANCE CLAIM, NOT THE BRANCH.  It
        # used to gate both, and so threw out a bare Metaphysics μ or ν after any
        # non-Metaphysics work before the page was ever consulted — read against
        # the wrong work they are 40 and 50, over the bound.  The asymmetry was
        # the tell: bare κ (20) after Physics inferred the Metaphysics happily
        # and bare μ did not, though the page is equally decisive for both.
        if last and all(ch in BOOK_LETTERS for ch in c.token):
            if book_ok(last, c.token) and works[last].holds(c.page):
                c.work, c.book, c.how = last, c.token, 'inherited'
                continue
            # THE ANALYTICS.  Bonitz letters four books α β γ δ across TWO
            # works that share the siglum Α — Αα Αβ are the Prior, Αγ Αδ the
            # Posterior — so after `Αβ21. 66b26` a bare `γ12. 77b18` does not
            # mean "book γ of the Prior Analytics". It means Αγ, a different
            # work. Retry the bare letter against the last work's STEM, which
            # is the only reading that puts 77 inside 71-100.
            stem = last[:-1]
            if stem and stem + c.token in works \
                    and works[stem + c.token].holds(c.page):
                c.work, c.book, c.how = stem + c.token, c.token, 'inherited'
                last = c.work
                continue
            # THE PAGE STILL KNOWS.  Bekker spans are disjoint, so a page names
            # its work whatever context we carried into it.  This is a THIRD
            # outcome and not a resolution: it says the citation is sound and our
            # context was not — a parser complaint, not a reader's misreading —
            # so it must not sit in the pile John rules on.
            #
            # ⚠ AN INFERENCE DOES NOT BECOME THE CONTEXT FOR WHAT FOLLOWS.  It
            # used to, on the reasoning that the page is better evidence than
            # inheritance.  But a page can be mistyped, and if the wrong page
            # names some other work uniquely then setting the context from it
            # spends the one error signal we had on repairing the context —
            # after which every bare letter that follows inherits the wrong work
            # in silence, with the work-level check content.  Nothing is lost by
            # refusing: a following bare letter really in that work will infer it
            # from its OWN page, and be labelled an inference rather than
            # borrowing the standing of one.
            guess = by_page(c.token, c.page, works)
            if guess:
                c.work, c.book = guess
                c.how = 'page-inferred'
                c.why = (f'reads as book {c.token} of {last} (the work last '
                         f'named), but {c.page} is outside {last} '
                         f'({works[last].lo}-{works[last].hi}); {c.page} is in '
                         f'{c.work} and nothing else, so the work last named is '
                         f'what is wrong here, not the citation')
                continue
            if not options:
                c.how, c.why = 'unresolved', (
                    f'reads as book {c.token} of {last} (the work last named), '
                    f'but {c.page} is outside {last} '
                    f'({works[last].lo}-{works[last].hi})')
                continue
            # fall through: the token is a work in its own right, and saying so
            # is more use than calling it a book of something it is not
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
    """Every citation in the column, INCLUDING the ones that wrap.

    ⚠ THE COLUMN IS READ AS A STREAM, NOT A LIST OF LINES.  790 citations in the
    corpus are split across a line break, in two shapes:

        Ζγα4. 717 | a16.        the page ends the line, the column letter the next
        Ζιζ 22.   | 576b15.     siglum and chapter end the line, the page the next

    Neither is anything Bonitz did — a printed column wraps where the measure runs
    out, and our reconciled files keep his breaks because the transcription is
    diplomatic.  Reading a line at a time makes the break semantic, which it is
    not, and the cost is not only 790 unchecked citations: a work named on the near
    side of a break never becomes the context for what follows, so the bare book
    letters after it inherit whatever was named BEFORE it and are then reported as
    errors.  `015-R:22` is the specimen.

    `CITE` needed no change for this.  Its `\\s?` and `\\s*` match a newline
    already; iterating by line was the whole of the bug.
    """
    out = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        n = int(f.stem.split('-')[1])
        if pages is not None and n not in pages:
            continue
        text = f.read_text(encoding='utf-8')
        # offset of each line start, so a citation can still be filed under the
        # line it BEGINS on — John rules on these against the scan
        starts, pos = [], 0
        for line in text.splitlines(keepends=True):
            starts.append(pos)
            pos += len(line)
        for m in CITE.finditer(text):
            tok, chap, page, col = m.groups()
            out.append(Cite(f.stem, bisect.bisect_right(starts, m.start()),
                            ' '.join(m.group(0).split()), tok, chap,
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
