"""Recrop Bonitz page scans so hanging headword letters stay inside the crop.

Kraken's left crop edge from ``split_columns.split_page`` sits on the dense
body core. Outdent entry-initial letters (the hanging first letter of a
headword) therefore sit at x≈0 of the crop or just outside it, and the
recogniser drops them (ἀναίδεια → ναίδεια).

This module keeps split_page's right/top/bottom, and moves only the LEFT
edge further left when hang letters are measured left of the body core.

Algorithm (from work/kraken400/read/recrop-outdent-report.json method field):

  - split_columns defaults (threshold=180, pad_frac=0.006) for right/top/bottom
  - dense body core = left edge of the smooth>0.08 column band
  - outdent letters = vertical-OR ink runs of width 15–80 that start 25–100 px
    left of the body core and end within 45 px of that core, on rows that
    have body text
  - new_left = min(old_left, p5(starts) − 40) when ≥5 hangs are found
  - fallback when <5 hangs: if old first_ink(thr=128) < 15, extend to
    body_left − 70 − 40; else keep old_left

Ink threshold for hang detection is 128 (same thr named for first_ink in the
method string). Vertical-OR uses a ±2 row morphological OR so letter stems
do not break into multiple short runs.

Usage:
    python -m bonitz_pipeline.recrop_outdent --pages 63-91 \\
        --src-dir work/scan400 --out-dir work/kraken400/read/cols \\
        --report work/kraken400/read/prep-063-091-recrop.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from bonitz_pipeline.split_columns import _bands, _column_bands, _row_extent

# split_page defaults
SPLIT_THRESHOLD = 180
PAD_FRAC = 0.006

# Hang detection (method field + first_ink thr)
HANG_INK_THR = 128
VOR_RADIUS = 2
HANG_W_LO, HANG_W_HI = 15, 80
HANG_START_LO, HANG_START_HI = 25, 100
HANG_END_GAP_MAX = 45
HANG_MIN = 5
OUTDENT_PAD = 40
FALLBACK_HANG_W = 70  # body − 70 used as synthetic outdent when unmeasured
FIRST_INK_THR = 128
FIRST_INK_TIGHT = 15


def _body_lefts(gray: np.ndarray, threshold: int = SPLIT_THRESHOLD) -> tuple[int, int]:
    """Left edge of each dense body core (smooth > 0.08 band)."""
    h, w = gray.shape
    body = gray[int(h * 0.15):int(h * 0.85)]
    profile = (body < threshold).mean(axis=0)
    win = max(1, int(w * 0.002))
    smooth = np.convolve(profile, np.ones(win) / win, mode='same')
    bands = _bands(smooth > 0.08, min_gap=int(w * 0.01))
    wide = [b for b in bands if (b[1] - b[0]) > w * 0.25]
    if len(wide) != 2:
        raise ValueError(
            f'expected 2 wide column cores, found {len(wide)}: {wide}')
    return wide[0][0], wide[1][0]


def _split_boxes(
    gray: np.ndarray,
    *,
    threshold: int = SPLIT_THRESHOLD,
    pad_frac: float = PAD_FRAC,
) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    """Return (left_box, right_box) as (x0, y0, x1, y1) in page coords."""
    h, w = gray.shape
    pad_x, pad_y = int(w * pad_frac), int(h * pad_frac)
    (lx0, lx1), (rx0, rx1) = _column_bands(gray, threshold)
    boxes = []
    for x0, x1 in ((lx0, lx1), (rx0, rx1)):
        y0, y1 = _row_extent(gray, x0, x1, threshold)
        boxes.append((
            max(0, x0 - pad_x),
            max(0, y0 - pad_y),
            min(w, x1 + pad_x),
            min(h, y1 + pad_y),
        ))
    return boxes[0], boxes[1]


def _vertical_or(ink: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return ink
    out = ink.copy()
    for dy in range(1, radius + 1):
        out[:-dy] |= ink[dy:]
        out[dy:] |= ink[:-dy]
    return out


def _first_ink_x(gray: np.ndarray, box: tuple[int, int, int, int],
                thr: int = FIRST_INK_THR) -> int:
    x0, y0, x1, y1 = box
    cols = np.where((gray[y0:y1, x0:x1] < thr).any(axis=0))[0]
    return int(cols[0]) if len(cols) else 10**9


def _left40_ink(gray: np.ndarray, box: tuple[int, int, int, int],
               thr: int = FIRST_INK_THR) -> int:
    x0, y0, x1, y1 = box
    return int((gray[y0:y1, x0:min(x0 + 40, x1)] < thr).sum())


def _hang_starts(
    gray: np.ndarray,
    body_left: int,
    y0: int,
    y1: int,
    *,
    ink_thr: int = HANG_INK_THR,
    vor_radius: int = VOR_RADIUS,
) -> tuple[list[int], list[int]]:
    """Return (starts, hang_widths) for qualifying outdent letter runs."""
    ink = _vertical_or(gray < ink_thr, vor_radius)
    h, w = ink.shape
    # Rows that have body text: any ink in the dense core strip.
    bx1 = min(w, body_left + 500)
    if bx1 <= body_left:
        return [], []
    dens = ink[y0:y1, body_left:bx1].mean(axis=1)

    starts: list[int] = []
    widths: list[int] = []
    for i, y in enumerate(range(y0, y1)):
        if dens[i] <= 0:
            continue
        row = ink[y].astype(np.uint8)
        d = np.diff(row, prepend=0, append=0)
        ss = np.flatnonzero(d == 1)
        ee = np.flatnonzero(d == -1)
        for s, e in zip(ss.tolist(), ee.tolist()):
            rw = e - s
            if not (HANG_W_LO <= rw <= HANG_W_HI):
                continue
            left_of = body_left - s
            if not (HANG_START_LO <= left_of <= HANG_START_HI):
                continue
            # end within 45 px of core (exclusive end left of or at core)
            gap = body_left - e
            if not (0 <= gap <= HANG_END_GAP_MAX):
                continue
            starts.append(s)
            widths.append(left_of)
    return starts, widths


def recrop_column(
    gray: np.ndarray,
    old_box: tuple[int, int, int, int],
    body_left: int,
) -> dict:
    """Compute the outdent-adjusted crop for one column.

    Returns a report dict with mode, box, and diagnostic fields.
    """
    old_left, old_top, old_right, old_bot = old_box
    starts, hang_ws = _hang_starts(gray, body_left, old_top, old_bot)
    n_hangs = len(starts)

    old_first = _first_ink_x(gray, old_box)
    old_l40 = _left40_ink(gray, old_box)

    if n_hangs >= HANG_MIN:
        mode = 'measured'
        outdent_left = int(np.percentile(starts, 5))
        hang_p95 = int(np.percentile(hang_ws, 95))
        new_left = min(old_left, outdent_left - OUTDENT_PAD)
        room = outdent_left - new_left
        note = None
    else:
        mode = 'fallback'
        hang_p95 = FALLBACK_HANG_W
        outdent_left = body_left - FALLBACK_HANG_W
        if old_first < FIRST_INK_TIGHT:
            # extend to body-70-40
            new_left = min(old_left, body_left - FALLBACK_HANG_W - OUTDENT_PAD)
            note = 'extended to body-70-40 (first_ink<15)'
        else:
            new_left = old_left
            note = 'kept old_left (first_ink>=15)'
        room = outdent_left - new_left if new_left <= outdent_left else None

    new_left = max(0, int(new_left))
    new_box = (new_left, old_top, old_right, old_bot)
    new_first = _first_ink_x(gray, new_box)
    new_l40 = _left40_ink(gray, new_box)

    return {
        'mode': mode,
        'n_hangs': n_hangs,
        'body_left': int(body_left),
        'outdent_left': int(outdent_left),
        'hang_p95': int(hang_p95),
        'old_left': int(old_left),
        'new_left': int(new_left),
        'extra': int(old_left - new_left),
        'room': int(room) if room is not None else None,
        'box': list(new_box),
        'old_first': int(old_first) if old_first < 10**8 else None,
        'old_l40': int(old_l40),
        'new_first': int(new_first) if new_first < 10**8 else None,
        'new_l40': int(new_l40),
        **({'note': note} if note else {}),
    }


def recrop_page(
    src: Path,
    out_dir: Path | None = None,
    *,
    write: bool = True,
    fmt: str = 'png',
) -> list[dict]:
    """Recrop one page into L/R columns. Returns two report dicts."""
    img = Image.open(src)
    gray = np.array(img.convert('L'))
    left_box, right_box = _split_boxes(gray)
    bl_l, bl_r = _body_lefts(gray)

    rows = []
    for side, old_box, body_left in (
        ('L', left_box, bl_l),
        ('R', right_box, bl_r),
    ):
        info = recrop_column(gray, old_box, body_left)
        stem = f'{src.stem}-{side}'
        info['stem'] = stem
        if write:
            if out_dir is None:
                raise ValueError('out_dir required when write=True')
            out_dir.mkdir(parents=True, exist_ok=True)
            x0, y0, x1, y1 = info['box']
            crop = img.convert('RGB').crop((x0, y0, x1, y1))
            out_path = out_dir / f'{stem}.{fmt}'
            if fmt == 'png':
                crop.save(out_path)
            else:
                dpi = img.info.get('dpi', (400, 400))
                crop.save(out_path, dpi=dpi)
            info['path'] = str(out_path)
        rows.append(info)
    return rows


def _parse_pages(spec: str) -> list[int]:
    a, _, b = spec.partition('-')
    lo = int(a)
    hi = int(b or a)
    return list(range(lo, hi + 1))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--pages', default='63-91')
    p.add_argument('--src-dir', type=Path, default=Path('work/scan400'))
    p.add_argument('--out-dir', type=Path, default=Path('work/kraken400/read/cols'))
    p.add_argument('--report', type=Path, default=None)
    p.add_argument('--fmt', default='png', choices=('png', 'tif'))
    p.add_argument('--dry-run', action='store_true',
                   help='compute boxes only, do not write images')
    p.add_argument('--refuse-overwrite-below', type=int, default=63,
                   help='refuse to write stems for page numbers < this (blast radius)')
    args = p.parse_args(argv)

    pages = _parse_pages(args.pages)
    columns: list[dict] = []
    for page in pages:
        if page < args.refuse_overwrite_below and not args.dry_run:
            print(f'REFUSE page-{page:03d}: below overwrite floor '
                  f'{args.refuse_overwrite_below}', file=sys.stderr)
            return 2
        src = args.src_dir / f'page-{page:03d}.jpg'
        if not src.exists():
            print(f'missing {src}', file=sys.stderr)
            return 1
        rows = recrop_page(src, args.out_dir, write=not args.dry_run, fmt=args.fmt)
        for r in rows:
            columns.append(r)
            print(f"{r['stem']}: mode={r['mode']} n_hangs={r['n_hangs']} "
                  f"box={r['box']} extra={r['extra']}")

    report = {
        'method': (
            'split_columns.split_page defaults (threshold=180, pad_frac=0.006) for '
            'right/top/bottom; LEFT edge only moved left. Outdent letters detected as '
            'vertical-OR ink runs of width 15-80 that start 25-100px left of the dense '
            'body core (smooth>0.08 band) and end within 45px of that core, on rows that '
            'have body text. new_left = min(old_left, p5(starts)-40). Fallback when <5 '
            'hangs: if old first_ink(thr=128)<15 extend to body-70-40, else keep old_left.'
        ),
        'source': str(args.src_dir / 'page-NNN.jpg'),
        'hang_ink_thr': HANG_INK_THR,
        'vor_radius': VOR_RADIUS,
        'pages': args.pages,
        'columns': columns,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + '\n',
            encoding='utf-8')
        print(f'wrote {args.report}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
