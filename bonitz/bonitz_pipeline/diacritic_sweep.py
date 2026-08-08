"""
Find the marks the corpus lost — the class `fold()` cannot see.

`compare3`/`compare4` judge a disagreement region on `fold(...)`, which strips
every accent and breathing and folds the iota subscript away.  Two readings
that differ only in a mark are therefore the SAME reading to the comparator:
no region, no flag, no review page.  Measured 2026-08-07:

    fold('ζώων') == fold('ζῴων')        fold('ζώῳ') == fold('ζῴῳ')

Seven `ζῴων`/`ζῴῳ` had lost their subscript in `work/reconciled/`, inherited
from the Opus spine, and the panel never once surfaced them — John found the
first two by reading 37 lines with his own eyes.  LlamaParse had every one of
them right.

So: use LlamaParse as the reference on marks.  It is the strongest reader we
have measured on this axis (18/18 against John's rulings, and 146 `ζῴων` with
zero `ζώων` across the whole best-of run), and it is independent of the Opus
spine the corpus is built from.

    python3 -m bonitz_pipeline.diacritic_sweep
    python3 -m bonitz_pipeline.diacritic_sweep --min-support 5 --marks subscript

Output: `work/sweeps/diacritic-candidates.tsv`, one row per suspect word form,
ranked by how confidently LlamaParse disagrees.  Nothing is applied.  This
hands John a queue and the ink decides — the same contract as
`ligature_sweep`.
"""

from __future__ import annotations
import argparse
import glob
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from .normalize import clean_llamaparse, clean_opus, fold

ROOT = Path(__file__).resolve().parent.parent

# A word: Greek letters, the two ligatures, combining marks, internal apostrophe.
WORD = re.compile(r"[Ͱ-Ͽἀ-῿ȣϗ]"
                  r"[Ͱ-Ͽἀ-῿ȣϗ̀-ͯ']*")

LIGATURES = 'ȣϗ'

MARKS = {
    'ͅ': 'subscript',   # ypogegrammeni — the one that started this
    '̓': 'smooth',
    '̔': 'rough',
    '́': 'acute',
    '̀': 'grave',
    '͂': 'circumflex',
    '̃': 'circumflex',  # combining tilde, same printed mark
    '̈': 'diaeresis',
}


def nfd(w: str) -> str:
    """NFD, with the two encodings of the printed circumflex unified.

    Readers split between combining tilde (U+0303) and perispomeni (U+0342)
    over `ȣ`, which has no precomposed form.  `canonical()` already folds them,
    so a bare codepoint comparison would report 40 phantom candidates that are
    the same printed mark twice over.
    """
    return unicodedata.normalize('NFD', w).replace('̃', '͂')


def marks_of(w: str) -> Counter:
    return Counter(MARKS.get(c, 'other') for c in nfd(w)
                   if unicodedata.combining(c))


def letters_of(w: str) -> str:
    """The word with every combining mark removed — its skeleton."""
    return ''.join(c for c in nfd(w) if not unicodedata.combining(c))


def differing_marks(a: str, b: str) -> str:
    d = marks_of(a) - marks_of(b)
    e = marks_of(b) - marks_of(a)
    bits = [f'-{k}' for k in sorted(d)] + [f'+{k}' for k in sorted(e)]
    return ','.join(bits) or 'order'


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--min-support', type=int, default=3,
                   help='how often LlamaParse must show its form before its '
                        'disagreement counts as evidence (default 3)')
    p.add_argument('--marks', help='only report this mark class, e.g. subscript')
    p.add_argument('--out', type=Path,
                   default=ROOT / 'work/sweeps/diacritic-candidates.tsv')
    args = p.parse_args(argv)

    # --- reference lexicon: every word form LlamaParse writes, by skeleton ---
    # Keyed on the mark-free skeleton, not on fold(): fold() also expands the
    # ligatures, which would collapse `τȣ͂` and `τοῦ` into one bucket and drown
    # the mark signal in the expansion noise this sweep is not about.
    ref: dict[str, Counter] = defaultdict(Counter)
    npages = 0
    for f in sorted(glob.glob(str(ROOT / 'raw/llama-best/page-*.md'))):
        t = unicodedata.normalize('NFC', clean_llamaparse(
            Path(f).read_text(encoding='utf-8')))
        for w in WORD.findall(t):
            ref[letters_of(w)][w] += 1
        npages += 1
    print(f'reference: {npages} LlamaParse pages, {len(ref)} distinct skeletons')

    # --- the corpus, per column, with line numbers so the ink can be checked --
    rows = []
    gold_forms: Counter = Counter()
    for f in sorted(glob.glob(str(ROOT / 'work/reconciled/page-*.txt'))):
        stem = Path(f).stem
        lines = unicodedata.normalize('NFC', clean_opus(
            Path(f).read_text(encoding='utf-8'))).splitlines()
        for n, line in enumerate(lines, 1):
            for w in WORD.findall(line):
                gold_forms[w] += 1
                skel = letters_of(w)
                cand = ref.get(skel)
                if not cand or w in cand:
                    continue                      # llama agrees, or never saw it
                best, support = cand.most_common(1)[0]
                if support < args.min_support:
                    continue
                if any(c in LIGATURES for c in w) != any(c in LIGATURES for c in best):
                    continue                      # ligature expansion, not a mark
                if nfd(w) == nfd(best):
                    continue          # same printed marks, different encoding
                diff = differing_marks(w, best)
                if args.marks and args.marks not in diff:
                    continue
                rows.append((stem, n, w, best, support, diff, line.strip()))

    # Rank: the same wrong form repeated across columns is stronger evidence
    # than a one-off, and stronger still when LlamaParse is unanimous.
    by_form = Counter((r[2], r[3]) for r in rows)
    rows.sort(key=lambda r: (-by_form[(r[2], r[3])], -r[4], r[0], r[1]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('w', encoding='utf-8') as fh:
        fh.write('column\tline\tcorpus\tllama\tllama_n\tmarks\tcontext\n')
        for r in rows:
            fh.write('\t'.join(str(x) for x in r) + '\n')

    print(f'{len(rows)} suspect positions, {len(by_form)} distinct forms '
          f'-> {args.out}')
    if not rows:
        return 0
    print(f'\n{"corpus":16} {"llama":16} {"n":>4} {"seen":>4}  marks')
    for (bad, good), n in by_form.most_common(25):
        support = next(r[4] for r in rows if r[2] == bad and r[3] == good)
        diff = next(r[5] for r in rows if r[2] == bad and r[3] == good)
        print(f'{bad:16} {good:16} {n:4d} {support:4d}  {diff}')
    kinds = Counter(r[5] for r in rows)
    print('\nby mark class:')
    for k, v in kinds.most_common():
        print(f'  {v:5d}  {k}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
