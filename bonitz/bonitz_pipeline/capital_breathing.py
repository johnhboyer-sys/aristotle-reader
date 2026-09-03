"""The breathing this book prints BEFORE a capital, put on the capital.

    python3 -m bonitz_pipeline.capital_breathing            # what would change
    python3 -m bonitz_pipeline.capital_breathing --write

⚠ NOT AN APOSTROPHE, AND `elision` DELIBERATELY REFUSED TO TOUCH IT. Bonitz
sets a lemma's initial breathing in front of its capital — `'Ἀλκιδάμας`,
`᾽Αμιναῖος` — and OCR turns that into a loose apostrophe or koronis with no
direction in it. Folding those to U+2019 with the elision marks would have
spelt a quotation mark where the page prints a breathing. John, 2026-08-15:
"for mark+capital, drop the loose one... for mark+bare capital, encode
breathing on the capitals."

Two shapes, and the first needs no judgement at all:

    mark + a capital that ALREADY carries its breathing   drop the mark
    mark + a BARE capital                                 breathe the capital

⚠ THE MARK CANNOT SAY WHICH BREATHING, so this does not read it. Neither
U+0027 nor U+1FBD is directional, and guessing would be the failure this
project keeps naming — an authority claiming more than its evidence.

⚠ NOR DOES THE LETTER SETTLE IT. The first version of this counted breathings
per capital and made capital alpha unanimous at 189 smooth to 0 rough. It was
counting one level of decomposition, so it never saw `Ἅιδης`, `Ἅιδȣ`, `Ἅλυς`
and `Ἅλυν` — four rough capital alphas hiding under an added accent. The real
figure is 215 to 4, and those four are correct: the breathing is a property of
the WORD, and no per-letter count can supply it.

So the evidence is a STEM the corpus already breathes: at least six letters,
diacritics stripped, and unanimous across every word that shares them.
`Αλκμαίων` is settled by `Ἀλκμαιωνίδαι`, `Αμμωνιάς` by `Ἀμμωνι-`, and the
lemma abbreviation `Α.` by the 26 standalone `Ἀ` the corpus already holds.
A site with no such stem keeps its loose mark, is REPORTED, and goes to John
on a card offering him both breathings — which is what `hand_cards` is for.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

from bonitz_pipeline import elision

WORD = re.compile(r'[^\W\d_]+', re.UNICODE)

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'

PSILI, DASIA = '̓', '̔'
# How many letters of a word must match a breathed word already in the corpus
# before that word's breathing counts as evidence. Four is not enough:
# `Αστυδά-` would then be settled by `Ἀστυπαλαίας`, which is a different name.
STEM = 6


def _base(ch: str) -> str | None:
    """The letter under a precomposed character, or None when it is not one.

    ⚠ A DECOMPOSITION IS NOT ALWAYS A LETTER PLUS A MARK. Unicode writes
    `<super>` and other compatibility tags in the same field, and reading one
    of those as a codepoint raises on the first superscript in the corpus —
    of which a Bekker reference has thousands.
    """
    d = unicodedata.decomposition(ch).split()
    if not d or d[0].startswith('<'):
        return None
    return chr(int(d[0], 16))


def _breathe(cap: str, mark: str) -> str:
    return unicodedata.normalize('NFC', cap + mark)


def _bare(ch: str) -> bool:
    """A Greek capital with no breathing on it."""
    if not ('GREEK' in unicodedata.name(ch, '') and ch.isupper()):
        return False
    return not unicodedata.decomposition(ch)


def _letters(w: str) -> str:
    """A word with every diacritic taken off — the key a stem matches on."""
    return ''.join(c for c in unicodedata.normalize('NFD', w)
                   if not unicodedata.combining(c))


def _breathing_of(w: str) -> str:
    """The breathing on this word's FIRST letter, or ''."""
    d = unicodedata.normalize('NFD', w)
    marks = ''
    j = 1
    while j < len(d) and unicodedata.combining(d[j]):
        marks += d[j]
        j += 1
    return PSILI if PSILI in marks else DASIA if DASIA in marks else ''


def census(text: str) -> dict[str, collections.Counter]:
    """{stem: {mark: n}} for every capital-initial breathed word — the only
    thing that decides a direction."""
    out: dict[str, collections.Counter] = collections.defaultdict(
        collections.Counter)
    for w in WORD.findall(unicodedata.normalize('NFC', text)):
        if not w[:1].isupper():
            continue
        if (mark := _breathing_of(w)):
            out[_letters(w)][mark] += 1
    return out


def direction(word: str, seen: dict[str, collections.Counter]) -> str:
    """The breathing the corpus already puts on this word's stem, or ''.

    ⚠ UNANIMOUS, AND ON A STEM LONG ENOUGH TO BE THE SAME NAME. A word the
    corpus breathes both ways, or one whose only match is six letters of
    somebody else's name, is a word no count can settle.
    """
    key = _letters(word)
    # ⚠ AN EXACT MATCH IS THE SAME WORD, and it outranks any prefix. The lemma
    # abbreviation `Α.` is one letter, so a prefix test compares it with every
    # capital-alpha word in the book and finds `Ἅιδης` among them — while the
    # corpus holds the standalone `Ἀ` 26 times and `Ἁ` never.
    if key in seen and len(seen[key]) == 1:
        return next(iter(seen[key]))
    n = max(STEM, 1) if len(key) > STEM else len(key)
    got = collections.Counter()
    for stem, marks in seen.items():
        if stem[:n] == key[:n]:
            got.update(marks)
    if len(got) == 1:
        return next(iter(got))
    return ''


def fix(text: str,
        seen: dict[str, collections.Counter]) -> tuple[str, list[str]]:
    """(text, [why]) — and a reason for every loose mark left as printed."""
    src = unicodedata.normalize('NFC', text)
    mine = set(elision.unfolded(src))
    out, left, i = [], [], 0
    while i < len(src):
        ch, nxt = src[i], src[i + 1] if i + 1 < len(src) else ''
        if ch not in elision.MARKS or i not in mine or not nxt:
            out.append(ch)
            i += 1
            continue
        if not ('GREEK' in unicodedata.name(nxt, '') and nxt.isupper()):
            left.append('the next character is not a Greek capital')
            out.append(ch)
            i += 1
            continue
        if not _bare(nxt):
            # ⚠ NO EVIDENCE NEEDED HERE. The OCR produced the breathing twice,
            # once loose and once on the letter, and the letter's is the one
            # that says which way it faces. Drop the loose one.
            i += 1
            continue
        m = WORD.match(src, i + 1)
        word = m.group() if m else nxt
        mark = direction(word, seen)
        if not mark:
            left.append(f'no breathed stem in the corpus for {word!r}')
            out.append(ch)
            i += 1
            continue
        out.append(_breathe(nxt, mark))
        i += 2
    return ''.join(out), left


@lru_cache(maxsize=1)
def corpus_census() -> dict[str, tuple[tuple[str, int], ...]]:
    """The census of the corpus as it stands, read once."""
    out: dict[str, collections.Counter] = collections.defaultdict(
        collections.Counter)
    for f in sorted(RECONCILED.glob('*.txt')):
        for k, v in census(f.read_text(encoding='utf-8')).items():
            out[k].update(v)
    return out


def normalize(text: str) -> str:
    """Text spelt the way the corpus now spells it.

    ⚠ A CARD'S GROUND TRUTH COMES FROM THE OCR TARGETS, NOT THE CORPUS, so
    every sweep over `work/reconciled` makes the two diverge and `locate`
    stops finding the line. One `none` ruling refused for exactly this the
    hour these breathings were swept up.
    """
    return fix(text, corpus_census())[0]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--write', action='store_true')
    a = p.parse_args(argv)

    files = sorted(RECONCILED.glob('*.txt'))
    seen: dict[str, collections.Counter] = collections.defaultdict(
        collections.Counter)
    for f in files:
        for k, v in census(f.read_text(encoding='utf-8')).items():
            seen[k].update(v)

    sites, left_alone = [], []
    for f in files:
        old = f.read_text(encoding='utf-8')
        out = []
        for ln, line in enumerate(old.splitlines(), 1):
            got, left = fix(line, seen)
            out.append(got)
            if got != line:
                sites.append(f'{f.stem}:{ln}\n      was  {line[:56]}\n'
                             f'      now  {got[:56]}')
            for why in left:
                left_alone.append(f'{f.stem}:{ln}  {why}\n'
                                  f'      {line[:56]}')
        new = '\n'.join(out) + ('\n' if old.endswith('\n') else '')
        if a.write and new != old:
            f.write_text(new, encoding='utf-8')

    print(f'{len(sites)} lines change:')
    for s in sites:
        print('  ', s)
    print(f'\n{len(left_alone)} loose marks left exactly as printed — each '
          f'wants a card, not a guess:')
    for s in left_alone:
        print('  ', s)
    if not a.write:
        print(f'\nDRY RUN — re-run with --write to fix '
              f'{RECONCILED.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
