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

⚠ MEASURED AGAINST THE EXISTING ORACLE ON THE WHOLE CORPUS: 4,214 words where
both authorities speak, **4,214 agreements and no contradictions**.  That is the
only reason it is trusted here.

⚠ IT IS MATCHED ON LETTERS AND BREATHING, NEVER ON ACCENT.  Bonitz's accents are
his edition's and Morpheus generates its own; a grave where it writes an acute
is not a disagreement about anything.  Comparing the full form would turn every
such difference into a false finding.

⚠ AND IT IS NOT INSTALLED EVERYWHERE.  The file ships inside Diogenes, 120MB,
and this module returns silence rather than failing when it is absent.

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
        '=': '͂', '|': 'ͅ', '+': '̈'}
DROP = '_^*'          # vowel length, and the marker for a capital


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
    """
    return skeleton(w).replace('ς', 'σ')


@lru_cache(maxsize=1)
def index() -> dict[str, set[str]]:
    """skeleton -> the breathings Greek actually admits for it.

    ⚠ THE FIRST 352 LINES OF THE FILE ARE A DIFFERENT SHAPE. They carry a `!`
    and their key is breathing-STRIPPED, so reading them as ordinary entries
    makes the file look like it disagrees with Aristotle 4% of the time. It
    does not; those lines were being asked a question they do not answer.
    """
    out: dict[str, set[str]] = collections.defaultdict(set)
    if not ANALYSES.exists():
        return {}
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
    if not idx:
        print(f'Morpheus is not installed at {ANALYSES}')
        return 0
    print(f'{len(idx):,} skeletons\n')

    from bonitz_pipeline.breathing_oracle import decide as lexicon
    same = contra = both = absent = clash = 0
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
                    if key(w) in idx:
                        both += 1
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
