"""
Evaluate a trained Kraken recognition model on held-out Bonitz columns.

    python3 -m bonitz_pipeline.kraken_eval --model work/kraken/model_best.mlmodel

`ketos test` gives one overall CER.  That number is not sufficient here: it
can look excellent while every breathing over an ou-ligature is wrong, and
the diacritics are the most-missed class in this project's history.  So this
runs the model over the held-out columns using their existing segmentation
(so lines pair 1:1 with the reconciled text) and reports, besides overall
CER, the recall of each character class that matters: `ȣ`, `ϗ`, the
combining marks, and the digits that carry Bekker references.
"""

from __future__ import annotations
import argparse
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work' / 'kraken'
PAGE_NS = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'
NS = {'p': PAGE_NS}

# Character classes reported separately, in the order they are printed.
CLASSES: list[tuple[str, str]] = [
    ('ȣ  ou-ligature', 'ȣ'),
    ('ϗ  kai',         'ϗ'),
    ('combining grave',      '̀'),
    ('combining acute',      '́'),
    ('combining perispomeni', '͂'),
    ('combining smooth',     '̓'),
    ('combining rough',      '̔'),
    ('iota subscript',       'ͅ'),
]


# Sequences this project has lost before, checked as whole units rather than
# character by character.  `Ζιι` is printed as a fused u-shape and every vision
# reader has turned it into Ζυ, Ζμ or Ζη; the ou-ligature is the other one.
PROBES: list[tuple[str, str]] = [
    ('Ζιι  fused double iota', 'Ζιι'),
    ('ιι   double iota', 'ιι'),
    ('ȣ̃    ligature + perispomeni', 'ȣ̃'),
    ('ȣ̓    ligature + smooth', 'ȣ̓'),
    ('ϗ̀    kai + grave', 'ϗ̀'),
]

# Bekker column letters: the a or b in `1094a3`, set as a superscript.
BEKKER = re.compile(r'(?<=[0-9\s])([ab])(?=[0-9])')


def probe_report(gt: str, pairs: list[tuple[str | None, str | None]]
                 ) -> list[tuple[str, str, str]]:
    """(target, what the model read there) for every probe hit in this line."""
    # hypothesis characters aligned to each ground truth position
    read: list[str] = []
    for x, y in pairs:
        if x is None:
            if read:
                read[-1] += y or ''
        else:
            read.append(y or '')
    out = []
    for label, target in PROBES:
        start = gt.find(target)
        while start != -1:
            got = ''.join(read[start:start + len(target)])
            out.append((label, target, got))
            start = gt.find(target, start + 1)
    for m in BEKKER.finditer(gt):
        out.append(('Bekker column letter', m.group(1), read[m.start(1)]))
    return out


def read_lines(path: Path) -> list[tuple[str, str]]:
    """(line id, text) for every TextLine carrying text."""
    out = []
    for el in ET.parse(path).getroot().iter(f'{{{PAGE_NS}}}TextLine'):
        uni = el.find('p:TextEquiv/p:Unicode', NS)
        out.append((el.get('id', ''), (uni.text or '') if uni is not None else ''))
    return out


def align(a: str, b: str) -> list[tuple[str | None, str | None]]:
    """Levenshtein alignment of ground truth `a` against prediction `b`."""
    n, m = len(a), len(b)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
    for j in range(1, m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                          d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
    i, j, pairs = n, m, []
    while i or j:
        if i and j and d[i][j] == d[i - 1][j - 1] + (a[i - 1] != b[j - 1]):
            pairs.append((a[i - 1], b[j - 1])); i, j = i - 1, j - 1
        elif i and d[i][j] == d[i - 1][j] + 1:
            pairs.append((a[i - 1], None)); i -= 1
        else:
            pairs.append((None, b[j - 1])); j -= 1
    return pairs[::-1]


def recognise(model: Path, col: str, out_dir: Path, device: str) -> Path:
    """Run the model over a column, re-using the ground truth segmentation."""
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f'{col}.pred.xml'
    if not dst.exists():
        subprocess.run(
            ['kraken', '-d', device, '-x', '-f', 'page',
             '-i', str(WORK / 'gt' / f'{col}.xml'), str(dst),
             'ocr', '-m', str(model)],
            check=True, cwd=WORK / 'cols')
    return dst


def main(argv: list[str] | None = None) -> int:
    global WORK
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--cols', help='comma-separated column stems; default: the '
                                  'held-out split in work/kraken/holdout.txt')
    p.add_argument('--device', default='mps')
    p.add_argument('--work', type=Path,
                   help='corpus tree to score against (default work/kraken)')
    p.add_argument('--out', type=Path, default=WORK / 'eval')
    args = p.parse_args(argv)
    # recognise() runs kraken with cwd=cols/, so every path it passes through
    # must be absolute or kraken resolves it against the wrong directory.
    args.out = args.out.resolve()
    args.model = args.model.resolve()
    if args.work:
        WORK = args.work.resolve()
        if args.out == (ROOT / 'work' / 'kraken' / 'eval').resolve():
            args.out = WORK / 'eval'   # keep the default beside its own tree

    cols = (args.cols.split(',') if args.cols else
            (WORK / 'holdout.txt').read_text().split())

    edits = chars = 0
    sub = Counter()
    cls_total, cls_hit = Counter(), Counter()
    probe_total, probe_hit, probe_miss = Counter(), Counter(), Counter()
    per_col = []

    for col in cols:
        pred_path = recognise(args.model, col, args.out, args.device)
        gt, pred = read_lines(WORK / 'gt' / f'{col}.xml'), read_lines(pred_path)
        if len(gt) != len(pred):
            sys.exit(f'{col}: {len(gt)} gt lines vs {len(pred)} predicted')
        by_id = {i: t for i, t in pred}
        col_edits = col_chars = 0
        for (gid, g), (_, p_) in zip(gt, pred):
            hyp = by_id.get(gid, p_)
            pairs = align(g, hyp)
            for x, y in pairs:
                if x is not None:
                    cls_total[x] += 1
                    if x == y:
                        cls_hit[x] += 1
                if x != y:
                    col_edits += 1
                    sub[(x, y)] += 1
            for label, target, got in probe_report(g, pairs):
                probe_total[label] += 1
                if got == target:
                    probe_hit[label] += 1
                else:
                    probe_miss[(label, target, got)] += 1
            col_chars += len(g)
        edits += col_edits; chars += col_chars
        per_col.append((col, col_edits / col_chars if col_chars else 0, col_chars))

    print(f'model: {args.model}')
    print(f'columns: {len(cols)}   lines compared, chars: {chars}')
    space = sum(n for (x, y), n in sub.items()
                if (x or ' ').isspace() and (y or ' ').isspace())
    print(f'\nOVERALL CER: {edits / chars:.4%}  ({edits} edits)')
    print(f'  ignoring spacing: {(edits - space) / chars:.4%}  '
          f'({space} of the edits are whitespace alone)')
    print('  pilot baseline for a generic model was 19.7% on page 15-L')
    print('  under ~0.5% is suspicious, not good: the ground truth is '
          'consensus-plus-spot-review, and its noise is the ceiling')

    print('\nper column:')
    for col, cer, n in per_col:
        print(f'  {col}  CER {cer:7.4%}  ({n} chars)')

    print('\nper class recall — the numbers that decide usability:')
    for label, ch in CLASSES:
        t = cls_total[ch]
        if not t:
            continue
        print(f'  {label:<24} {cls_hit[ch]:>5}/{t:<5} {cls_hit[ch] / t:7.2%}')
    digits = sum(cls_total[c] for c in '0123456789')
    dhit = sum(cls_hit[c] for c in '0123456789')
    if digits:
        print(f'  {"digits (Bekker refs)":<24} {dhit:>5}/{digits:<5} {dhit / digits:7.2%}')

    print('\nsequences this project has lost before:')
    for label, _ in PROBES + [('Bekker column letter', '')]:
        t = probe_total[label]
        if t:
            print(f'  {label:<28} {probe_hit[label]:>4}/{t:<4} {probe_hit[label] / t:7.2%}')
    if probe_miss:
        print('  misread as:')
        for (label, target, got), n in probe_miss.most_common(10):
            print(f'    {n:>3}  {label.split()[0]}  {target!r} → {got!r}')

    print('\ntop confusions (ground truth → prediction):')
    for (x, y), n in sub.most_common(20):
        name = lambda c: ('∅' if c is None else
                          f'{c!r} {unicodedata.name(c, "?")}')
        print(f'  {n:>4}  {name(x)}  →  {name(y)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
