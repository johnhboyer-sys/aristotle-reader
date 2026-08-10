"""Morpheus: does this spelling exist in Greek at all?

Every other authority here answers a question about a CORPUS — what Aristotle
writes, what LSJ lists as a headword, what our lemma map happens to hold.  Each
one therefore mistakes its own gaps for facts about the language, which is the
bug this project has now found seven times.

Morpheus answers a different question.  It is a morphological generator, not a
concordance: it holds 896,425 inflected Greek forms, fully accented and
breathed, because the grammar produces them — not because some author was
observed using them.  So `ἁλουργός` is there and `ἀλουργός` is not, and that is
a statement about Greek rather than about anybody's reading habits.

    ἁλουργός    in Morpheus
    ἀλουργός    ABSENT          -> the printed smooth breathing is a reader's

⚠ MEASURED AGAINST THE EXISTING ORACLE ON THE WHOLE CORPUS: 5,848 words where
both authorities speak, **5,848 agreements and no contradictions**.  That is the
only reason it is trusted here.

⚠ BUT THEY ARE NOT INDEPENDENT WITNESSES, AND I OVERSOLD THAT.  Grok,
2026-08-10: every genuinely hard word — εἶναι, ἄλλα/ἅλλα, οἷον/οἶον,
ἄνθρωπος/ἅνθρωπος — falls in the 879 both-are-real bucket, OUTSIDE the
agreement claim entirely.  The two agree where standard orthography is
uncontested, because both encode the same standard.  So zero contradictions
means "no mechanical fault", not "confirmed by a second opinion".

⚠ AND A GLUED WORD CAN MATCH A REAL ONE.  Grok found the one wrong proposal:
`χȣ̔́τω` at page-050-R:50.  The reader glued the χ of `οὐχ` onto `οὕτω`, and the
result happens to be Morpheus's crasis entry `χοὔτω`, which is smooth-only — so
the module proposes smooth, while the printed rough belongs to οὕτω and is
CORRECT.  Applying it would erase good ink.  The lesson is not about crasis: an
OCR failure that produces a real Greek word is invisible to an authority that
only asks "is this a word?".

⚠ IT IS MATCHED ON LETTERS AND BREATHING, NEVER ON ACCENT.  Bonitz's accents are
his edition's and Morpheus generates its own; a grave where it writes an acute
is not a disagreement about anything.  Comparing the full form would turn every
such difference into a false finding.

⚠ AND IF IT IS MISSING, THAT IS A FAULT.  The file ships inside Diogenes, 120MB,
and the corpus pipeline reads the same one for stage-4 morphology.  An oracle
that answers "I cannot say" because its authority quietly vanished is the exact
mistake this module exists to stop making, so absence raises.

    python3 -m bonitz_pipeline.morpheus            # what it can decide
"""

from __future__ import annotations
import argparse
import collections

import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

from bonitz_pipeline.breathing_oracle import WORD, breathing, skeleton

ROOT = Path(__file__).resolve().parent.parent
ANALYSES = Path('/Applications/Diogenes.app/Contents/dependencies/data'
                '/greek-analyses.txt')

LETTER = dict(zip('abgdezhqiklmncoprstufxyw', 'αβγδεζηθικλμνξοπρστυφχψω'))
# Morpheus writes the marks after the vowel they sit on, which is exactly where
# a combining character belongs, so no reordering is needed.
MARK = {')': '̓', '(': '̔', '/': '́', '\\': '̀',
        '=': '͂', '|': 'ͅ', '+': '̈', "'": '᾽', ',': ','}
DROP = '_^*'          # vowel length, and the marker for a capital

# ⚠ ONE ELISION MARK, THREE CHARACTERS. Bonitz's readers set U+1FBD, U+1FBF or
# U+2019 for the same apostrophe; Morpheus writes ASCII. Folding them is what
# makes `ἀλλ᾽` and `a)ll'` the same word.
ELISION = {'᾽': '᾽', '᾿': '᾽', '’': '᾽', "'": '᾽'}


def greek(raw: str) -> str | None:
    """A Morpheus beta-code key as Greek, or None if it holds anything else."""
    out = []
    for ch in raw:
        if ch in LETTER:
            out.append(LETTER[ch])
        elif ch in MARK:
            out.append(MARK[ch])
        elif ch not in DROP:
            return None
    s = unicodedata.normalize('NFC', ''.join(out))
    return s[:-1] + 'ς' if s.endswith('σ') else s


def key(w: str) -> str:
    """The lookup key: letters only, and final sigma folded.

    ⚠ MORPHEUS WRITES `σ` WHERE BONITZ WRITES `ς`, because beta code has one
    sigma and Greek type has two. Without this fold every word ending in -ς —
    most nouns and adjectives, `ἁλουργός` among them — missed in silence while
    the coverage count looked healthy. Fourth time today that an unfolded
    character quietly stopped a lookup instead of failing it.

    ⚠ AND THE ELISION MARK IS FOUR CHARACTERS ACROSS THE TWO SOURCES. Before
    folding it, `greek()` rejected every key holding an apostrophe outright —
    15,072 of them, every elided form Morpheus generates — and the index simply
    came up 1.7% smaller with nothing to show that it had.
    """
    s = skeleton(w).replace('ς', 'σ')
    return ''.join(ELISION.get(c, c) for c in s)


@lru_cache(maxsize=1)
def index() -> dict[str, set[str]]:
    """skeleton -> the breathings Greek actually admits for it.

    ⚠ THE FIRST 352 LINES OF THE FILE ARE A DIFFERENT SHAPE. They carry a `!`
    and their key is breathing-STRIPPED, so reading them as ordinary entries
    makes the file look like it disagrees with Aristotle 4% of the time. It
    does not; those lines were being asked a question they do not answer.

    ⚠ AND ITS ABSENCE IS A BREAKAGE, NOT A CONFIGURATION. This first returned an
    empty index when the file was missing, so a moved or upgraded Diogenes would
    have switched the authority off and left every count looking merely
    cautious. That is the same failure that has cost this module four separate
    bugs in one day. Diogenes is installed here; there is no machine in this
    project where absence is normal, so absence is a fault and says so.
    """
    if not ANALYSES.exists():
        raise FileNotFoundError(
            f'Morpheus is not at {ANALYSES}. It ships inside Diogenes, and the '
            f'corpus pipeline reads the same file for stage-4 morphology — so '
            f'this is a moved or broken install, not a machine without it.')
    out: dict[str, set[str]] = collections.defaultdict(set)
    with ANALYSES.open(encoding='utf-8', errors='replace') as fh:
        for line in fh:
            raw = line.split('\t', 1)[0]
            if raw.startswith('!'):
                continue
            g = greek(raw)
            if g:
                out[key(g)].add(breathing(g))
    return dict(out)


def decide(word: str) -> tuple[str, str] | None:
    """(breathing, the evidence), or None where Greek admits both."""
    known = index().get(key(word))
    if not known:
        return None
    marked = known - {'none'}
    if len(marked) != 1:
        return None                 # both are real Greek; only the ink decides
    only = marked.pop()
    return only, f'Greek has only the {only} form'


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--show', type=int, default=40)
    a = p.parse_args(argv)

    idx = index()
    print(f'{len(idx):,} skeletons\n')

    from bonitz_pipeline.breathing_oracle import decide as lexicon
    same = contra = both = absent = unbreathed = clash = 0
    rows = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        for n, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            for m in WORD.finditer(line):
                w = m.group(0)
                if breathing(w) == 'none' or len(skeleton(w)) < 4:
                    continue
                if line[m.end():m.end() + 1] in ('.', '-'):
                    continue
                got = decide(w)
                if got is None:
                    # ⚠ SILENCE HAS THREE CAUSES AND THEY ARE NOT THE SAME.
                    # Codex, 2026-08-10: `̓γίγνεται` (a stray combining
                    # breathing) keys to γιγνεται, whose only recorded value is
                    # 'none' — no second spelling exists, yet it was counted
                    # under "both are real Greek". A tally that files unknowns
                    # as ambiguity overstates how much the language is genuinely
                    # undecided, which is the number this module is judged on.
                    marks = (idx.get(key(w)) or set()) - {'none'}
                    if len(marks) > 1:
                        both += 1
                    elif key(w) in idx:
                        unbreathed += 1
                    else:
                        absent += 1
                    continue
                if got[0] == breathing(w):
                    same += 1
                else:
                    contra += 1
                    rows.append((f.stem, n, w, got[0]))
                other = lexicon(w)
                if other and other[0] != got[0]:
                    clash += 1
    print(f'  {same:>5,} confirmed as printed')
    print(f'  {contra:>5,} Greek has ONLY the other breathing')
    print(f'  {both:>5,} both spellings are real words — silent')
    print(f'  {unbreathed:>5,} Morpheus has it, but with no breathing at all')
    print(f'  {absent:>5,} not a form Morpheus generates\n')
    print(f'  {clash:>5,} contradict the lexicon oracle '
          f'(any number but 0 needs explaining)\n')
    for col, n, w, want in rows[:a.show]:
        print(f'  {col}:{n:<4} {w:<18} is {breathing(w):<6} but Greek has only '
              f'the {want} form')
    if len(rows) > a.show:
        print(f'  … and {len(rows) - a.show} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
