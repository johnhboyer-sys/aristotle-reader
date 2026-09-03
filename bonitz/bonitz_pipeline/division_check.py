"""
Division check — is the space between two words in the right place?

  python3 -m bonitz_pipeline.division_check
  python3 -m bonitz_pipeline.division_check --reconciled work/reconciled --out work/sweeps/division-check.tsv

A space landing one character off divides the line into two tokens that each
look like a plausible word, and every sweep in this pipeline tokenises on
whitespace FIRST — so no rule ever examines the boundary itself. Two sites
survived every check the project has, and John found both against the 400 dpi
ink on 2026-08-13:

  page-047-R:2   μηδὲν ἀξιȣ͂ νἀξίωμ᾽ ἄλογον   for   ἀξιȣ͂ν ἀξίωμ᾽
  page-025-L:12  κληρȣ͂ ντȣς ἀθλητάς          for   κληρȣ͂ντȣς

This is the exact sibling of the orphan-mark class that
`tests/test_no_orphan_marks.py` guards: a mark on a space belongs to no
token, and a misplaced space belongs to no token either. The general lesson
is the one `work/kraken/NOTES.md` states — a check that begins by tokenising
has already decided what can be found.

⚠ A FINDER, NEVER A FIXER. Nothing here writes to the corpus. Bonitz's
setting is justified, and a wide space in the ink is a real wide space; every
finding is a question for John against the scan, not a correction. The
diplomatic rule holds: if the ink prints the division we call impossible, the
corpus keeps it.

Two tiers, reported separately so their precision can be measured apart:

  onset  a token beginning with a consonant cluster no Greek word begins
         with. The first letter of that cluster belongs to the token on its
         left, so the boundary is wrong wherever the space actually sits.
  join   a marked ou-ligature stranded before a short fragment — the
         `ἀξιȣ͂ νἀξίωμ᾽` shape. Decided on attested forms, not on intuition.

⚠ THE ONSET LIST IS DERIVED, NOT GUESSED, AND IT IS SHORT. A nasal followed
by a homorganic obstruent (ν+τ/δ/θ, μ+π/β/φ, γ+κ/γ/χ, γ before a velar being
the velar nasal) can only arise inside a word or across a boundary; Greek
begins no word with one. Every OTHER consonant cluster that looks strange is
legal and must not be flagged — πτ- (πτηνόν), κτ- (κτῆμα), χθ- (χθών), φθ-
(φθόνος), σθ- (σθένος), τμ- (τμῆμα), βδ- (βδελυρός), μν- (μνήμη), πν-, κν-,
θν-, γν- are all real onsets, and flagging πτ- alone costs 11 false
positives. The two classes separate totally against the 56k attested forms of
`work/aristotle-forms.json`: 0 forms begin with any impossible cluster, while
the legal ones carry 8 to 159 each. `test_division_check.py` pins that.

⚠ A CITATION SIGLUM IS NOT A GREEK WORD. `μβ` is Meteorologica β and it
occurs 110 times; read as a word it is an impossible μ+β onset, and it would
be 110 of the 111 onset findings. Sigla are excluded by Bonitz's own printed
inventory (`siglum_check.inventory`, the positive list built after a blanket
siglum exemption let `Ζιθ28` through), never by a length or accent guess.

⚠ VOLUME AS WELL AS VERDICT — this project's standing defect. A check that
answers "nothing" without distinguishing *found nothing* from *never looked*
has been re-fixed four times here. So: an empty reconciled glob raises; an
empty attested-forms set raises; every skip states its reason and its count,
and tokens = onset findings + skips by construction. The forms cache is
DERIVED data (lexcheck rebuilds it from app/dist/data on demand), so its
absence rebuilds rather than raises — but a rebuild that yields nothing is
fatal, because tier `join` with no evidence reports nothing and would print
exactly like a clean corpus.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from pathlib import Path

from .lexcheck import ROOT, WORD_RE, bare, load_forms, nfc, to_ou
from .siglum_check import inventory, split


class DivisionError(Exception):
    """The check could not run. Raised, never warned: a tier silently
    disabled reads as a tier that found nothing wrong."""


# A nasal plus a homorganic obstruent. Word-internal or across a boundary
# only — see the ⚠ paragraph above, and test_no_attested_form_has_an_impossible_onset.
IMPOSSIBLE_ONSETS = ('ντ', 'νδ', 'νθ', 'μπ', 'μβ', 'μφ', 'γκ', 'γγ', 'γχ')

CONSONANTS = set('βγδζθκλμνξπρστφχψ')
GREEK_RE = re.compile(r'[Ͱ-Ͽἀ-῿]')

# The marks that sit on the ligature. `ȣ` has no precomposed accented form,
# so in NFC these stay combining and a token's tail is literally ȣ + mark.
LIG_MARKS = '͂̓̔̀́'
LIG_TAIL = re.compile(f'[ȣȢ][{LIG_MARKS}]+$')

TSV_HEADER = 'source\ttier\tprinted\tproposed\tevidence\n'


def load_attested() -> set[str]:
    """The attested-forms set tier `join` decides on.

    lexcheck owns this: it caches at work/aristotle-forms.json and rebuilds
    from the Aristotle corpus plus LSJ headwords when the cache is absent.
    An empty result is fatal — see the volume ⚠ above.
    """
    forms = load_forms()
    if not forms:
        raise DivisionError(
            'the attested-forms set is empty — tier `join` would report '
            'nothing and print exactly like a clean corpus. Rebuild it with '
            'bonitz_pipeline.lexcheck (it reads app/dist/data).')
    return forms


def key(word: str) -> str:
    """The lookup form: ligature expanded to ου, accents and case dropped.
    lexcheck's convention, because it is lexcheck's form set."""
    return bare(to_ou(word))


def _hyphen_fragment(cur: str, prev: str, start: int, end: int) -> bool:
    """Is this token half of a word Bonitz broke at the line end?

    `ἀλή-` / `θειαν` is one word set on two lines, and its second half may
    begin with any cluster at all. mark_review.shape() draws the same two
    tests; they are repeated here rather than imported because shape() reads
    the column off disk and answers a different question (why a token is
    unaccented), while this one has the lines already in hand.
    """
    if prev.rstrip().endswith('-') and not cur[:start].strip():
        return True                       # line-start fragment
    return cur.rstrip().endswith('-') and end == len(cur.rstrip()) - 1


def scan(text: str, source: str, forms: set[str],
         works: dict) -> tuple[list[dict], collections.Counter]:
    """Both tiers over one reconciled column.

    Returns (rows, counts). counts['tokens'] == counts['onset'] +
    counts['siglum'] + counts['hyphen-fragment'] + the tokens with a legal
    onset; counts['pairs'] == counts['join'] + counts['no-evidence'] +
    counts['both-attested'].
    """
    rows: list[dict] = []
    counts: collections.Counter = collections.Counter()
    lines = nfc(text).splitlines()

    for n, cur in enumerate(lines, 1):
        prev = lines[n - 2] if n > 1 else ''
        toks = list(WORD_RE.finditer(cur))

        # ── tier onset ────────────────────────────────────────────────────
        for i, m in enumerate(toks):
            tok = m.group()
            if not GREEK_RE.search(tok):
                continue
            counts['tokens'] += 1
            if bare(tok)[:2] not in IMPOSSIBLE_ONSETS:
                continue
            if split(tok, works):
                counts['siglum'] += 1     # `μβ` is Meteorologica β, not a word
                continue
            if _hyphen_fragment(cur, prev, m.start(), m.end()):
                counts['hyphen-fragment'] += 1
                continue
            counts['onset'] += 1
            left = toks[i - 1].group() if i else ''
            rows.append({
                'source': f'{source}:{n}', 'tier': 'onset',
                'printed': f'{left} {tok}'.strip(),
                # The join is shown because it is what the two real sites
                # wanted; the space moved one place right is equally
                # consistent with onset evidence alone, and the ink decides.
                'proposed': f'{left}{tok}',
                'evidence': f'no Greek word begins {bare(tok)[:2]}- '
                            f'(0 of {len(forms)} attested forms do)',
            })

        # ── tier join ─────────────────────────────────────────────────────
        for a, b in zip(toks, toks[1:]):
            gap = cur[a.end():b.start()]
            if not gap or gap.strip():
                continue                  # not a plain space between them
            A, B = a.group(), b.group()
            if not LIG_TAIL.search(A) or len(B) < 2:
                continue
            head = B[0]
            if bare(head) not in CONSONANTS:
                continue
            counts['pairs'] += 1
            moved, printed = key(A + head), key(B)
            if moved not in forms:
                counts['no-evidence'] += 1
                continue                  # the join makes no word either
            if printed in forms:
                counts['both-attested'] += 1
                continue                  # the printed division is defensible
            counts['join'] += 1
            rows.append({
                'source': f'{source}:{n}', 'tier': 'join',
                'printed': f'{A} {B}', 'proposed': f'{A}{head} {B[1:]}',
                'evidence': f'{moved} is attested, {printed} is not',
            })

    return rows, counts


def run(files: list[Path], forms: set[str],
        works: dict) -> tuple[list[dict], collections.Counter]:
    """Every reconciled column through scan(), volumes summed."""
    rows: list[dict] = []
    counts: collections.Counter = collections.Counter()
    for f in files:
        r, c = scan(f.read_text(encoding='utf-8'), f.stem, forms, works)
        rows += r
        counts += c
        counts['columns'] += 1
    return rows, counts


def write_tsv(rows: list[dict], out: Path) -> None:
    """Written even when empty: a header-only file says 'ran, found none',
    where a missing file cannot be told from a run that never looked."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as fh:
        fh.write(TSV_HEADER)
        for r in rows:
            fh.write(f"{r['source']}\t{r['tier']}\t{r['printed']}\t"
                     f"{r['proposed']}\t{r['evidence']}\n")


def summary(counts: collections.Counter) -> str:
    """The volume report. Every skip states its reason and its count, so a
    zero-finding run says what it read, not merely that it found nothing."""
    return (
        f"{counts['columns']} columns read, {counts['tokens']} Greek tokens "
        f"examined, {counts['pairs']} ligature pairs weighed\n"
        f"  tier onset:  {counts['onset']:4d} findings "
        f"(impossible word-initial cluster)\n"
        f"    skipped siglum:          {counts['siglum']:4d}  "
        f"(Bonitz's own work list — `μβ` is Meteorologica β)\n"
        f"    skipped hyphen-fragment: {counts['hyphen-fragment']:4d}  "
        f"(half a word Bonitz broke at the line end)\n"
        f"  tier join:   {counts['join']:4d} findings "
        f"(ligature stranded before a fragment)\n"
        f"    skipped no-evidence:     {counts['no-evidence']:4d}  "
        f"(the join makes no attested form either)\n"
        f"    skipped both-attested:   {counts['both-attested']:4d}  "
        f"(the printed division is a word too)\n"
        f"⚠ every finding is a question for the 400 dpi ink, not a "
        f"correction: Bonitz\n  sets justified, and a wide space may be a "
        f"wide space.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--reconciled', type=Path, default=ROOT / 'work/reconciled',
                    help='directory of reconciled column .txt files')
    ap.add_argument('--out', type=Path,
                    default=ROOT / 'work/sweeps/division-check.tsv')
    args = ap.parse_args(argv)

    files = sorted(args.reconciled.glob('*.txt'))
    if not files:
        # ⚠ An empty scan reported as clean is the defect this pipeline has
        # fixed four times. No columns means we never looked: raise.
        raise DivisionError(f'no reconciled columns match {args.reconciled}/*.txt '
                            '— refusing to report an empty scan')
    forms = load_attested()               # raises rather than disabling `join`
    rows, counts = run(files, forms, inventory())
    write_tsv(rows, args.out)
    for r in rows:
        print(f"  {r['tier']:6} {r['source']:15} {r['printed']:28} "
              f"-> {r['proposed']:28} {r['evidence']}")
    print(summary(counts))
    print(f'-> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
