"""John's rulings on the mark queue are ground truth, so a later pass must
not be able to undo one silently.

`tests/fixtures/john-rulings.json` guards the 44 hand rulings of 2026-07-24/25,
and its test is the only thing that caught the two ἁλι- words a later pass had
"corrected" away from the ink.  The rulings John clicked through the review
server on 2026-08-08 had no such guard until this file existed.

Two claims are tested, and they are different:

  APPLIED   the form he chose is still in the line.  If a sweep, a family
            propagation or a future correction overwrites it, this goes red.
  KEEP      the form he declined to change is still there.  A "keep" is a
            ruling too — it says the corpus was already right — and it is the
            one most easily lost, because nothing about the text records that
            a human looked at it and approved it.

The rulings live in `work/sweeps/mark-rulings.json`, written by
`bonitz_pipeline.review_server` as he clicked.  `applied` says whether the
ruling was written into `work/reconciled`; the four he marked unsure are
skipped, since he deliberately made no claim about them.
"""

import json
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
RULINGS = ROOT / 'work/sweeps/mark-rulings.json'


def _canon(s: str) -> str:
    """NFC with the two encodings of the printed circumflex unified.

    The corpus writes the perispomeni and some readers write a combining
    tilde; they are the same printed mark, and `verdict_drift` learned the
    hard way that comparing them raw reports every ligature ruling as lost.
    """
    return unicodedata.normalize('NFC', s.replace('̃', '͂'))


def _load():
    if not RULINGS.exists():
        return []
    out = []
    for key, r in json.loads(RULINGS.read_text(encoding='utf-8'))['rulings'].items():
        col, line, corpus = key.rsplit(':', 2)
        applied = r.get('applied', '')
        if applied.startswith('no — unsure'):
            continue
        want = r.get('written') or corpus
        out.append(pytest.param(col, int(line), want, applied,
                                id=f'{col}:{line}'))
    return out


CASES = _load()


def test_the_rulings_file_is_present_and_populated():
    """A missing or emptied rulings file must fail loudly rather than turn
    every case below into a silent pass."""
    assert CASES, f'no rulings found in {RULINGS}'


@pytest.mark.parametrize('col,line,want,applied', CASES)
def test_johns_ruling_still_stands(col, line, want, applied):
    f = ROOT / 'work/reconciled' / f'{col}.txt'
    assert f.exists(), f'{col} is gone'
    lines = f.read_text(encoding='utf-8').splitlines()
    assert line <= len(lines), f'{col} no longer has a line {line}'
    assert _canon(want) in _canon(lines[line - 1]), (
        f'John ruled {want!r} at {col}:{line} ({applied}) and the line no '
        f'longer contains it:\n  {lines[line - 1].strip()}')
