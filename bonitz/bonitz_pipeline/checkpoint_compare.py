"""Which checkpoint to keep, decided by error class rather than by one number.

Round 3 has spent ten epochs inside 0.9914-0.9920 on the held-out set.  That
spread is about six characters in ten thousand, and on a 25,000-character
holdout it is close to sampling noise — so the top few checkpoints are not
really ranked at all, and picking the largest number is picking a coin flip.

What is NOT noise is which characters each one gets wrong.  This project's
whole history is diacritics: a model can look excellent overall while missing
every breathing over an ou-ligature, and the classes that have cost the most
adjudication are exactly the ones an aggregate accuracy hides.  So this runs
`ketos test` over the same holdout for every checkpoint in the band, splits the
confusion table by the class of the character that was EXPECTED, and puts them
side by side.

    python3 -m bonitz_pipeline.checkpoint_compare              # the top band
    python3 -m bonitz_pipeline.checkpoint_compare --all
    python3 -m bonitz_pipeline.checkpoint_compare --band 0.002

⚠ THE FILENAME ALREADY CARRIES THE HELD-OUT NUMBER.  Training runs with
`-e holdout.files`, so `checkpoint_10-0.9920` scored 0.9920 on the same data
this evaluates, and a run here reproduces it exactly.  The filename is not the
wrong number; it is one number, and one number cannot say whether the model
that wins by 0.0001 wins on breathings or loses on them.

⚠ IT COMPETES WITH TRAINING FOR THE CPU.  Round 3 runs on CPU with four
workers, so every evaluation here is niced.  Each takes about 40 seconds.
"""

from __future__ import annotations
import argparse
import html
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work/kraken400'
KETOS = Path.home() / '.local/bin/ketos'
HOLDOUT = 'holdout.arrow'

# The classes worth separating, tested in order — first match wins. Each is a
# class this project has actually lost time to, which is why it is here and not
# some tidier partition of Unicode.
SMOOTH, ROUGH, ACUTE, GRAVE, CIRC, SUBSCRIPT, DIAERESIS = (
    '̓', '̔', '́', '̀', '͂', 'ͅ', '̈')


def as_char(s: str) -> str:
    """`ketos` prints a Unicode NAME where a character is not printable.

    So the confusion table says `COMBINING COMMA ABOVE`, not `\u0313`, and a
    classifier reading it literally files the single most important class in
    this project — smooth breathing — under "other". Seventeen of the leader's
    two hundred errors were exactly that, invisible.
    """
    if len(s) > 1 and s.upper() == s and re.fullmatch(r'[A-Z0-9 -]+', s):
        try:
            return unicodedata.lookup(s)
        except KeyError:
            pass
    return s


# The SPACING forms of the breathings — a psili or dasia standing on its own
# rather than combining. ketos emits them by name and they are breathings, not
# letters, however the Greek block is organised.
SPACING = {'\u1fbf': SMOOTH, '\u1ffe': ROUGH, '\u1fcd': SMOOTH,
           '\u1fce': SMOOTH, '\u1fcf': SMOOTH, '\u1fdd': ROUGH,
           '\u1fde': ROUGH, '\u1fdf': ROUGH}
PUNCT = '\u0387\u037e\u0374\u0375\u00b7'


def marks_of(s: str) -> set:
    """Every diacritic in `s`, combining or spacing, as combining codepoints."""
    d = unicodedata.normalize('NFD', s)
    out = {c for c in d if unicodedata.combining(c)}
    out |= {SPACING[c] for c in d if c in SPACING}
    return out


def classify(raw: str, got_raw: str = '') -> str:
    """WHAT WENT WRONG — judged by the difference, not by the gold alone.

    ⚠ THIS USED TO READ THE EXPECTED CHARACTER ONLY, and so counted half the
    errors it was built to count. `ἀ` read as `α` is a dropped breathing and
    landed in `breathing`; `α` read as `ἀ` is an INVENTED breathing and landed
    in `greek letter`, invisible. Grok, 2026-08-09: *"the headline 'e10 is worst
    on breathings' only measures gold-has-breathing failures."* It was right,
    and the bias sat in exactly the column used to prefer one checkpoint over
    another — so the comparison argued from half its evidence.

    ⚠ MARKS ARE TESTED BEFORE LIGATURES. They used to be tested after, so `ȣ̓`
    — a smooth breathing over the ou-ligature — was filed as `ou-ligature` and
    never as `breathing`. That is the exact failure this module's docstring
    names as the thing an aggregate hides.
    """
    expected, got = as_char(raw), as_char(got_raw)
    diff = marks_of(expected) ^ marks_of(got)
    if diff & {SMOOTH, ROUGH}:
        return 'breathing'
    if CIRC in diff:
        return 'perispomeni'
    if diff & {ACUTE, GRAVE}:
        return 'acute/grave'
    if SUBSCRIPT in diff:
        return 'iota subscript'
    if DIAERESIS in diff:
        return 'diaeresis'
    ref = expected if expected.strip() else got
    if not ref.strip():
        return 'space'
    if 'ȣ' in ref:
        return 'ou-ligature ȣ'
    if 'ϗ' in ref:
        return 'kai ϗ'
    if 'ϛ' in ref:
        return 'stigma ϛ'
    if any(c in PUNCT for c in ref):
        return 'punctuation'
    if ref.isdigit():
        return 'digit'
    if re.fullmatch(r'[A-Za-z]', ref):
        return 'latin letter'
    if re.fullmatch(r'[Ͱ-Ͽἀ-῿]+', ref):
        return 'greek letter'
    return 'other'


ROW = re.compile(r'^\s*(\d+)\s+\{ (.*?) \} - \{ (.*?) \}\s*$')
SUMMARY = re.compile(r'^([\d.]+)%\s+Character Accuracy\s*$')
COUNTS = re.compile(r'^(\d+)\s+(Characters|Errors|Insertions|Deletions|'
                    r'Substitutions)\s*$')


def evaluate(ckpt: Path, holdout: str = HOLDOUT) -> dict:
    """Run `ketos test` and split its confusion table by expected class."""
    out = subprocess.run(
        ['nice', '-n', '15', str(KETOS), '-d', 'cpu', 'test',
         '-m', str(ckpt.relative_to(WORK)), '-f', 'binary', holdout],
        cwd=WORK, capture_output=True, text=True).stdout
    res = {'ckpt': ckpt.name, 'accuracy': None, 'by_class': Counter(),
           'totals': {}, 'worst': []}
    for line in out.splitlines():
        if (m := SUMMARY.match(line.strip())) and res['accuracy'] is None:
            res['accuracy'] = float(m.group(1))
        elif m := COUNTS.match(line.strip()):
            res['totals'][m.group(2).lower()] = int(m.group(1))
        elif m := ROW.match(line):
            n, exp, got = int(m.group(1)), html.unescape(m.group(2)), \
                html.unescape(m.group(3))
            # ⚠ AN INSERTED MARK IS NOT A SPACING ERROR. `{ } - { ̀ }` means
            # the model invented a grave where nothing stood. Filed by what was
            # EXPECTED it lands under "space" and reads as harmless; it is in
            # fact the model hallucinating a diacritic, which is the failure
            # this project has spent the most adjudication on. Twenty-four of
            # the leader's two hundred errors are this.
            e, g = as_char(exp), as_char(got)
            cl = classify(exp, got)
            if not e.strip() and g.strip():
                cl = 'spurious ' + classify(got, '')
            res['by_class'][cl] += n
            res['worst'].append((n, e, g))
    res['worst'].sort(reverse=True)
    return res


def band(top: float, width: float) -> list[Path]:
    out = []
    for p in sorted((WORK / 'model96').glob('checkpoint_*.ckpt')):
        acc = float(p.stem.rsplit('-', 1)[1])
        if acc >= top - width:
            out.append(p)
    return sorted(out, key=lambda p: -float(p.stem.rsplit('-', 1)[1]))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--band', type=float, default=0.0007,
                   help='how far below the best to include (default 0.0007)')
    p.add_argument('--all', action='store_true')
    args = p.parse_args(argv)

    every = sorted((WORK / 'model96').glob('checkpoint_*.ckpt'))
    if not every:
        print('no checkpoints yet'); return 1
    top = max(float(q.stem.rsplit('-', 1)[1]) for q in every)
    picks = every if args.all else band(top, args.band)
    print(f'{len(picks)} checkpoints within {args.band} of {top}, '
          f'on {HOLDOUT} — about 40s each\n')

    rows, failed = [], []
    for c in picks:
        r = evaluate(c)
        if r['accuracy'] is None:
            # A checkpoint still being written by the running trainer reads as
            # a failure here. Say so; do not print None% and do not let its
            # zeros make every class look like it has a spread.
            failed.append(c.stem)
            print(f'  {c.stem:<26} could not be evaluated (still being '
                  f'written?) — excluded')
            continue
        rows.append(r)
        print(f'  {c.stem:<26} {r["accuracy"]}%  '
              f'{r["totals"].get("errors", "?")} errors')
    if not rows:
        print('nothing evaluated'); return 1

    classes = sorted({k for r in rows for k in r['by_class']},
                     key=lambda k: -sum(r['by_class'][k] for r in rows))
    w = max(len(c) for c in classes) + 2
    print(f'\nERRORS BY THE CLASS OF THE CHARACTER EXPECTED\n')
    head = ''.join(f'{r["ckpt"].split("_")[1][:2]:>8}' for r in rows)
    print(f'{"":<{w}}{head}')
    for cl in classes:
        line = ''.join(f'{r["by_class"].get(cl, 0):>8}' for r in rows)
        best = min(r['by_class'].get(cl, 0) for r in rows)
        worst = max(r['by_class'].get(cl, 0) for r in rows)
        flag = '  <- spread' if worst - best >= 3 else ''
        print(f'{cl:<{w}}{line}{flag}')
    tot = ''.join(f'{sum(r["by_class"].values()):>8}' for r in rows)
    print(f'{"TOTAL":<{w}}{tot}')

    print('\nMost frequent single confusions in the leader:')
    for n, exp, got in rows[0]['worst'][:8]:
        e = exp if exp.strip() else '(space)'
        g = got if got.strip() else '(nothing)'
        print(f'  {n:>3}  {e!r} read as {g!r}   [{classify(exp)}]')
    return 0


if __name__ == '__main__':
    sys.exit(main())
