"""
Column splitter for Bonitz Index Aristotelicus page images.

Takes a pdftoppm-rendered TIFF of a single page and produces two output TIFFs,
one per column, with outer margins trimmed.  No external tools required.

Usage (CLI):
    python -m bonitz_pipeline.split_columns page-015.tif --out /tmp/cols/

    Produces:  page-015-L.tif  page-015-R.tif

Algorithm:
    1. Convert to grayscale and binarize at a fixed threshold.
    2. Compute per-pixel-column darkness profile (fraction of dark pixels)
       and find contiguous "text bands" along x.
    3. Take the two WIDEST bands as the columns — this drops the narrow
       gutter line-number strip (5,10,15…) and marginal noise entirely.
    4. Within each column's x-range, compute the row profile and drop
       isolated short blocks at the very top (running head / section
       letter) and very bottom (printer's signature), cropping to the
       body text extent plus a small pad.
    5. Write output TIFFs preserving original DPI metadata.

Limitations:
    - Assumes portrait orientation and two approximately equal columns.
    - Does NOT correct skew; apply pdftoppm -r 600 on a well-scanned PDF and
      skew is typically < 0.5° which is acceptable for OCR.
    - For severely skewed pages, run through ScanTailor first.
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

from PIL import Image
import numpy as np


def _bands(mask: np.ndarray, min_gap: int) -> list[tuple[int, int]]:
    """Contiguous True-runs in a 1-D bool mask, merging runs separated by < min_gap."""
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return []
    splits = np.flatnonzero(np.diff(idx) > min_gap)
    starts = np.r_[idx[0], idx[splits + 1]]
    ends   = np.r_[idx[splits], idx[-1]]
    return list(zip(starts.tolist(), (ends + 1).tolist()))


def _column_bands(gray: np.ndarray, threshold: int) -> tuple[tuple[int, int], tuple[int, int]]:
    """
    Find the x-extents of the two text columns.

    Profiles darkness over the middle 70% of page height (skipping the running
    head and signature), takes contiguous dark bands, and returns the two
    widest — which drops the narrow gutter line-number strip and edge noise.
    """
    h, w = gray.shape
    body = gray[int(h * 0.15):int(h * 0.85)]
    profile = (body < threshold).mean(axis=0)
    win = max(1, int(w * 0.002))
    smooth = np.convolve(profile, np.ones(win) / win, mode='same')
    # Column CORES: dense ink well above the gutter digit strip (~0.02-0.06).
    bands = _bands(smooth > 0.08, min_gap=int(w * 0.01))
    wide = [b for b in bands if (b[1] - b[0]) > w * 0.25]
    if len(wide) != 2:
        raise ValueError(
            f"expected 2 wide column bands, found {len(wide)} "
            f"(all bands: {[(s, e) for s, e in bands]})")
    # Outer edges: extend to the sparse hanging outdent of entry-initial
    # lemmata. A simple ink-walk fails on the dips BETWEEN outdent letter
    # stems, so instead take low-threshold ink bands merged across small
    # gaps and use the edge of the band that contains each core.
    (lx0, lx1), (rx0, rx1) = wide
    # full-height profile: an entry-initial outdent near the very top or
    # bottom of the page is invisible to the body-band profile above
    profile_full = (gray < threshold).mean(axis=0)
    smooth_full = np.convolve(profile_full, np.ones(win) / win, mode='same')
    low_bands = _bands(smooth_full > 0.004, min_gap=int(w * 0.01))
    lo, hi = lx0, rx1
    for s, e in low_bands:
        if s <= lx0 < e:
            lo = s
        if s < rx1 <= e:
            hi = e
    # Inner edges: the gutter line-number strip can overlap in x with the
    # right column's lemma outdents, so no x-cut can exclude the digits
    # while keeping the outdents. Split at the gutter darkness valley; the
    # digits land in one crop and are handled downstream (reader prompts
    # ignore marginal line numbers; the normalizer strips strays).
    valley = lx1 + int(smooth[lx1:rx0 + 1].argmin()) if rx0 > lx1 else lx1
    return (lo, valley), (valley, hi)


def _row_extent(gray: np.ndarray, x0: int, x1: int, threshold: int) -> tuple[int, int]:
    """
    Vertical extent of the column BODY within x-range [x0, x1).

    Drops isolated blocks at the very top (running head, section letter,
    top rule) and bottom (printer's signature) when they are short and
    separated from the body by a clear gap.
    """
    h = gray.shape[0]
    profile = (gray[:, x0:x1] < threshold).mean(axis=1)
    mask = profile > 0.004
    blocks = _bands(mask, min_gap=int(h * 0.008))
    if not blocks:
        raise ValueError("empty column")
    # Body = tallest block; absorb neighbors unless they are short, far
    # from the body, and near the page edge (head/signature).
    body_i = max(range(len(blocks)), key=lambda i: blocks[i][1] - blocks[i][0])
    top, bot = blocks[body_i]
    for s, e in blocks[:body_i]:
        short = (e - s) < h * 0.04
        near_edge = s < h * 0.12
        if not (short and near_edge):
            top = min(top, s)
    for s, e in blocks[body_i + 1:]:
        short = (e - s) < h * 0.04
        near_edge = e > h * 0.92
        if not (short and near_edge):
            bot = max(bot, e)
    return top, bot


def split_page(
    src: Path,
    out_dir: Path,
    *,
    pad_frac: float = 0.006,
    threshold: int  = 180,
) -> tuple[Path, Path]:
    """
    Split one page TIFF into left and right column TIFFs.

    Returns (left_path, right_path).
    """
    img = Image.open(src)
    dpi = img.info.get('dpi', (600, 600))
    gray = np.array(img.convert('L'))
    h, w = gray.shape
    pad_x, pad_y = int(w * pad_frac), int(h * pad_frac)

    (lx0, lx1), (rx0, rx1) = _column_bands(gray, threshold)
    crops = []
    for x0, x1 in ((lx0, lx1), (rx0, rx1)):
        y0, y1 = _row_extent(gray, x0, x1, threshold)
        crops.append(img.convert('RGB').crop((
            max(0, x0 - pad_x), max(0, y0 - pad_y),
            min(w, x1 + pad_x), min(h, y1 + pad_y),
        )))
    left_crop, right_crop = crops

    stem = src.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    left_path  = out_dir / f"{stem}-L.tif"
    right_path = out_dir / f"{stem}-R.tif"

    save_kw = dict(compression='tiff_lzw', dpi=dpi)
    left_crop.save(left_path,  **save_kw)
    right_crop.save(right_path, **save_kw)
    return left_path, right_path


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Split Bonitz page TIFF into left/right columns")
    p.add_argument('src', type=Path, help="Input page TIFF")
    p.add_argument('--out', type=Path, default=None,
                   help="Output directory (default: same dir as src)")
    p.add_argument('--threshold', type=int, default=180,
                   help="Darkness threshold 0-255 (default 180)")
    args = p.parse_args(argv)

    out_dir = args.out or args.src.parent
    left, right = split_page(args.src, out_dir, threshold=args.threshold)
    print(f"Left  → {left}")
    print(f"Right → {right}")


if __name__ == '__main__':
    main()
