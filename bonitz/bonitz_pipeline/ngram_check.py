"""Bonitz's Greek, n-gram by n-gram, against Aristotle's own text.

John, 2026-08-10: *"There are numerous n-grams in Bonitz, so can't we check his
Greek n-grams? We'd have to recognize that there may be ngrams in Bonitz that
aren't in Aristotle because he gives snippets, so words will be close to each
other that aren't in Aristotle. But we filter out false mismatches by isolating
and chunking quotations in Bonitz."*

That is the whole design, and the caveat is the load-bearing half of it.

⚠ THE BOUNDARIES ARE WHERE HE IS NOT QUOTING CONTINUOUSLY.  `… τὸ ȣ͂ ἕνεκα ϗ̀ τὸ
τέλος sim Ηα1. 1094a3` puts `τέλος` next to `sim`, and a naive 3-gram over that
run asks Aristotle for a sequence no one ever wrote.  Every such join is a false
mismatch, and there are more of them than there are real findings — so the
chunking is not a refinement, it is the difference between a report and noise.

A chunk ends at: a citation, one of Bonitz's Latin editorial words, a stop, a
comma, a colon, a bracket, an em-dash.  It does NOT end at a line break —
Bonitz's column wraps mid-quotation, and treating that as a boundary is the
same error that hid 790 citations until it was fixed.

⚠ AND IT IS BLIND TO MARKS.  Matching is diacritic-free, because Bonitz's
accentuation is his own and our text is a different edition's.  Breathings and
accents belong to `breathing_oracle` and `accent_law`; this checks the WORDS.

    python3 -m bonitz_pipeline.ngram_check --pages 15-52
    python3 -m bonitz_pipeline.ngram_check --pages 15-52 -n 4
"""

from __future__ import annotations
import argparse
import glob
import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

from bonitz_pipeline.siglum_check import CITE

ROOT = Path(__file__).resolve().parent.parent
DIST = Path('/Users/johnboyer/Developer/aristotle-reader/build/dist')

# Bonitz's editorial Latin. Where one of these stands, the quotation has ended.
LATIN = (r'\b(?:sim|cf|al|opp|syn|sive|def|veluti|item|coll|vid|not|i\s?e|'
         r'passim|ib|ibid|sqq|etc|est|sunt|dist|fort|codd|vl|ci|pass|'
         r'usurpata|enumerantur|distinguuntur|refutatur|notio|species)\b')
BREAK = re.compile(rf'[.,;:·()\[\]—–]|{LATIN}|[A-Za-z]{{2,}}')


def strip(s: str) -> str:
    s = s.replace('ȣ', 'ου').replace('ϗ', 'και')
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^α-ω\s]+', ' ', s)


@lru_cache(maxsize=1)
def aristotle() -> str:
    """The whole corpus as one stripped stream, for substring lookup."""
    buf = []
    for p in glob.glob(str(DIST / '*/book-*.json')):
        for seg in json.loads(Path(p).read_text(encoding='utf-8')).get('segments', []):
            for g in seg.get('greek', []):
                buf.append(strip(g['text']))
    return ' ' + re.sub(r'\s+', ' ', ' '.join(buf)) + ' '


def chunks(text: str) -> list[str]:
    """Bonitz's continuous Greek runs, with every non-quotation cut out.

    Citations go first: they sit INSIDE quotations as often as between them,
    and a citation's own letters would otherwise join the words either side.
    """
    text = CITE.sub(' | ', text)
    text = BREAK.sub(' | ', text)
    return [' '.join(strip(p).split()) for p in text.split('|')]


def grams(chunk: str, n: int) -> list[str]:
    w = chunk.split()
    return [' '.join(w[i:i + n]) for i in range(len(w) - n + 1)]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--pages', default='15-52')
    p.add_argument('-n', type=int, default=3)
    p.add_argument('--show', type=int, default=25)
    a = p.parse_args(argv)
    lo, _, hi = a.pages.partition('-')
    rng = range(int(lo), int(hi or lo) + 1)

    corpus = aristotle()
    found = missing = 0
    rows = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        if int(f.stem.split('-')[1]) not in rng:
            continue
        text = f.read_text(encoding='utf-8')
        # ⚠ THE LINE BREAK IS NOT A BOUNDARY, and this loop made it one — the
        # module's own docstring says so and the code did the opposite. A
        # quotation wrapping the column yields no n-gram across the break.
        lines = text.splitlines()
        for ln in range(1, len(lines) + 1):
            line = lines[ln - 1] + (' ' + lines[ln] if ln < len(lines) else '')
            for ch in chunks(line):
                for g in grams(ch, a.n):
                    if f' {g} ' in corpus:
                        found += 1
                    else:
                        missing += 1
                        rows.append((f.stem, ln, g))
    tot = found + missing
    print(f'{tot:,} {a.n}-grams inside Bonitz\'s quotations, pages {a.pages}')
    if tot:
        print(f'  {found:>7,} occur in Aristotle  ({100*found/tot:.1f}%)')
        print(f'  {missing:>7,} do not             ({100*missing/tot:.1f}%)\n')
    for col, ln, g in rows[:a.show]:
        print(f'  {col}:{ln:<4} {g}')
    if len(rows) > a.show:
        print(f'  … and {len(rows) - a.show:,} more')
    return 0


if __name__ == '__main__':
    sys.exit(main())
