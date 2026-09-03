"""One space between a siglum and the number after it — a DISPLAY rule.

    python3 -m bonitz_pipeline.siglum_space            # measure, over the corpus
    python3 -m bonitz_pipeline.siglum_space --show 20

John's ruling, 2026-08-13: *"space after sigla before both chapter number or
bekker (for bookless works)"*, and at 14:21, decisively, on where it belongs:

    that's how we render it for both the site AND the future PDF… Bonitz
    isn't trying to do any work with it, it's just how much space he had
    per line.

⚠ SO THIS MODULE WRITES NOTHING, AND THAT IS ITS WHOLE POINT. It was first
built to rewrite `work/reconciled` and was never run, because that is the
wrong layer: the corpus is the diplomatic record of what the compositor set,
and the gap is presentation. `space_sigla` is a pure function a renderer
calls on its way to a screen or a page. There is deliberately no `--apply`,
no path argument, and no writer — see the test that fails if one comes back.

⚠ AND IT MUST NEVER REACH KRAKEN OR CALAMARI. This is John's own concern
(2026-08-13) and it is well founded: the training corpora are built from
`work/reconciled` by `kraken_corpus`, and spacing every siglum there would
teach the model a gap the ink does not always print — the same defect that
`kraken_corpus.BEKKER_SPACE` exists to prevent, pointed the other way. A
corpus split between two spellings of one thing trains the model on a coin
flip. Because the rule lives here and touches no file, the training targets
cannot see it; `tests/test_siglum_space.py` pins that they do not.

WHAT THE INK ACTUALLY DOES, measured over the 96 reconciled columns, because
the rule is a convention and should not pretend to be a reading:

  * Bonitz SPACES a chapter number off its siglum (`Ηε 10.`, `Μδ 22.`) and
    sets a bookless-work Bekker page TIGHT (`οβ1350`). The gap is doing work
    in the ink — it says which kind of number follows.
  * The corpus records 6,020 chapters tight against 72 spaced, so the 98.8%
    majority is a TRANSCRIPTION HABIT, not Bonitz. This rule therefore
    changes which convention we display; it does not start normalising a
    text that was faithful before.
  * Nothing becomes ambiguous when the gap is made uniform, because the
    punctuation still distinguishes the two: a chapter is followed by a full
    stop and then the Bekker page (`Ηε 10. 1135a24`), a Bekker page by its
    column letter and line (`οβ 1350 b33`).

No consumer is wired to this yet. `/bonitz` is 404 on live until the XSS fix,
the PDF does not exist, and `transcription_doc` advertises itself as the
diplomatic text — putting a display convention into that document is John's
call, not this module's.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'

# A work siglum: one capital or lower-case Greek letter, then up to two more
# book letters. `ȣ` is excluded — it is the ou-ligature, never a siglum.
SIG = r'(?<![Α-Ωα-ωϗȣ])([Α-Ωα-ωϗ][α-ωϗ]{0,2})'
# … followed by a chapter (a small number closed by a stop) or, in a bookless
# work, the Bekker page itself (which carries its column letter).
CHAPTER = re.compile(SIG + r'(\d{1,3})\.')
BEKKER = re.compile(SIG + r'(\d{2,4})(?=\s?[ab]\d)')


def space_sigla(text: str) -> str:
    """`text` as it should be DISPLAYED: one space after every siglum.

    Idempotent, because the patterns require the number to sit directly on
    the siglum — text that already carries the gap simply does not match.
    That matters for a render rule, which may be applied to a fragment that
    has been through it before.
    """
    return space_counted(text)[0]


def space_counted(text: str) -> tuple[str, int]:
    """(displayed text, how many gaps were opened) — the counting form, so a
    report can state its volume rather than just its verdict."""
    n = 0

    def sub(m: re.Match) -> str:
        nonlocal n
        n += 1
        return f'{m.group(1)} {m.group(2)}'

    out = CHAPTER.sub(lambda m: sub(m) + '.', text)
    return BEKKER.sub(sub, out), n


def measure(files: list[Path]) -> tuple[list[tuple[str, int, str, str]], Counter]:
    """Every line the rule would display differently. Reads; writes nothing."""
    if not files:
        raise SystemExit(f'no columns to read — is {RECONCILED} empty?')
    changes, c = [], Counter()
    for f in files:
        for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            c['lines'] += 1
            new, n = space_counted(line)
            if new != line:
                c['lines displayed differently'] += 1
                c['gaps opened'] += n
                changes.append((f.stem, i, line, new))
        c['columns'] += 1
    return changes, c


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--show', type=int, default=12,
                   help='how many differing lines to print')
    a = p.parse_args(argv)

    changes, c = measure(sorted(RECONCILED.glob('page-*.txt')))
    for stem, i, old, new in changes[:a.show]:
        print(f'  {stem}:{i}')
        print(f'    corpus   {old[:86]}')
        print(f'    display  {new[:86]}')
    print(f'\n{c["columns"]} columns, {c["lines"]} lines read')
    print(f'  lines displayed differently: {c["lines displayed differently"]}')
    print(f'  gaps opened:                 {c["gaps opened"]}')
    print('\nThis is a RENDER rule. Nothing was written, and nothing can be: '
          'work/reconciled\n  keeps the diplomatic record, and the training '
          'corpora are built from it.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
