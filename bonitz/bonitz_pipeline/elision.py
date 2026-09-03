"""One codepoint for the mark that stands after a Greek letter.

    python3 -m bonitz_pipeline.elision            # what would change
    python3 -m bonitz_pipeline.elision --write

⚠ FOUR BUNDLES ASKED JOHN THE SAME QUESTION FOUR WAYS. `pattern:᾽-'`,
`pattern:’-'`, `pattern:'-’` and `pattern:’-∅` were all on the queue at once,
and every one of them is the same mark: the elision apostrophe of `καθ’ ἓν`.
The ink prints ONE shape. Which codepoint comes out is an artifact of whose
OCR pass produced the line, not a reading, and the engines carry no
information about it — the same argument the glyph-pair cards already make
for `A`/`Α`. John, 2026-08-15: "these elision cards are annoying. we need to
pick which one and then just stick with it."

**The choice is U+2019 RIGHT SINGLE QUOTATION MARK.** U+1FBD GREEK KORONIS is
a spacing compatibility form and Unicode names U+2019 as its preferred
representation; U+0027 APOSTROPHE is the typewriter mark, a transcription
artifact with no place in set Greek. U+2019 is also what TLG and Perseus
spell elision with, so a reader built on this corpus matches every other one.

⚠ AND THIS DOES NOT BREAK THE DIPLOMATIC RULE. `work/reconciled` records what
the compositor printed, and he printed one mark; three codepoints for it is
the pipeline's noise, not the page's. What WOULD break the rule is folding
the two other jobs this shape does in Bonitz, so the test is deliberately
narrow:

    fold ONLY when the mark stands immediately after a Greek letter

That is elision (`δ’ ἄλλος`, `ἐφ’ ὅσοις`) and a closing quotation mark, which
wants U+2019 anyway. It leaves alone, untouched and REPORTED:

  * the breathing printed BEFORE a capital, as this book sets its lemmas —
    `'Ἀλκιδάμας`, `᾽Αμιναῖος`. That is not an apostrophe at all, and it is
    its own defect, wanting its own sweep.
  * an OPENING quotation mark, which wants U+2018 and would be reversed by
    a blind fold — `('duo diversa insecta')`, `᾽ceterum, tamen᾽`.
  * aphaeresis, where the mark leads the word: `’νόματος` for ὀνόματος.

32 sites in the corpus fall outside the test, and `main` prints every one of
them: a fold that quietly reported only what it changed would leave nobody
looking at the cases it could not judge ([[absence-rendered-as-clean]]).
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'

CHOSEN = '’'                 # RIGHT SINGLE QUOTATION MARK
MARKS = (chr(0x27), chr(0x1FBD), chr(0x2019))   # APOSTROPHE, KORONIS, U+2019
_MARK = re.compile(f'[{"".join(MARKS)}]')

# ⚠ THE OU LIGATURE IS GREEK TEXT AND UNICODE CALLS IT LATIN. `ȣ` is U+0223
# LATIN SMALL LETTER OU, and it is on nearly every line of this corpus; a
# `GREEK in the name` test alone would refuse to fold `τȣ’` and leave one
# spelling behind for no reason anybody could see.
_GREEK_TOO = 'ȣȢ'


def _greek_before(text: str, i: int) -> bool:
    """Is the character before position `i` a Greek letter?

    Combining marks are stepped over: a breathing or an accent belongs to the
    letter under it, so `ȣ̓’` is a mark after a letter, not after a comma.
    """
    j = i - 1
    while j >= 0 and unicodedata.combining(text[j]):
        j -= 1
    if j < 0:
        return False
    c = text[j]
    return c in _GREEK_TOO or 'GREEK' in unicodedata.name(c, '')


def fold(text: str) -> str:
    """Every mark standing after a Greek letter, spelt U+2019."""
    return _MARK.sub(
        lambda m: CHOSEN if _greek_before(text, m.start()) else m.group(),
        text)


def unfolded(text: str) -> list[int]:
    """Where a mark was left as printed — the cases the test cannot judge."""
    return [m.start() for m in _MARK.finditer(text)
            if not _greek_before(text, m.start())]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--write', action='store_true')
    a = p.parse_args(argv)

    folded = left = 0
    sites = []
    for f in sorted(RECONCILED.glob('*.txt')):
        old = f.read_text(encoding='utf-8')
        new = fold(old)
        folded += sum(1 for x, y in zip(old, new) if x != y)
        for ln, line in enumerate(old.splitlines(), 1):
            for i in unfolded(line):
                left += 1
                sites.append(f'{f.stem}:{ln}  …{line[max(0, i - 18):i + 18]}…')
        if a.write and new != old:
            f.write_text(new, encoding='utf-8')

    print(f'{folded} marks spelt U+2019 — the mark after a Greek letter')
    print(f'{left} left exactly as printed, because the test cannot judge '
          f'them:\n')
    for s in sites:
        print('  ', s)
    print(f'\nThose are breathings printed before a capital, opening quotes, '
          f'and aphaeresis. Each is a different mark doing a different job, '
          f'and none is an elision.')
    if not a.write:
        print(f'\nDRY RUN — re-run with --write to fold '
              f'{RECONCILED.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
