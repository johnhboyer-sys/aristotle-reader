"""No combining mark may sit on a space.

A mark belongs to a letter. When the space lands before the mark instead of
after it — `τȣ ͂λόγȣ` for `τȣ͂ λόγȣ` — the circumflex is divorced from the
ligature it was set over, and nothing in this pipeline could see it: every
sweep tokenises first, and a mark on a space belongs to no token. Four sites
survived every check the project has, and were found only when a kraken
training run put three of them into the model's own targets, teaching it that
a mark can follow a space.

John ruled all four against the 400 dpi ink on 2026-08-12 — three were the
space written before the circumflex, one a doubled breathing — and they are
recorded in `work/rulings/john.json`. This is the check that was missing.

⚠ THE COUNT IS ASSERTED AS WELL AS THE VERDICT. A test that only says "no
findings" passes just as happily against a corpus it never read.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

RECONCILED = Path(__file__).resolve().parent.parent / 'work' / 'reconciled'
ORPHAN = re.compile(r'(?<=\s)[̀-ͯ]')


def orphans() -> list[str]:
    out = []
    for f in sorted(RECONCILED.glob('page-*.txt')):
        for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            d = unicodedata.normalize('NFD', line)
            for m in ORPHAN.finditer(d):
                out.append(f'{f.stem}:{i} …{d[max(0, m.start() - 14):m.start() + 8]}…')
    return out


def test_the_corpus_was_actually_read():
    """Volume before verdict: an empty glob would make the next test vacuous."""
    cols = list(RECONCILED.glob('page-*.txt'))
    assert len(cols) >= 96, f'only {len(cols)} columns found in {RECONCILED}'


def test_no_combining_mark_sits_on_a_space():
    found = orphans()
    assert not found, (
        'a combining mark is sitting on a space — it belongs on the letter '
        'before it, and no word-level sweep can see it there:\n  '
        + '\n  '.join(found))
