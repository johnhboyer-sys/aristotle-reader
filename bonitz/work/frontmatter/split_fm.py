"""Column crops for the three front-matter tables. NOT a general splitter.

`bonitz_pipeline.split_columns` is tuned for the index proper, where both
columns run the full measure and ink density over the middle 70% of the page
clears 0.08. The front matter does not look like that: printed VIII fills only
the top third, and the work key is a narrow band in the middle of an otherwise
blank leaf. The shared splitter RAISES on both, which is right — it refuses to
guess. Widening its thresholds to admit these three pages would put the 76
index columns at risk for the sake of three leaves, so this is separate.

⚠ THE INTRA-COLUMN GAP IS THE TRAP. Each half of the work key is a siglum
column and a title column with white between them. Split on "widest ink bands"
and the sigla become their own crop, which is the one failure that would
silently cost us the whole point of the page. So the gap that may be crossed is
measured from THIS page — every run of white inside the text bbox — and the
gutter is taken as the widest of them, with the runners-up printed so a wrong
choice is visible rather than assumed.

Writes cols/<page>-{L,R}.png and a check/<page>-boxes.png overlay to be looked
at before anything reads the crops.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
INK = 0.004          # a row/column counts as text at this ink fraction


def threshold(gray: np.ndarray, margin: float = 0.01) -> int:
    """The darkest cut that still admits all the type, found from the page.

    ⚠ TWO SOURCES, TWO GROUNDS, AND A CONSTANT CANNOT SERVE BOTH. The reprint
    renders on clean white and a fixed 180 separates ink from ground perfectly;
    that is what this first used. The archive.org scan of the 1870 original is
    toned paper with show-through from the verso, and at 180 the whole leaf is
    "ink" — one solid run, no gutter. Otsu is no better here: it lands at 163 on
    printed VII and lets the show-through and the dark scan edge in, which
    produced a "gutter" 206px wide at x=2901, i.e. the outer margin.

    So the criterion is one the page can answer: SET TYPE NEVER REACHES THE
    LEAF EDGE. Walk the threshold up while the inked span stays clear of both
    borders, and stop at the last value that does. On printed VII that keeps
    every threshold to 120 (span 145-2793 of 3042) and rejects 140, where the
    span starts at 0 because the scanner edge has joined in.

    Returns the highest safe cut, so as much genuine ink as possible is kept.
    """
    w = gray.shape[1]
    keep_out = max(2, int(w * margin))
    best = None
    for thr in range(60, 210, 5):
        xs = np.flatnonzero((gray < thr).mean(axis=0) > INK)
        if xs.size == 0:
            continue
        if xs[0] < keep_out or xs[-1] > w - 1 - keep_out:
            break
        best = thr
    if best is None:
        raise ValueError('no threshold leaves the type clear of the leaf edge')
    return best


def _runs(mask: np.ndarray, min_gap: int = 1) -> list[tuple[int, int]]:
    """(start, end) of every True run, merging runs closer than `min_gap`."""
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return []
    brk = np.flatnonzero(np.diff(idx) > min_gap)
    starts = np.r_[idx[0], idx[brk + 1]]
    ends = np.r_[idx[brk], idx[-1]] + 1
    return list(zip(starts.tolist(), ends.tolist()))


def analyse(gray: np.ndarray) -> dict:
    thr = threshold(gray)
    dark = gray < thr
    # ⚠ MERGE ACROSS THE LEADING. Un-merged, a run of inked rows breaks at every
    # white line between two lines of type, so the "text block" comes out as one
    # paragraph — 426px of a 2300px block on printed VII, which is what this
    # first produced. The gap to cross is the leading, never the gap between the
    # heading and the table, so it is bounded well under a printed line's pitch.
    line_gap = int(gray.shape[0] * 0.008)
    rows = _runs(dark.mean(axis=1) > INK, min_gap=line_gap)
    if not rows:
        raise ValueError('no text rows on this page')
    # The text block is the tallest run of inked rows; the leaf number and
    # scanner speckle at the head are shorter and are dropped by taking the max.
    y0, y1 = max(rows, key=lambda r: r[1] - r[0])

    band = dark[y0:y1]
    cols = _runs(band.mean(axis=0) > INK)
    if len(cols) < 2:
        raise ValueError(f'expected at least 2 ink runs across, got {len(cols)}')
    x0, x1 = cols[0][0], cols[-1][1]

    # Every white gap inside the text, widest first. The gutter is the widest;
    # the rest are intra-column and MUST NOT be split on.
    gaps = sorted(((b[0] - a[1], a[1], b[0]) for a, b in zip(cols, cols[1:])),
                  reverse=True)
    if not gaps:
        raise ValueError('one solid ink run — no gutter to split on')
    return {'y0': y0, 'y1': y1, 'x0': x0, 'x1': x1, 'gaps': gaps,
            'n_runs': len(cols), 'threshold': thr}


def split(src: Path, out_cols: Path, out_check: Path, pad: int = 24) -> dict:
    im = Image.open(src)
    gray = np.array(im.convert('L'))
    a = analyse(gray)
    width, mid_a, mid_b = a['gaps'][0]
    cut = (mid_a + mid_b) // 2
    h, w = gray.shape

    boxes = {
        'L': (max(0, a['x0'] - pad), max(0, a['y0'] - pad),
              cut, min(h, a['y1'] + pad)),
        'R': (cut, max(0, a['y0'] - pad),
              min(w, a['x1'] + pad), min(h, a['y1'] + pad)),
    }
    out_cols.mkdir(parents=True, exist_ok=True)
    out_check.mkdir(parents=True, exist_ok=True)
    for side, box in boxes.items():
        im.crop(box).save(out_cols / f'{src.stem}-{side}.png', dpi=(400, 400))

    check = im.convert('RGB')
    d = ImageDraw.Draw(check)
    for box in boxes.values():
        d.rectangle(box, outline=(200, 30, 30), width=9)
    d.line([(cut, 0), (cut, h)], fill=(30, 90, 220), width=5)
    check.resize((check.width // 3, check.height // 3), Image.LANCZOS).save(
        out_check / f'{src.stem}-boxes.png')
    return {'cut': cut, 'gutter_px': width, 'boxes': boxes,
            'threshold': a['threshold'],
            'runner_up_gaps': [g[0] for g in a['gaps'][1:5]],
            'ink_runs': a['n_runs']}


def main() -> int:
    for name in sys.argv[1:]:
        src = HERE / 'pages' / f'{name}.tif'
        r = split(src, HERE / 'cols', HERE / 'check')
        print(f'{name}: cut={r['threshold']}, gutter {r["gutter_px"]}px at '
              f'x={r["cut"]}, {r["ink_runs"]} ink runs, next widest gaps '
              f'{r["runner_up_gaps"]}')
        for side, b in r['boxes'].items():
            print(f'   {side}  {b[2]-b[0]:>5}x{b[3]-b[1]:<5} at {b}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
