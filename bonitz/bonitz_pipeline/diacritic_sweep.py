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


ACUTE = '\u0301'


def enclitic_acute(word: str, best: str, line: str, at: int) -> bool:
    """True when the corpus's extra acute is the one an enclitic requires.

    ⚠ SMYTH §183b, AND THE REFERENCE DOES NOT KNOW IT. A proparoxytone takes an
    ADDITIONAL acute on its ultima when an enclitic follows: `ἀνοίδησις` alone,
    but `ἀνοίδησίς τις` with the enclitic. The second accent is not merely
    allowed, it is required — so a reference that reads the word in isolation
    disagrees with the page every time, and the page is right.

    John, 2026-08-18: "cases like this occur because τις follows... does the
    sweep have anything for that in its script?" It did not. `smyth_sweep`
    rule A6 has known the rule all along, but this sweep compares marks against
    LlamaParse and saw only that one had an acute the other lacked.

    The test is narrow: the ONLY difference is an acute the corpus adds, and
    the very next word on the printed line is an enclitic.
    """
    from .smyth_sweep import ENCLITICS
    a, b = nfd(word), nfd(best)
    if a.replace(ACUTE, '') != b.replace(ACUTE, ''):
        return False                       # they differ by more than acutes
    if a.count(ACUTE) != b.count(ACUTE) + 1:
        return False                       # the corpus does not add exactly one
    # ⚠ AND THE ADDED ACUTE MUST BE ON THE ULTIMA, WHICH IS WHAT §183b SAYS.
    # Without this the rule fired on `προαιρȣ́μενος δέ`, where LlamaParse had
    # dropped the word's ORDINARY accent and `δε` merely happened to follow —
    # it sits in the enclitic list for the deictic suffix of ὅδε. The corpus
    # was right either way, so the card was harmless; the reasoning was not.
    tail = a[a.rfind(ACUTE):]
    if any(c.isalpha() and not unicodedata.combining(c) for c in tail[1:]):
        vowels_after = [c for c in tail[1:]
                        if c.lower() in 'αειουηωϊϋȣ']
        if vowels_after:
            return False                   # the added acute is not on the last
    rest = line[at + len(word):].lstrip()
    nxt = ''.join(c for c in rest.split(' ')[0] if not unicodedata.combining(c))
    nxt = unicodedata.normalize('NFD', nxt)
    nxt = ''.join(c for c in nxt if not unicodedata.combining(c)).strip('.,;:()')
    return nxt.lower() in ENCLITICS


def column_words(lines: list[str]):
    """Yield `(line_no, word, context)` with line-end hyphens rejoined.

    ⚠ WITHOUT THIS THE SWEEP COMPARES A FRAGMENT AGAINST A WHOLE WORD. Bonitz
    breaks words at the column edge — `ἀνά-` / `γνωσις`, `ἀλλή-` / `λων`,
    `πάν-` / `των` — and a fragment read as a word has no accent where the
    whole word has one, so the reference always disagrees. Measured on the
    176-column corpus: 136 of 247 flagged positions were fragments, so more
    than half of what this sweep asked a human to look at was its own line
    breaking. The joined word is reported at the HEAD line, which is where the
    accent under question is printed.

    A hyphen counts as a line break only when it ends the line AND a word ends
    immediately before it AND the next line opens with a word. Bonitz also sets
    hyphens inside a line to mark morphology (`ἀ-γνοιαν`); those are his, they
    are not breaks, and the regex leaves them alone either way.
    """
    n = 1
    skip_first = False
    while n <= len(lines):
        line = lines[n - 1]
        words = [(m.group(), m.start(), m.end()) for m in WORD.finditer(line)]
        stripped = line.rstrip()
        joined = None
        if stripped.endswith('-') and words and n < len(lines):
            head, _, head_end = words[-1]
            if head_end == len(stripped) - 1:
                nxt = lines[n]
                tails = [(m.group(), m.start()) for m in WORD.finditer(nxt)]
                if tails and tails[0][1] == 0:
                    joined = (head + tails[0][0],
                              f'{stripped} ⏎ {nxt.strip()}')
        for i, (w, start, _) in enumerate(words):
            if i == 0 and skip_first:
                continue
            if joined and i == len(words) - 1:
                yield n, joined[0], joined[1]
            else:
                yield n, w, line.strip()
        skip_first = joined is not None
        n += 1


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
    # ⚠ EVERY CORPUS STAGE. Reading work/reconciled alone makes this
    # silently skip pages 53-62, which are settled but not yet promoted
    # and live in reconciled-auto — and a sweep that skips a page reports
    # it clean.
    from .normalize import corpus_columns
    for f in (str(p) for p in corpus_columns()):
        stem = Path(f).stem
        lines = unicodedata.normalize('NFC', clean_opus(
            Path(f).read_text(encoding='utf-8'))).splitlines()
        for n, w, ctx in column_words(lines):
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
            if enclitic_acute(w, best, ctx, ctx.find(w)):
                continue                   # Smyth §183b — the enclitic's acute
            diff = differing_marks(w, best)
            if args.marks and args.marks not in diff:
                continue
            rows.append((stem, n, w, best, support, diff, ctx))

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
