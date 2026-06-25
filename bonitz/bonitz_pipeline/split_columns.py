"""
Column splitter for Bonitz Index Aristotelicus page images.

Takes a pdftoppm-rendered TIFF of a single page and produces two output TIFFs,
one per column, with outer margins trimmed.  No external tools required.

Usage (CLI):
    python -m bonitz_pipeline.split_columns page-015.tif --out /tmp/cols/

    Produces:  page-015-L.tif  page-015-R.tif

Algorithm:
    1. Convert to grayscale.
    2. Binarize at a simple threshold (Otsu-style percentile).
    3. Compute per-pixel-column darkness profile (fraction of dark pixels).
    4. In the center 30-70% of page width, find the vertical strip with the
       lowest mean darkness — that is the inter-column gutter.
    5. Crop left and right column images, trimming top/bottom running-head
       bands (top 4%, bottom 3%) and outer left/right margins (3% each side).
    6. Write output TIFFs preserving original DPI metadata.

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


def _darkness_profile(arr: np.ndarray, threshold: int = 128) -> np.ndarray:
    """Return fraction of pixels darker than threshold for each pixel column."""
    binary = arr < threshold      # True = dark
    return binary.mean(axis=0)    # shape (width,)


def _find_gutter(profile: np.ndarray, page_w: int) -> int:
    """
    Find the x-coordinate of the inter-column gutter.
    Searches in the center 30–70% of page width for the minimum-darkness strip.
    Returns the x of the minimum.
    """
    lo = int(page_w * 0.30)
    hi = int(page_w * 0.70)
    center_profile = profile[lo:hi]
    # Smooth with a 1% window to avoid single-column noise
    win = max(1, int(page_w * 0.01))
    smoothed = np.convolve(center_profile, np.ones(win) / win, mode='same')
    gutter_x = lo + int(smoothed.argmin())
    return gutter_x


def split_page(
    src: Path,
    out_dir: Path,
    *,
    margin_top_frac: float    = 0.04,
    margin_bottom_frac: float = 0.03,
    margin_outer_frac: float  = 0.025,
    margin_inner_frac: float  = 0.005,
    threshold: int            = 180,
) -> tuple[Path, Path]:
    """
    Split one page TIFF into left and right column TIFFs.

    Returns (left_path, right_path).
    """
    img = Image.open(src)
    dpi = img.info.get('dpi', (600, 600))
    gray = np.array(img.convert('L'))
    h, w = gray.shape

    profile = _darkness_profile(gray, threshold)
    gutter_x = _find_gutter(profile, w)

    # Margin crops
    top    = int(h * margin_top_frac)
    bottom = h - int(h * margin_bottom_frac)
    outer  = int(w * margin_outer_frac)
    inner  = int(w * margin_inner_frac)

    left_crop  = img.convert('RGB').crop((outer,    top, gutter_x - inner, bottom))
    right_crop = img.convert('RGB').crop((gutter_x + inner, top, w - outer, bottom))

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
