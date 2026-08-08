"""
Build a Kraken training corpus from the reconciled Bonitz columns.

Stages (each idempotent; existing outputs are skipped):

  python3 -m bonitz_pipeline.kraken_corpus cols
      re-render pages 15-52 at 600 PPI, split into columns, write grayscale
      PNGs to work/kraken/cols/.  Deterministic re-run of batch3 prep before
      it downscaled to 1400px strips, so lines are ~85px tall, not ~57px.

  python3 -m bonitz_pipeline.kraken_corpus segment
      stock blla baseline segmentation -> work/kraken/seg/*.xml (PageXML with
      empty text).  `-bl` is correct in kraken 7.1; the legacy path fails.

  python3 -m bonitz_pipeline.kraken_corpus pair
      filter, sort, gate, and inject the reconciled text -> work/kraken/gt/*.xml
      plus work/kraken/pairing.json.

  python3 -m bonitz_pipeline.kraken_corpus split
      hold out whole columns -> work/kraken/{train,holdout}.txt

  python3 -m bonitz_pipeline.kraken_corpus compile
      ketos compile both lists -> work/kraken/{train,holdout}.arrow

Why the filtering exists: the marginal line numbers (5, 10, 15 ...) land in
the RIGHT crop, because split_columns cuts at the gutter darkness valley and
the digits overlap in x with the right column's lemma outdents.  Most are
segmented as their own short lines and drop out cleanly.  A few - the ones
kraken merges into the adjacent text line's polygon - would train the model
to swallow a leading number, which in a text made of Bekker numbers is the
worst error it could learn.  Those lines are excluded from training.
"""

from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image

from .split_columns import split_page

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work' / 'kraken'
RECONCILED = ROOT / 'work' / 'reconciled'
DAMAGE = ROOT / 'work' / 'damage'
# Set by --pages: split these page images instead of rendering book.pdf.
PAGES: Path | None = None

PAGE_NS = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'
NS = {'p': PAGE_NS}

# A standalone marginal digit: short baseline hard against the left edge.
# Measured on page 20-R the digits ran x=2..132; the narrowest genuine short
# text line ran 111..401.  `pair` prints the corpus-wide distribution so a
# wrong threshold shows up instead of silently eating text.
# Both are fractions of the column width, so one calibration serves any scan
# resolution.  Measured on page 20-R of the 600 PPI render (columns ~2050 px):
# the digits ran x=2..132 and the narrowest genuine short text line ran
# 111..401, giving 200 and 150 px — 0.098 and 0.073 of the width.  `pair`
# prints the corpus-wide distribution so a wrong threshold shows up instead of
# silently eating text.
GUTTER_MAX_X1_FRAC = 0.098
GUTTER_MAX_WIDTH_FRAC = 0.073

# How much further into the margin a numbered line must reach, past the
# tightest unnumbered line in its own column, before its polygon is judged to
# have swallowed the number.  Measured gaps are ~70px; the outdent itself is
# ~90px, so 30 leaves room for the type without admitting an outdent.
DIGIT_MARGIN = 30


def columns() -> list[str]:
    """Column stems that have reconciled ground truth, e.g. 'page-020-L'."""
    return sorted(p.stem for p in RECONCILED.glob('page-*.txt'))


def gt_lines(stem: str) -> list[str]:
    return (RECONCILED / f'{stem}.txt').read_text(encoding='utf-8').splitlines()


def damaged_lines(stem: str) -> set[int]:
    """1-based line numbers ruled print-damaged for this column, if any."""
    f = DAMAGE / f'{stem}.json'
    if not f.exists():
        return set()
    return set(json.loads(f.read_text(encoding='utf-8')).get('damaged', []))


# --- cols -------------------------------------------------------------------

def stage_cols(stems: list[str]) -> None:
    out = WORK / 'cols'
    out.mkdir(parents=True, exist_ok=True)
    pages = sorted({int(s.split('-')[1]) for s in stems})
    for p in pages:
        want = [out / f'page-{p:03d}-{c}.png' for c in 'LR']
        if all(w.exists() for w in want):
            print(f'page {p}: columns exist, skip')
            continue
        if PAGES:
            src = PAGES / f'page-{p:03d}.jpg'
            if not src.exists():
                sys.exit(f'{src} missing')
        else:
            src = WORK / f'page-{p:03d}.tif'
            if not src.exists():
                subprocess.run(
                    ['pdftoppm', '-f', str(p), '-l', str(p), '-r', '600',
                     '-tiff', '-tiffcompression', 'lzw',
                     str(ROOT / 'book.pdf'), str(WORK / 'page')],
                    check=True, cwd=ROOT)
        left, right = split_page(src, WORK / 'cols-tif')
        for col in (left, right):
            im = Image.open(col).convert('L')
            im.save(out / f'{col.stem}.png')
            print(f'{col.stem}: {im.width}x{im.height}')
            col.unlink()
        if not PAGES:
            src.unlink()
    tmp = WORK / 'cols-tif'
    if tmp.exists() and not any(tmp.iterdir()):
        tmp.rmdir()


# --- segment ----------------------------------------------------------------

def stage_segment(stems: list[str], device: str) -> None:
    out = WORK / 'seg'
    out.mkdir(parents=True, exist_ok=True)
    todo = [s for s in stems if not (out / f'{s}.xml').exists()]
    if not todo:
        print('all columns segmented, nothing to do')
        return
    print(f'segmenting {len(todo)} columns on {device}')
    for s in todo:
        src = WORK / 'cols' / f'{s}.png'
        subprocess.run(
            ['kraken', '-d', device, '-x', '-i', str(src), str(out / f'{s}.xml'),
             'segment', '-bl'],
            check=True)


# --- pair -------------------------------------------------------------------

def _pts(el: ET.Element | None) -> list[tuple[int, int]]:
    if el is None:
        return []
    return [tuple(int(v) for v in pair.split(','))
            for pair in el.get('points', '').split()]


def read_seg(path: Path) -> tuple[ET.ElementTree, list[dict], int]:
    tree = ET.parse(path)
    page = tree.getroot().find('p:Page', NS)
    width = int(page.get('imageWidth'))
    lines = []
    for el in tree.getroot().iter(f'{{{PAGE_NS}}}TextLine'):
        base = _pts(el.find('p:Baseline', NS))
        poly = _pts(el.find('p:Coords', NS))
        if not base:
            continue
        xs = [x for x, _ in base]
        px = [x for x, _ in poly] or xs
        lines.append({
            'el': el,
            'x0': min(xs), 'x1': max(xs),
            'y': sum(y for _, y in base) / len(base),
            'poly_x0': min(px), 'poly_x1': max(px),
        })
    return tree, lines, width


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    return s[len(s) // 2] if s else 0.0


def pair_column(stem: str) -> dict:
    """Pair a column's segmented lines with its reconciled text.

    Returns a report dict; writes nothing.  `el` entries in the returned
    lists point into the parsed tree so the caller can emit training XML.
    """
    tree, lines, width = read_seg(WORK / 'seg' / f'{stem}.xml')
    gt = gt_lines(stem)

    ordered = sorted(lines, key=lambda l: l['y'])
    lead = _median([b['y'] - a['y'] for a, b in zip(ordered, ordered[1:])])

    # 1. Marginal line numbers segmented as their own short lines.  The gutter
    #    is to the RIGHT of a left column and to the LEFT of a right column,
    #    and split_columns cuts at the gutter's darkness valley, so which crop
    #    keeps the numbers changes from page to page: test both edges.
    #
    #    A number is printed beside a line of text and shares its baseline.
    #    Bonitz also ends entries with one-character lines — `v.`, `V.` — that
    #    are just as narrow and just as far left, but stand in a line slot of
    #    their own.  That is the difference, and it is the reliable one.
    max_x1 = width * GUTTER_MAX_X1_FRAC
    max_w = width * GUTTER_MAX_WIDTH_FRAC
    for l in lines:
        narrow = (l['x1'] - l['x0']) < max_w
        edge = l['x1'] < max_x1 or l['x0'] > width - max_x1
        beside = any(o is not l and abs(o['y'] - l['y']) < lead * 0.4
                     for o in lines)
        l['is_digit'] = narrow and edge and beside
        l['drop'] = l['is_digit']

    # 2. The printer's signature and catchword at the foot, which split_columns'
    #    row trimming sometimes keeps.  Geometry cannot tell them from the
    #    one-character lines Bonitz ends entries with — `v.`, `V.` sit at the
    #    same place, are the same width, and are set off by the same extra
    #    leading.  Width against the transcription can: a two-character line
    #    is about a hundred pixels of type, a full line about nineteen hundred.
    body = sorted((l for l in lines if not l['drop']), key=lambda l: l['y'])
    if len(body) > 3 and gt:
        char_w = (_median([l['x1'] - l['x0'] for l in body])
                  / max(1, _median([len(t) for t in gt])))
        gaps = [b['y'] - a['y'] for a, b in zip(body, body[1:])]
        for end, gap, text in ((body[0], gaps[0], gt[0]),
                               (body[-1], gaps[-1], gt[-1])):
            stub = (end['x1'] - end['x0']) < width * 0.2
            if stub and gap > _median(gaps) * 1.15 and \
                    (end['x1'] - end['x0']) < 0.5 * char_w * len(text):
                end['drop'] = True

    dropped = [l for l in lines if l['drop']]
    kept = sorted((l for l in lines if not l['drop']), key=lambda l: l['y'])

    rep = {
        'column': stem, 'found': len(lines), 'dropped': len(dropped),
        'kept': len(kept), 'gt': len(gt), 'match': len(kept) == len(gt),
        'tree': tree, 'kept_lines': kept, 'dropped_lines': dropped,
        'width': width, 'excluded': [], 'digits': 0,
    }
    if not rep['match']:
        return rep

    for i, (line, text) in enumerate(zip(kept, gt), start=1):
        line['n'] = i
        line['text'] = text

    # 3. Lines whose polygon swallowed a marginal number.  Position cannot
    #    decide this: the scans carry a fraction of a degree of skew, so an
    #    outdent at the foot of a column reaches further into the margin than
    #    a number at its head.  Structure can.  Bonitz numbers every fifth
    #    line, so in a crop that keeps the number strip at all, a numbered
    #    line with no digit segmented alongside it has the digit inside it.
    # Print damage, ruled by hand against the ink and recorded in work/damage/.
    # The impression failed, so neither reader is wrong and the line teaches
    # invention — that a blank is `ει`, or that a upsilon-shaped glyph is the
    # ligature.  Kept out of training and out of the error count alike.  The
    # rulings live outside the corpus tree because they are statements about
    # the edition, not about a scan of it.
    rep['damaged'] = sorted(damaged_lines(stem))
    rep['excluded'].extend(rep['damaged'])

    digits = [l for l in dropped if l['is_digit']]
    rep['digits'] = len(digits)
    if not digits:
        return rep

    near = _median([b['y'] - a['y'] for a, b in zip(kept, kept[1:])]) * 0.4
    for line in kept:
        if line['n'] % 5:
            continue
        if not any(abs(d['y'] - line['y']) < near for d in digits):
            rep['excluded'].append(line['n'])
    rep['excluded'] = sorted(set(rep['excluded']))  # a line can be both
    return rep


# John's ruling, 2026-08-06: Bekker references are unspaced — `1456b27`, not
# `1456 b27`.  The printed gap is justification, not typography with meaning:
# the same setting gives `1456ᵇ27` tight on page 15 and `941 ᵃ33` open on page
# 42.  The readers could not agree, and the corpus splits 3,549 spaced against
# 1,966 unspaced *by column*, which trains the model on a coin flip and
# accounts for most of its whitespace errors.  `normalize.canonical` already
# strips whitespace before diffing, so nothing downstream sees the change.
# Applied here rather than to work/reconciled/, which stays the diplomatic
# record.
BEKKER_SPACE = re.compile(r'(?<=[0-9]) (?=[ab][0-9])')


def emit_xml(rep: dict, out_dir: Path) -> None:
    """Write training PageXML: kraken's own segmentation, minus the gutter
    digits and the digit-contaminated lines, with the reconciled text
    injected into each surviving line."""
    tree = rep['tree']
    drop = {id(l['el']) for l in rep['dropped_lines']}
    drop |= {id(l['el']) for l in rep['kept_lines'] if l['n'] in rep['excluded']}

    for parent in tree.getroot().iter():
        for el in list(parent):
            if el.tag == f'{{{PAGE_NS}}}TextLine' and id(el) in drop:
                parent.remove(el)

    for line in rep['kept_lines']:
        if line['n'] in rep['excluded']:
            continue
        eq = ET.SubElement(line['el'], f'{{{PAGE_NS}}}TextEquiv')
        ET.SubElement(eq, f'{{{PAGE_NS}}}Unicode').text = \
            BEKKER_SPACE.sub('', line['text'])

    out_dir.mkdir(parents=True, exist_ok=True)
    ET.register_namespace('', PAGE_NS)
    tree.write(out_dir / f'{rep["column"]}.xml', encoding='UTF-8',
               xml_declaration=True)


def stage_pair(stems: list[str]) -> int:
    out = WORK / 'gt'
    reports, failed = [], []
    left_hist, right_hist = Counter(), Counter()

    reps = [pair_column(s) for s in stems]

    # Every page prints a number every fifth line.  A page where neither crop
    # shows the strip has not lost its numbers — on page 35 the gutter cut
    # halves them into both crops and kraken merges every one into its text
    # line.  With no strip to key on there is no telling which crop holds
    # them, so both columns give up their numbered lines.
    by_page: dict[str, int] = Counter()
    for r in reps:
        by_page[r['column'][:8]] += r['digits']
    blind = sorted(p for p, n in by_page.items() if n == 0)
    for r in reps:
        if r['column'][:8] in blind:
            r['excluded'] = [l['n'] for l in r['kept_lines']
                             if l.get('n') and l['n'] % 5 == 0]

    for rep in reps:
        for l in rep['kept_lines']:
            left_hist[min(l['poly_x0'], 300) // 20 * 20] += 1
            right_hist[min(rep['width'] - l['poly_x1'], 300) // 20 * 20] += 1
        if rep['match']:
            emit_xml(rep, out)
        else:
            failed.append(rep)
        reports.append({k: rep[k] for k in
                        ('column', 'found', 'dropped', 'kept', 'gt', 'match',
                         'excluded', 'digits')})

    trained = sum(r['kept'] - len(r['excluded']) for r in reports if r['match'])
    excluded = sum(len(r['excluded']) for r in reports if r['match'])

    print(f'\ncolumns: {len(reports)}  matched: {len(reports) - len(failed)}  '
          f'quarantined: {len(failed)}')
    for r in failed:
        print(f'  QUARANTINE {r["column"]}: kept {r["kept"]} vs gt {r["gt"]} '
              f'(found {r["found"]}, dropped {r["dropped"]})')
    print(f'lines for training: {trained}  excluded as digit-contaminated: {excluded}')
    print('\ninset of kept lines from each margin (20px bins) — the digit zone '
          'should sit well clear of the outdent zone:')
    print(f'  {"inset":>5}  {"left":>6}  {"right":>6}')
    for b in sorted(set(left_hist) | set(right_hist)):
        print(f'  {b:>5}  {left_hist[b]:>6}  {right_hist[b]:>6}')
    if blind:
        print('\nno marginal number strip found on these pages, so every '
              'numbered line in both their columns is excluded: '
              + ', '.join(blind))
    else:
        print('\nevery page shows its marginal number strip in one crop ✓')

    (WORK / 'pairing.json').write_text(
        json.dumps(reports, ensure_ascii=False, indent=1), encoding='utf-8')
    return 1 if failed else 0


# --- split and compile ------------------------------------------------------

# Held out whole, and spread across the range: adjacent lines share an entry,
# so a random line-level split would leak.  Alternating sides keeps both the
# clean left columns and the gutter-side right columns in the evaluation.
HOLDOUT = [f'page-{p:03d}-{c}' for p, c in
           zip(range(17, 53, 5), 'LRLRLRLR')]


def stage_split() -> int:
    reports = json.loads((WORK / 'pairing.json').read_text(encoding='utf-8'))
    usable = [r['column'] for r in reports if r['match']]
    holdout = [c for c in HOLDOUT if c in usable]
    train = [c for c in usable if c not in set(holdout)]
    if len(holdout) < len(HOLDOUT):
        print(f'⚠ {len(HOLDOUT) - len(holdout)} held-out columns are '
              f'quarantined and cannot be evaluated: '
              f'{sorted(set(HOLDOUT) - set(holdout))}')

    lines = {r['column']: r['kept'] - len(r['excluded']) for r in reports}
    (WORK / 'holdout.txt').write_text('\n'.join(holdout) + '\n')
    (WORK / 'train.txt').write_text('\n'.join(train) + '\n')
    print(f'train:   {len(train):>3} columns, {sum(lines[c] for c in train)} lines')
    print(f'holdout: {len(holdout):>3} columns, '
          f'{sum(lines[c] for c in holdout)} lines')
    return 0


def stage_compile() -> int:
    for name in ('train', 'holdout'):
        cols = (WORK / f'{name}.txt').read_text().split()
        subprocess.run(
            ['ketos', 'compile', '-f', 'page', '-o', str(WORK / f'{name}.arrow'),
             *[f'../gt/{c}.xml' for c in cols]],
            check=True, cwd=WORK / 'cols')
    return 0


# --- cli --------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('stage', choices=['cols', 'segment', 'pair', 'split', 'compile'])
    p.add_argument('--only', help="comma-separated column stems, e.g. page-020-L")
    p.add_argument('--device', default='mps')
    p.add_argument('--work', type=Path,
                   help='corpus tree to build in (default work/kraken); use a '
                        'second tree to keep two scans side by side')
    p.add_argument('--pages', type=Path,
                   help='directory of page-NNN.jpg images to split, instead of '
                        'rendering book.pdf at 600 PPI')
    args = p.parse_args(argv)

    global WORK, PAGES
    if args.work:
        WORK = args.work.resolve()
    PAGES = args.pages.resolve() if args.pages else None

    stems = columns()
    if args.only:
        want = set(args.only.split(','))
        stems = [s for s in stems if s in want]
        if not stems:
            sys.exit(f'no reconciled columns match {args.only}')

    if args.stage == 'cols':
        stage_cols(stems)
    elif args.stage == 'segment':
        stage_segment(stems, args.device)
    elif args.stage == 'pair':
        return stage_pair(stems)
    elif args.stage == 'split':
        return stage_split()
    else:
        return stage_compile()
    return 0


if __name__ == '__main__':
    sys.exit(main())
