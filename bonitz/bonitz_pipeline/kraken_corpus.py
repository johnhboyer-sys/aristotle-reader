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
      hold out whole columns -> work/kraken/{train,holdout}.txt.  Which
      columns is John's ruling, read from work/rulings/kraken-holdout.json;
      the split must partition the paired columns exactly or it refuses.

  python3 -m bonitz_pipeline.kraken_corpus compile
      ketos compile both lists -> work/kraken/{train,holdout}.arrow, after
      refusing outright if a held-out column has reached train.txt

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
import hashlib
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
        # How many lines the segmenter found that the transcription does not
        # have.  Spent as it is used, so the loop can never drop more lines
        # than the arithmetic licenses.
        surplus = len(body) - len(gt)
        for end, gap, text in ((body[0], gaps[0], gt[0]),
                               (body[-1], gaps[-1], gt[-1])):
            stub = (end['x1'] - end['x0']) < width * 0.2
            # ⚠ THE EXTRA LEADING IS NOT ALWAYS THERE. The gap test asks that
            # the mark be set off from the text, and on page-081-L the
            # signature sits 51 px below its neighbour against a 56 px median
            # — closer than an ordinary line. Four columns of 63-102 failed to
            # pair for this (069-L, 073-R, 081-L, 093-R), each with exactly
            # one line too many and each ending in a 24-69 px stub against a
            # ~1250 px measure. John: "can't we crop the printer's marks?"
            #
            # Rather than loosen the guard — which is where a real line gets
            # eaten — the count answers it. When the segmenter found MORE
            # lines than the transcription has, one of them is furniture by
            # arithmetic, and the width test says which.
            #
            # ⚠ THIS DOES NOT GUARANTEE `kept >= gt`, AND THE COMMENT HERE USED
            # TO SAY IT DID. The `stub and set_off and width` path below runs
            # whether or not there is a surplus, so a column with no surplus at
            # all can still lose an end. page-037-R in work/kraken is the live
            # case: body 61 against gt 61, surplus 0, and a foot of 81 px that
            # is stub, set off by 107 against an 82.5 median, and 81 px where
            # its text wants 726 — dropped, leaving kept 60. It quarantines,
            # which is the system working, but the promise was never true.
            # Found by Grok, 2026-08-18, reviewing the surplus change below.
            #
            # ⚠ THE FLAT `stub` FRACTION IS THE WEAKEST OF THE THREE TESTS and
            # on page-033-R it was the only one that failed: the running head
            # measures 267 px against a 263.2 px threshold, missing by 3.8 px,
            # while the text-width test called it furniture by 267 against 620.
            # So when the arithmetic already proves a line is surplus, the
            # width measured against THIS line's own transcription decides,
            # and the flat fraction of column width does not get a veto. With
            # no surplus nothing below changes: the test is `stub and set_off
            # and width` exactly as before.
            over = surplus > 0
            set_off = gap > _median(gaps) * 1.15
            if (stub or over) and (set_off or over) and \
                    (end['x1'] - end['x0']) < 0.5 * char_w * len(text):
                end['drop'] = True
                surplus -= 1

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

# ⚠ THE HOLDOUT IS A RULING, SO IT IS DATA AND NOT A CONSTANT.  It lived here as
# a literal until 2026-08-11, and that is one rerun away from losing a ruling:
# `stage_split` REWRITES holdout.txt from whatever this module believes, so the
# four columns John ruled out of round 4 — appended to that file by hand the day
# he ruled them — would have been written back into the training set in silence.
# The file is read at call time, it is outside every corpus tree, and it is the
# only statement of the holdout anywhere in the pipeline.
HOLDOUT_RULING = ROOT / 'work' / 'rulings' / 'kraken-holdout.json'

COLUMN_STEM = re.compile(r'^page-\d{3}-[LR]$')


class HoldoutError(Exception):
    """The holdout could not be established. Never a warning: see below."""


def holdout_columns(path: Path | None = None) -> list[str]:
    """The columns John has ruled out of training.

    ⚠ RAISES RATHER THAN RETURNING NOTHING.  An empty list here is not "nothing
    held out" — it is a training run with no independent evaluation at all, and
    a model scored against columns it was trained on reads as a triumph.  A
    missing file, an unreadable one, a name that is not a column stem and a
    duplicate are all refusals, because every one of them would otherwise arrive
    downstream as a shorter holdout and nothing else.
    """
    p = path or HOLDOUT_RULING
    if not p.exists():
        raise HoldoutError(f'the holdout ruling is missing: {p}')
    try:
        doc = json.loads(p.read_text(encoding='utf-8'))
    except ValueError as e:
        raise HoldoutError(f'{p} is not readable JSON: {e}') from e
    # Every malformed shape is a HoldoutError and not a TypeError, so a caller
    # cannot tell a broken ruling from an ordinary bug and continue past it.
    entries = doc.get('columns')
    if not isinstance(entries, list):
        raise HoldoutError(f'{p}: `columns` is {type(entries).__name__}, not a '
                           f'list')
    try:
        out = [str(e['column']) for e in entries]
    except (TypeError, KeyError) as e:
        raise HoldoutError(f'{p}: every entry needs a `column` — {e}') from e
    if not out:
        raise HoldoutError(f'{p} holds no columns — refusing to train with an '
                           f'empty holdout')
    bad = [c for c in out if not COLUMN_STEM.match(c)]
    if bad:
        raise HoldoutError(f'{p}: not column stems: {bad}')
    dupes = sorted({c for c in out if out.count(c) > 1})
    if dupes:
        raise HoldoutError(f'{p}: listed twice: {dupes}')
    return out


def refuse_holdout_in_training(train: list[str], where: str) -> None:
    """Stop dead if a held-out column has reached the training set.

    The mechanical refusal `batch4` makes for pages below 53, made here for the
    columns John ruled out: the note in HOLDOUT-53-62.md asks for exactly this,
    *"not trust this note"*.  It is checked against the ruling on disk at the
    moment of use, so it holds even if train.txt was written by an older build,
    edited by hand, or produced by a `split` that never read the ruling.

    ⚠ MATCHED WITHOUT REGARD TO CASE, because the file system is.  Grok found
    it: `page-055-l` in a hand-edited train.txt slips past an exact-string test,
    and then `ketos compile ../gt/page-055-l.xml` opens the real held-out column
    on this machine's case-insensitive volume.  The comparison has to be as
    loose as the thing that will resolve the name.
    """
    held = {c.casefold(): c for c in holdout_columns()}
    leaked = sorted({held[c.casefold()] for c in train
                     if c.casefold() in held})
    if leaked:
        raise HoldoutError(
            f'{where}: {len(leaked)} held-out column(s) are in the training '
            f'set — {leaked}. These are John\'s ruling '
            f'({HOLDOUT_RULING.relative_to(ROOT)}); training on them ends the '
            f'model\'s independence on the pages it is meant to be judged by.')


def check_partition(train: list[str], holdout: list[str],
                    usable: list[str]) -> None:
    """The two lists must divide the paired columns exactly.

    ⚠ THE ARITHMETIC IS PART OF THE GUARD, NOT A REPORT ON IT.  A split that
    drops a column loses it from training without saying so; a split that
    shares one trains on what it then evaluates against, and both read as a
    clean build from the printed counts.  Stated as an invariant here so it
    survives whatever the selection logic above it becomes.
    """
    both = sorted(set(train) & set(holdout))
    if both:
        raise HoldoutError(f'split is not a partition — in both lists: {both}')
    if sorted(train + holdout) != sorted(usable):
        lost = sorted(set(usable) - set(train) - set(holdout))
        extra = sorted((set(train) | set(holdout)) - set(usable))
        raise HoldoutError(
            f'split does not account for every paired column: {len(train)} + '
            f'{len(holdout)} against {len(usable)} paired'
            + (f'; in neither list: {lost}' if lost else '')
            + (f'; in no paired column: {extra}' if extra else ''))


def stage_split() -> int:
    reports = json.loads((WORK / 'pairing.json').read_text(encoding='utf-8'))
    ruled = holdout_columns()
    usable = [r['column'] for r in reports if r['match']]
    holdout = [c for c in ruled if c in usable]
    train = [c for c in usable if c not in set(holdout)]
    # ⚠ A HELD-OUT COLUMN THAT IS NOT IN THE CORPUS IS A REFUSAL, NOT A WARNING.
    # John ruled "pages 55 and 61 ENTIRE"; a quarantined half leaves the ruling
    # honoured in the weak sense (not trained on) and broken in the sense he
    # meant (scored on).  A printed ⚠ scrolls past in a build log — and the run
    # that quarantines a held-out column is exactly the run nobody is watching.
    # There is deliberately no override flag: the remedy is to fix the pairing
    # or to ask John to re-rule, and both of those are his call, not a switch.
    missing = sorted(set(ruled) - set(usable))
    if missing:
        raise HoldoutError(
            f'{len(missing)} held-out column(s) are not in this corpus — '
            f'{missing}. They are quarantined or unpaired, so the model cannot '
            f'be scored on them, and John ruled these pages held out ENTIRE. '
            f'Fix the pairing, or take the change back to him.')

    check_partition(train, holdout, usable)
    refuse_holdout_in_training(train, 'split')
    if not holdout:
        raise HoldoutError('no held-out column survived pairing — refusing to '
                           'write a training set with nothing to evaluate it')

    lines = {r['column']: r['kept'] - len(r['excluded']) for r in reports}
    (WORK / 'holdout.txt').write_text('\n'.join(holdout) + '\n')
    (WORK / 'train.txt').write_text('\n'.join(train) + '\n')
    print(f'paired:  {len(usable):>3} columns, '
          f'{sum(lines[c] for c in usable)} lines')
    print(f'train:   {len(train):>3} columns, {sum(lines[c] for c in train)} lines')
    print(f'holdout: {len(holdout):>3} columns, '
          f'{sum(lines[c] for c in holdout)} lines')
    print(f'reconciles: {len(train)} + {len(holdout)} = {len(usable)} ✓')
    return 0


def read_lists() -> dict[str, list[str]]:
    """train.txt and holdout.txt, checked against the ruling before use.

    ⚠ BOTH DIRECTIONS ARE CHECKED, NOT JUST THE LEAK.  The first version tested
    only whether a ruled column had got into train.txt, and Grok's review named
    what that leaves open: a holdout.txt trimmed back to the round-3 eight
    compiles happily, so the round-4 pages are neither trained on nor scored,
    and the evaluation is hollow while every printed count looks right.  The
    holdout list must BE the ruling — every ruled column this corpus holds, and
    nothing else.
    """
    lists = {}
    for name in ('train', 'holdout'):
        f = WORK / f'{name}.txt'
        if not f.exists():
            raise HoldoutError(f'{f} does not exist — run `split` first')
        cols = f.read_text().split()
        if not cols:
            raise HoldoutError(f'{f} is empty')
        lists[name] = cols

    refuse_holdout_in_training(lists['train'], f'compile ({WORK}/train.txt)')
    shared = sorted(set(lists['train']) & set(lists['holdout']))
    if shared:
        raise HoldoutError(f'train.txt and holdout.txt share {len(shared)} '
                           f'column(s): {shared}')

    ruled = set(holdout_columns())
    have = {p.stem for p in (WORK / 'gt').glob('page-*.xml')}
    want = ruled & have
    got = set(lists['holdout'])
    if got != want:
        raise HoldoutError(
            f'holdout.txt is not the ruling: '
            + (f'ruled but not held out: {sorted(want - got)}; ' if want - got
               else '')
            + (f'held out but not ruled: {sorted(got - want)}; ' if got - want
               else '')
            + f'({len(ruled)} ruled, {len(have)} columns in this corpus)')
    return lists


def stage_compile() -> int:
    """Compile both lists — the last gate before ketos sees a single line.

    ⚠ THE REFUSAL LIVES HERE AS WELL AS IN `split`, ON PURPOSE.  `split` writes
    the lists; `compile` is what hands them to ketos, and the two can be run
    days apart or not at all — round 3's train.txt was still on disk from a
    build made before John ruled.  Checking only where the file is written
    would leave every path that reuses an existing train.txt unguarded.
    """
    lists = read_lists()
    for name, cols in lists.items():
        print(f'compiling {name}: {len(cols)} columns')
        subprocess.run(
            ['ketos', 'compile', '-f', 'page', '-o', str(WORK / f'{name}.arrow'),
             *[f'../gt/{c}.xml' for c in cols]],
            check=True, cwd=WORK / 'cols')
    return stage_verify()


# --- verify -----------------------------------------------------------------

def gt_texts(cols: list[str]) -> Counter:
    """Every training line these columns contribute, as a multiset of text."""
    out: Counter = Counter()
    for c in cols:
        f = WORK / 'gt' / f'{c}.xml'
        if not f.exists():
            raise HoldoutError(f'{f} is missing — the list names a column this '
                               f'corpus does not have')
        for el in ET.parse(f).getroot().iter(f'{{{PAGE_NS}}}Unicode'):
            out[el.text or ''] += 1
    return out


def arrow_texts(path: Path) -> Counter:
    """Every line inside a compiled arrow, as a multiset of text.

    pyarrow is a hard requirement here and must not be made optional: this is
    the check on the only file training actually reads, and a check that skips
    itself when an import fails is worse than no check at all.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc

    if not path.exists():
        raise HoldoutError(f'{path} does not exist — run `compile` first')
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return Counter(row['text'] for row in table.column('lines').to_pylist())


def arrow_image_texts(path: Path) -> dict[str, str]:
    """sha256 of each line image -> the text printed on it.

    The leak message has to name the LINE, not a hash: a sha256 tells John that
    something is wrong and nothing about what, and this check exists to be read
    by him rather than by a machine.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc

    if not path.exists():
        raise HoldoutError(f'{path} does not exist — run `compile` first')
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return {hashlib.sha256(row['im']).hexdigest(): row['text']
            for row in table.column('lines').to_pylist()}


def arrow_images(path: Path) -> Counter:
    """Every line image inside a compiled arrow, as a multiset of sha256.

    ⚠ THE CONTAMINATION CLAIM BELONGS ON THE IMAGE, NOT THE TEXT, AND THIS IS
    WHY.  Two different lines can carry the same string — `b19.` is printed on
    page 47 and again on page 99 — so a text-only comparison cannot tell a
    held-out line from a training line that happens to read the same.  The
    pixels are what the model actually saw, and they are unique to the line.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc

    if not path.exists():
        raise HoldoutError(f'{path} does not exist — run `compile` first')
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return Counter(hashlib.sha256(row['im']).hexdigest()
                   for row in table.column('lines').to_pylist())


def stage_verify() -> int:
    """Prove the compiled arrows ARE the lists — the artifact, not a record of it.

    ⚠ THE GUARD ABOVE STOPS AT `ketos compile`, AND TRAINING DOES NOT GO THROUGH
    IT.  Grok's first finding, and it is the right one: `ketos train … train.arrow`
    never re-enters this module, so a stale arrow from a build made before John
    ruled would train on the held-out pages with every list on disk innocent.
    Checking a manifest would repeat the mistake this pipeline keeps making — a
    recorded stage is history, not an address — so the arrow itself is opened
    and its lines are matched against the ground truth of the columns the list
    names.

    Two statements, and the first is the one that matters:

      * NO LINE PRINTED ONLY ON A HELD-OUT COLUMN IS IN train.arrow.  That is
        contamination, stated directly rather than inferred from bookkeeping.
      * each arrow's lines are EXACTLY its list's lines, as a multiset.  Volume
        as well as verdict: an empty or truncated arrow cannot pass by having
        nothing wrong in it.
    """
    lists = read_lists()

    # ⚠ THE PARTITION IS RE-CHECKED HERE, NOT ONLY IN `split`.  Grok's finding
    # applied to the lists as well as the arrows: `check_partition` ran only
    # where the split was written, so a later train.txt with a column trimmed
    # out of it — plus arrows recompiled to match — verified perfectly while
    # quietly dropping that column from the corpus.  The arithmetic is part of
    # the guard, so it is asked again at the point the arrows are vouched for.
    #
    # A MISSING pairing.json IS A REFUSAL, NOT A SKIP.  Guarding this with
    # `if pairing.exists()` would mean the one arrangement that cannot be
    # checked is also the one that passes quietly — which is the shape of every
    # defect this pipeline has had.  Every real tree carries the report.
    pairing = WORK / 'pairing.json'
    if not pairing.exists():
        raise HoldoutError(
            f'{pairing} does not exist, so the split cannot be re-checked '
            f'against the paired columns — run `pair`. Verifying without it '
            f'would vouch for a partition nobody looked at.')
    reports = json.loads(pairing.read_text(encoding='utf-8'))
    check_partition(lists['train'], lists['holdout'],
                    [r['column'] for r in reports if r['match']])

    # Contamination first, because it is the direct statement and its message
    # names the line: a mismatch in the counts below is the same evidence read
    # as bookkeeping, and would otherwise be all John saw.
    #
    # ⚠ THE IMAGES ARE THE CLAIM.  The first version of this check built its
    # leak set with `gt_texts(holdout) - gt_texts(train)`, and Counter
    # subtraction DISCARDS every text the two share — so the lines hardest to
    # tell apart were the exact ones dropped before the test ran.  On the
    # 722-line holdout that silently reduced "no held-out line is in
    # train.arrow" to a statement about 720 of them, and a held-out image
    # substituted under a text that also occurs in training would have passed.
    # Hashing the pixels asks the question the sentence claims to ask.
    held_imgs = arrow_images(WORK / 'holdout.arrow')
    train_imgs = arrow_images(WORK / 'train.arrow')
    shared_imgs = set(held_imgs) & set(train_imgs)
    if shared_imgs:
        named = arrow_image_texts(WORK / 'holdout.arrow')
        first = sorted(shared_imgs, key=lambda h: named.get(h, ''))[0]
        raise HoldoutError(
            f'{len(shared_imgs)} held-out line IMAGE(S) are in train.arrow — '
            f'the model trained on pixels it is meant to be judged by. The '
            f'first is {named.get(first, "?")[:60]!r} (sha256 {first[:16]})')

    # The text statement is kept because it catches a different failure — a
    # stale arrow whose images are new but whose strings are old — but it now
    # says how much of the holdout it could speak for.  A check that cannot
    # distinguish two lines must report that, not round it up to a clean pass.
    held_texts, train_texts = gt_texts(lists['holdout']), gt_texts(lists['train'])
    held_only = held_texts - train_texts
    ambiguous = sum(held_texts.values()) - sum(held_only.values())
    in_train = arrow_texts(WORK / 'train.arrow')
    leaked = [t for t in held_only if t in in_train]
    if leaked:
        raise HoldoutError(
            f'{len(leaked)} line(s) printed only on a held-out column are in '
            f'train.arrow — the first is {leaked[0][:60]!r}')

    for name in ('train', 'holdout'):
        want = gt_texts(lists[name])
        got = arrow_texts(WORK / f'{name}.arrow')
        if got != want:
            missing = sum((want - got).values())
            extra = sum((got - want).values())
            raise HoldoutError(
                f'{name}.arrow does not match {name}.txt: '
                f'{sum(got.values())} lines compiled against '
                f'{sum(want.values())} in the {len(lists[name])} columns '
                f'listed ({missing} missing, {extra} unaccounted for). The '
                f'arrow is stale — recompile it.')

    print(f'train.arrow:   {sum(gt_texts(lists["train"]).values())} lines from '
          f'{len(lists["train"])} columns ✓')
    print(f'holdout.arrow: {sum(gt_texts(lists["holdout"]).values())} lines '
          f'from {len(lists["holdout"])} columns ✓')
    print(f'no held-out line IMAGE is in train.arrow ✓  '
          f'({len(held_imgs)} distinct holdout images checked against '
          f'{len(train_imgs)} training images)')
    print(f'no held-out line TEXT is in train.arrow ✓  ({len(held_only)} lines '
          f'are unique to the holdout and none of them is there'
          + (f'; {ambiguous} share a string with training and only the image '
             f'check speaks for them)' if ambiguous else ')'))
    return 0


# --- cli --------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('stage', choices=['cols', 'segment', 'pair', 'split',
                                     'compile', 'verify'])
    p.add_argument('--only', help="comma-separated column stems, e.g. page-020-L")
    p.add_argument('--device', default='mps')
    p.add_argument('--work', type=Path,
                   help='corpus tree to build in (default work/kraken); use a '
                        'second tree to keep two scans side by side')
    p.add_argument('--pages', type=Path,
                   help='directory of page-NNN.jpg images to split, instead of '
                        'rendering book.pdf at 600 PPI')
    # ⚠ THE RULING IS PER CORPUS TREE, AND THE REFUSAL IS WHY. `stage_split`
    # stops dead when a ruled column is not in the corpus, so pointing a
    # 63-102 tree at the 15-62 ruling raises for all twelve — correctly, since
    # that ruling says nothing about these pages. A second tree needs its own
    # ruling file, and naming it explicitly keeps the refusal meaningful
    # instead of teaching the check to shrug at a range mismatch.
    p.add_argument('--holdout', type=Path,
                   help='holdout ruling for THIS tree (default '
                        'work/rulings/kraken-holdout.json, which governs '
                        '15-62 and no other range)')
    args = p.parse_args(argv)

    global WORK, PAGES, HOLDOUT_RULING
    if args.work:
        WORK = args.work.resolve()
    PAGES = args.pages.resolve() if args.pages else None
    if args.holdout:
        HOLDOUT_RULING = args.holdout.resolve()

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
    elif args.stage == 'compile':
        return stage_compile()
    else:
        return stage_verify()
    return 0


if __name__ == '__main__':
    sys.exit(main())
