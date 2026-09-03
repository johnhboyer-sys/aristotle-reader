"""
Latin capitals standing where a Greek siglum belongs — found, not folded away.

    python3 -m bonitz_pipeline.siglum_homoglyph
    python3 -m bonitz_pipeline.siglum_homoglyph --out work/sweeps/mine.tsv

`Ρ` and `P`, `Η` and `H`, `Α` and `A` are different codepoints and identical
ink. A reader typing the Latin one produces a citation that is RIGHT on the
page and WRONG in the file: `Pα13 … 1359a25` is Rhetoric book α, set by Bonitz
in Greek, transcribed by us in Latin.

⚠ THIS IS AN ENCODING CLAIM, NOT A CLAIM ABOUT THE INK. Nothing here says the
printer set the wrong letter; it says the transcription chose the wrong
codepoint for the letter he set. That is what makes these different from every
other finding in the pipeline, and it is what decides how John rules them: he
is not being asked whether the page reads Ρ or P — the page cannot tell them
apart — but whether the citation resolves as Greek. Where it does, the Greek
codepoint is what the ink meant.

⚠ A FINDER, NEVER A FIXER. This module proposes a spelling and writes a TSV.
It does not touch `work/reconciled`. The diplomatic rule holds.

WHY THE EXISTING CHECK CANNOT SEE THESE. `siglum_check.HOMOGLYPH` already
knows the map — and uses it to FOLD Latin into Greek so the citation still
resolves. That is tolerance, not detection. `siglum-check.tsv` therefore holds
ZERO rows about them, because a folded citation is a resolved citation and
resolved citations are not reported. The module's own comment says "67 of them
are in the corpus. Nothing caught this before"; nothing caught them afterwards
either.

⚠ THE DISCRIMINATOR IS THE WHOLE DESIGN, BECAUSE MOST LATIN CAPITALS ARE
CORRECT. Bonitz's apparatus is full of them: `AZι I 77 n 99` (Aubert-Wimmer),
`St K Cr Su` (editors), `Hom B 672` and `Hom Z201` (Homeric book letters),
`S III 379` (Roman numerals). A check that reported every Latin capital in a
citation-shaped position would file 91 rows of which 87 are Bonitz being
correct — and a report nobody trusts is a report nobody reads. So a token is
reported ONLY when, folded through HOMOGLYPH, it RESOLVES as one of Bonitz's
sigla AND the Bekker page cited beside it falls inside that work's span. The
page adjudicates, exactly as it does in `siglum_check.resolve`. `Pα … 1359a25`
resolves (Ρ, τέχνη Ῥητορική, 1354a-1420a) and is reported; `B15.` folds to `Β`,
which is not a siglum at all, and is counted skipped-as-apparatus in silence.

⚠ `siglum_check.CITE` CANNOT BE THE SCANNER HERE, THOUGH ITS CLASS CAN. CITE
requires the Bekker page to sit immediately after the token, and Bonitz
routinely does not put it there: `κημάτων εἴδη Pα13. ἀδίκημα μεῖζον τί Pα14.
3. 1359a25.` is two references sharing one page, 31 characters downstream.
Run over the corpus, CITE matches 6147 citations and exactly ZERO of them lead
with a Latin capital — the shape that misses every case. So the token is
matched on its own (with CITE's own siglum class and its own accent-safe
lookbehind) and the page is looked up separately, within a bounded window.

⚠ THE WINDOW IS NOT DOING THE WORK, AND WAS CHECKED FOR IT. A forward window
wide enough to reach a shared page number is also wide enough to reach into
the next index entry, so it could manufacture findings. It does not: the
corpus yields the same 4 findings at every window from 40 to 400 characters.
The resolution-and-range test is what selects; PAGE_WINDOW only bounds the
search.

⚠ VOLUME AS WELL AS VERDICT. An empty `work/reconciled` glob raises rather
than printing a clean zero, and the summary states every volume — examined,
Latin-led, reported, skipped (by leading letter and by reason), columns read —
so `examined = reported + skipped + clean` can be read off the report. A check
that answers "nothing" without saying whether it looked is this pipeline's
oldest defect.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from .siglum_check import HOMOGLYPH, SIGLA, Work, inventory, split

ROOT = Path(__file__).resolve().parent.parent

# CITE's own siglum class, unchanged: Greek letters plus the ligatures Bonitz
# sets (ϗ ȣ ϛ) plus the fourteen Latin capitals that are homoglyphs of Greek
# ones. Reusing it is deliberate — a token this scanner accepts and CITE would
# not is a token the rest of the pipeline has never seen.
SIGLUM_CHARS = 'Α-Ωα-ωϗȣϛABEHIKMNOPTXYZ'

# A citation-shaped token: a maximal run of at most four siglum characters,
# followed by the number that makes it a citation (a book, a chapter or a
# Bekker page) or by the stop of a page-less cross-reference (`περὶ ἀδικίας
# Ηε. ημα34.`, which cites a work and no page).
#
# ⚠ THE LOOKBEHIND IS CITE'S, FOR CITE'S REASON. `(?<![Α-Ωα-ω])` would be the
# UNACCENTED letters only, and every accented Greek letter sits outside that
# span — so a word accented early and ending in plain letters would have its
# tail read as a siglum. The Latin range is added on top of it so `AZι` is read
# whole rather than restarting at its `Z`.
# ⚠ THE TRAILING GUARD MAKES THE RUN MAXIMAL. Without it a five-letter Greek
# word contributes its first four letters as a "token", and the examined count
# stops meaning anything.
TOKEN = re.compile(
    rf'(?<![̀-ͯͰ-Ͽἀ-῿ȣA-Za-z])'
    rf'([{SIGLUM_CHARS}]{{1,4}})'
    rf'(?![{SIGLUM_CHARS}ἀ-῿A-Za-z])'
    rf'(?=\s?[\d.])'
)

# A Bekker address: page and column. The line number is irrelevant here — the
# work is decided by the page alone, Bekker spans being disjoint.
#
# ⚠ ONE DIGIT IS A BEKKER PAGE TOO, AND CITE'S FLOOR OF TWO HIDES A FINDING.
# `CITE` asks for `\d{2,4}`, which cannot see `K5. 3 b19` — the Categoriae run
# from 1a to 15b, so its first nine pages are single digits. That citation is a
# Latin K where Κ belongs, page 3 squarely inside the work, and the two-digit
# floor was the only thing keeping it out of this report.
# ⚠ THE COLUMN LETTER NEEDS A GUARD ONCE THE FLOOR DROPS. `\d{1,4}\s?[ab]`
# alone reads the `a` of `AZι I 77 n 5 al.` as column a of page 5. Requiring
# that no letter follow costs nothing real — Bonitz sets a line number or a
# stop after every column letter — and it keeps the apparatus out.
PAGE = re.compile(r'(\d{1,4})\s?[ab](?![A-Za-zΑ-Ωα-ωἀ-῿])')

# How far after the token to look for the page that adjudicates it. Bonitz
# shares one page number across a run of references, so the page is often not
# adjacent; 120 characters reaches the observed worst case (31) with room, and
# the finding count is flat from 40 to 400. See the docstring's window note.
PAGE_WINDOW = 120

TSV_HEADER = 'column\tline\ttoken\tproposal\twork\tpage\n'

# Why a Latin-led token was not reported. All three are skipped-as-apparatus —
# the check stays silent about them — but they are counted apart, because
# "folds to nothing" and "no page to ask" are different kinds of not-knowing.
REASONS = ('no-siglum', 'no-page', 'out-of-range')


@dataclass(frozen=True)
class Finding:
    col: str
    line: int
    token: str        # as printed in the transcription, Latin capital and all
    proposal: str     # the same token folded into Greek
    work: str         # the siglum it resolves to
    page: int         # the Bekker page that decided it

    def row(self) -> str:
        return (f'{self.col}\t{self.line}\t{self.token}\t{self.proposal}\t'
                f'{self.work}\t{self.page}\n')


def fold(token: str) -> str:
    """The token with its Latin capitals replaced by their Greek twins."""
    return ''.join(HOMOGLYPH.get(ch, ch) for ch in token)


def adjudicate(token: str, text: str, end: int,
               works: dict[str, Work]) -> tuple[str, int] | str:
    """Report this Latin-led token, or say why not.

    Returns `(work siglum, page)` when the folded token resolves as a work of
    Bonitz's key whose Bekker span holds the nearest following page; otherwise
    one of REASONS. Nothing here decides anything the page has not decided.
    """
    options = split(fold(token), works)
    if not options:
        return 'no-siglum'
    m = PAGE.search(text, end, end + PAGE_WINDOW)
    if m is None:
        return 'no-page'
    page = int(m.group(1))
    fit = [w for w, _ in options if works[w].holds(page)]
    if not fit:
        return 'out-of-range'
    # `split` returns longest work first, and so does this: `Ζι` before `Ζ`.
    return fit[0], page


def scan(text: str, col: str,
         works: dict[str, Work]) -> tuple[list[Finding], collections.Counter]:
    """One reconciled column. Returns (findings, volumes).

    The column is read as a STREAM and not line by line, for the reason
    `siglum_check.read` gives: 790 citations in the corpus are split across a
    printed line break, which is where the measure ran out and not anything
    Bonitz meant. A finding is still filed under the line its token BEGINS on,
    because that is where John looks on the scan.

    counts['examined'] == reported + skipped + clean, by construction.
    """
    found: list[Finding] = []
    counts: collections.Counter = collections.Counter()
    for m in TOKEN.finditer(text):
        token = m.group(1)
        counts['examined'] += 1
        if token[0] not in HOMOGLYPH:
            counts['clean'] += 1          # led with a Greek letter: not ours
            continue
        counts['latin'] += 1
        counts[f'lead-{token[0]}'] += 1
        verdict = adjudicate(token, text, m.end(), works)
        if isinstance(verdict, str):
            counts['skipped'] += 1
            counts[verdict] += 1
            continue
        work, page = verdict
        counts['reported'] += 1
        found.append(Finding(col, text.count('\n', 0, m.start()) + 1,
                             token, fold(token), work, page))
    return found, counts


def run(files: list[Path],
        works: dict[str, Work]) -> tuple[list[Finding], collections.Counter]:
    """Every column through scan(), volumes summed."""
    found: list[Finding] = []
    counts: collections.Counter = collections.Counter()
    for f in sorted(files):
        rows, c = scan(f.read_text(encoding='utf-8'), f.stem, works)
        found += rows
        counts += c
        counts['columns'] += 1
    return found, counts


def write_tsv(found: list[Finding], out: Path) -> None:
    """Written even when empty: a header-only file says "ran, found none",
    where a missing file cannot be told from a run that never looked."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as fh:
        fh.write(TSV_HEADER)
        for f in found:
            fh.write(f.row())


def summary(counts: collections.Counter) -> str:
    """The volume report. Every skipped token is counted twice over — once by
    the letter it led with, once by the reason it was let go — because the
    letters say what the apparatus is made of and the reasons say how much of
    the silence is ignorance rather than judgement."""
    leads = sorted(((k[5:], v) for k, v in counts.items()
                    if k.startswith('lead-')), key=lambda kv: (-kv[1], kv[0]))
    by_lead = ' '.join(f'{k}×{v}' for k, v in leads) or '—'
    by_reason = '  '.join(f'{r} {counts[r]}' for r in REASONS)
    return (
        f"{counts['columns']} columns read, "
        f"{counts['examined']} citation-shaped tokens examined\n"
        f"  led with a GREEK capital or letter (clean):  "
        f"{counts['clean']:5d}\n"
        f"  led with a LATIN capital:                    "
        f"{counts['latin']:5d}\n"
        f"    resolves to a work holding its page:       "
        f"{counts['reported']:5d}  ← reported\n"
        f"    does not:                                  "
        f"{counts['skipped']:5d}  ← skipped as apparatus\n"
        f"      by leading letter:  {by_lead}\n"
        f"      by reason:          {by_reason}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--reconciled', type=Path, default=ROOT / 'work/reconciled',
                   help='directory of reconciled column .txt files')
    p.add_argument('--sigla', type=Path, default=SIGLA,
                   help="Bonitz's printed key (work-sigla.json)")
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/siglum-homoglyph.tsv')
    p.add_argument('--show', type=int, default=25)
    args = p.parse_args(argv)

    files = sorted(args.reconciled.glob('*.txt'))
    if not files:
        # ⚠ Never looked must never read as clean. No columns, no report.
        raise SystemExit(f'no reconciled columns match {args.reconciled}/*.txt '
                         '— refusing to report an empty scan')

    works = inventory(args.sigla)
    found, counts = run(files, works)
    write_tsv(found, args.out)

    for f in found[:args.show]:
        print(f'  {f.col}:{f.line:<4} {f.token!r} → {f.proposal!r}  '
              f'({works[f.work].title}, {works[f.work].lo}-{works[f.work].hi}; '
              f'the page beside it is {f.page})')
    print(summary(counts))
    print(f'-> {args.out}')
    print('⚠ an ENCODING claim, not a claim about the ink: the printer set one '
          'glyph and\n  the transcription chose the wrong codepoint for it. '
          'This module proposes; it\n  never edits the corpus.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
